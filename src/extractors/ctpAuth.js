const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

let tokenCache = { token: null, expiresAt: 0 };

async function getCTPToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const { clientId, clientSecret, authUrl, scopes } = config.ctp;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await axios.post(
    `${authUrl}/oauth/token`,
    `grant_type=client_credentials&scope=${encodeURIComponent(scopes)}`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, expires_in } = res.data;
  tokenCache = {
    token: access_token,
    expiresAt: Date.now() + (expires_in - 60) * 1000,
  };

  logger.info('Commercetools token obtained successfully');
  return access_token;
}

async function getCTPHeaders() {
  const token = await getCTPToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

module.exports = { getCTPToken, getCTPHeaders };
