const axios = require('axios');
const { fetchPaginated } = require('./sourceClient');
const { getCTPHeaders } = require('./ctpAuth');
const config = require('../config');
const logger = require('../utils/logger');

async function extractProducts(filterKey = null) {
  if (filterKey) {
    logger.info(`Extracting single product from Commercetools (key: ${filterKey})...`);
    const { projectKey, apiUrl } = config.ctp;
    const headers = await getCTPHeaders();
    const res = await axios.get(`${apiUrl}/${projectKey}/products`, {
      headers,
      params: { where: `key="${filterKey}"`, expand: 'productType', limit: 1 },
      timeout: 30000,
    });
    const results = res.data.results || [];
    if (results.length === 0) {
      logger.warn(`No product found with key: ${filterKey}`);
    }
    return results;
  }

  logger.info('Extracting products from Commercetools...');
  // expand productType so we have attribute definitions available
  return fetchPaginated('/products', { expand: 'productType' });
}

async function extractCategories() {
  logger.info('Extracting categories from Commercetools...');
  return fetchPaginated('/categories');
}

async function extractInventory() {
  logger.info('Extracting inventory from Commercetools...');
  return fetchPaginated('/inventory');
}

module.exports = { extractProducts, extractCategories, extractInventory };
