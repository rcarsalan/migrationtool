require('dotenv').config();

module.exports = {
  ctp: {
    projectKey: process.env.CTP_PROJECT_KEY,
    clientId: process.env.CTP_CLIENT_ID,
    clientSecret: process.env.CTP_CLIENT_SECRET,
    authUrl: process.env.CTP_AUTH_URL,
    apiUrl: process.env.CTP_API_URL,
    scopes: process.env.CTP_SCOPES,
  },

  sfcc: {
    baseUrl: process.env.SFCC_BASE_URL,
    clientId: process.env.SFCC_CLIENT_ID,
    clientSecret: process.env.SFCC_CLIENT_SECRET,
    siteId: process.env.SFCC_SITE_ID || 'RefArch',
    version: process.env.SFCC_VERSION || 'v22_10',
    amAuthUrl: process.env.SFCC_AM_AUTH_URL || 'https://account.demandware.com/dwsso/oauth2/access_token',
    accessToken: process.env.SFCC_ACCESS_TOKEN || '',
  },

  migration: {
    batchSize: parseInt(process.env.BATCH_SIZE) || 50,
    concurrency: parseInt(process.env.CONCURRENCY) || 5,
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY_MS) || 2000,
    dryRun: process.env.DRY_RUN === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};
