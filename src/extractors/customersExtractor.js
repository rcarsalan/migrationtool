const { fetchPaginated } = require('./sourceClient');
const logger = require('../utils/logger');

async function extractCustomers() {
  logger.info('Extracting customers from source...');
  return fetchPaginated('/customers');
}

module.exports = { extractCustomers };
