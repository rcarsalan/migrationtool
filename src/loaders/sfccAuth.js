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

async function renewToken(currentToken) {
  const { clientId, clientSecret, amAuthUrl } = config.sfcc;
  const res = await axios.post(
    amAuthUrl,
    `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    {
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return res.data.access_token;
}

async function getSFCCToken() {
  const now = Date.now();

  // Use cached token if still valid (>60s left)
  if (tokenCache.token && now < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }

  const { accessToken } = config.sfcc;
  if (!accessToken) {
    throw new Error(
      'SFCC_ACCESS_TOKEN is not set. Paste your Bearer token in the Config page under "Access Token".'
    );
  }

  // If cache empty, seed from env token
  if (!tokenCache.token) {
    tokenCache.token = accessToken;
    tokenCache.expiresAt = parseJwtExpiry(accessToken) || now + 1800000;
  }

  // Try to renew if < 5 min left
  if (now >= tokenCache.expiresAt - 300000) {
    try {
      const renewed = await renewToken(tokenCache.token);
      const exp = parseJwtExpiry(renewed) || now + 1800000;
      tokenCache = { token: renewed, expiresAt: exp };
      logger.info('SFCC token renewed successfully');
    } catch (err) {
      logger.warn(`Token renewal failed: ${err.message} — using existing token`);
    }
  }

  return tokenCache.token;
}

async function getSFCCHeaders() {
  const token = await getSFCCToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-dw-client-id': config.sfcc.clientId,
  };
}

module.exports = { getSFCCToken, getSFCCHeaders };
