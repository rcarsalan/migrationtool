const axios = require('axios');
const pRetry = require('p-retry');
const logger = require('./logger');
const config = require('../config');

function createClient(baseUrl, headers = {}) {
  const client = axios.create({ baseURL: baseUrl, headers, timeout: 30000 });

  client.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err.response?.status;
      const url = err.config?.url;
      const body = err.response?.data ? JSON.stringify(err.response.data) : '';
      logger.error(`HTTP ${status} on ${url}: ${err.message}${body ? ` — ${body}` : ''}`);
      return Promise.reject(err);
    }
  );

  return client;
}

async function withRetry(fn, label = 'request') {
  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (err) {
        const status = err.response?.status;
        // Do not retry 4xx — preserve original response on the abort error
        if (status && status >= 400 && status < 500) {
          const abort = new pRetry.AbortError(err.message);
          abort.response = err.response;
          throw abort;
        }
        throw err;
      }
    },
    {
      retries: config.migration.retryAttempts,
      minTimeout: config.migration.retryDelay,
      onFailedAttempt: (err) => {
        logger.warn(`${label} attempt ${err.attemptNumber} failed. Retrying... (${err.retriesLeft} left)`);
      },
    }
  );
}

module.exports = { createClient, withRetry };
