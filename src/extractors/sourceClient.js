const axios = require('axios');
const config = require('../config');
const { getCTPHeaders } = require('./ctpAuth');
const logger = require('../utils/logger');

// CTP uses offset-based pagination: { results, total, count, offset }
async function fetchPaginated(endpoint, params = {}) {
  const { projectKey, apiUrl } = config.ctp;
  const all = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const headers = await getCTPHeaders();
    const res = await axios.get(`${apiUrl}/${projectKey}${endpoint}`, {
      headers,
      params: { ...params, limit, offset },
      timeout: 30000,
    });

    const { results, total } = res.data;
    all.push(...results);
    offset += results.length;

    if (offset >= total || results.length === 0) break;
  }

  logger.info(`Fetched ${all.length} records from CTP${endpoint}`);
  return all;
}

module.exports = { fetchPaginated };
