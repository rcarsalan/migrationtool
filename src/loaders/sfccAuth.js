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

// BM User Grant — exchanges BM admin credentials + client_id for an OCAPI-capable token
// This is the correct token type for SFCC OCAPI Data API
async function fetchBMToken() {
  const { baseUrl, clientId, bmUsername, bmPassword } = config.sfcc;
  if (!bmUsername || !bmPassword) {
    throw new Error('SFCC_BM_USERNAME and SFCC_BM_PASSWORD are not set in config');
  }
  const credentials = Buffer.from(`${bmUsername}:${bmPassword}`).toString('base64');
  const res = await axios.post(
    `${baseUrl}/dw/oauth2/access_token?client_id=${encodeURIComponent(clientId)}`,
    `grant_type=urn:demandware:params:oauth:grant-type:client:credentials`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return res.data.access_token;
}

// AM endpoint with Basic auth — fallback for environments that accept AM tokens
async function fetchAMToken() {
  const { clientId, clientSecret, amAuthUrl } = config.sfcc;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await axios.post(
    amAuthUrl,
    `grant_type=urn:demandware:params:oauth:grant-type:client:credentials`,
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

  // Seed from env if cache is empty
  if (!tokenCache.token) {
    const { accessToken } = config.sfcc;
    if (accessToken) {
      tokenCache.token = accessToken;
      tokenCache.expiresAt = parseJwtExpiry(accessToken) || now + 1800000;
    }
  }

  // Token still valid (>60s) — use it
  if (tokenCache.token && now < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }

  // Token expired or not set — renew via BM User Grant (produces OCAPI-capable token)
  logger.info('SFCC token expired or not set — renewing via BM User Grant...');

  try {
    const fresh = await fetchBMToken();
    const exp = parseJwtExpiry(fresh) || now + 1800000;
    tokenCache = { token: fresh, expiresAt: exp };
    logger.info(`SFCC token renewed via BM User Grant. Valid for ${Math.round((exp - now) / 60000)} min.`);
    return tokenCache.token;
  } catch (bmErr) {
    logger.warn(`BM User Grant failed (${bmErr.message}) — trying AM fallback...`);
  }

  try {
    const fresh = await fetchAMToken();
    const exp = parseJwtExpiry(fresh) || now + 1800000;
    tokenCache = { token: fresh, expiresAt: exp };
    logger.info(`SFCC token renewed via AM. Valid for ${Math.round((exp - now) / 60000)} min.`);
    return tokenCache.token;
  } catch (amErr) {
    logger.warn(`AM fallback also failed (${amErr.message})`);
  }

  // Both failed — use existing token if any time left
  if (tokenCache.token) {
    const remaining = Math.max(0, Math.floor((tokenCache.expiresAt - now) / 1000));
    if (remaining > 0) {
      logger.warn(`Both renewal methods failed — using existing token (${remaining}s left)`);
      return tokenCache.token;
    }
  }

  throw new Error(
    'SFCC token expired and all renewal methods failed. ' +
    'Check SFCC_BM_USERNAME and SFCC_BM_PASSWORD in your config.'
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
