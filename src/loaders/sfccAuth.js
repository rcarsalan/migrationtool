const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

let tokenCache = { token: null, expiresAt: 0 };

function parseJwtExpiry(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

// BM User Grant using the well-known client ID (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
// Credentials = base64(bmUsername:bmPassword:bmClientId) — three-part colon-separated
async function fetchBMToken() {
  const { baseUrl, bmClientId, bmUsername, bmPassword } = config.sfcc;
  if (!bmUsername || !bmPassword) {
    throw new Error('SFCC_BM_USERNAME and SFCC_BM_PASSWORD are required');
  }
  const credentials = Buffer.from(`${bmUsername}:${bmPassword}:${bmClientId}`).toString('base64');
  const res = await axios.post(
    `${baseUrl}/dw/oauth2/access_token?client_id=${encodeURIComponent(bmClientId)}`,
    new URLSearchParams({
      grant_type: 'urn:demandware:params:oauth:grant-type:client-id:dwsid:dwsecuretoken',
      client_id: bmClientId,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return res.data.access_token;
}

async function getSFCCToken() {
  const now = Date.now();

  // Return cached token if more than 60s left
  if (tokenCache.token && now < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }

  // BM token expires in ~15 min — always renew via BM grant when expired
  logger.info('Renewing SFCC token via BM User Grant...');
  try {
    const fresh = await fetchBMToken();
    const exp = parseJwtExpiry(fresh) || now + 840000; // fallback 14 min
    tokenCache = { token: fresh, expiresAt: exp };
    logger.info(`SFCC token renewed. Valid for ${Math.round((exp - now) / 60000)} min.`);
    return tokenCache.token;
  } catch (err) {
    logger.warn(`BM User Grant failed: ${err.message}`);
  }

  // Use any remaining cached token as last resort
  if (tokenCache.token) {
    const remaining = Math.max(0, Math.floor((tokenCache.expiresAt - now) / 1000));
    if (remaining > 0) {
      logger.warn(`Using existing token (${remaining}s left)`);
      return tokenCache.token;
    }
  }

  throw new Error(
    'SFCC token expired and renewal failed. Check SFCC_BM_USERNAME, SFCC_BM_PASSWORD, and SFCC_BM_CLIENT_ID.'
  );
}

async function getSFCCHeaders() {
  const token = await getSFCCToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

module.exports = { getSFCCToken, getSFCCHeaders };
