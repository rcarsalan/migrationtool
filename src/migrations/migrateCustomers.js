const { extractCustomers } = require('../extractors/customersExtractor');
const { transformCustomer } = require('../transformers/customerTransformer');
const { upsertCustomer } = require('../loaders/customersLoader');
const { validateAndEnsureAttributes } = require('../validators/sfccSchemaValidator');
const { processBatches } = require('../utils/batchProcessor');
const config = require('../config');
const logger = require('../utils/logger');

async function migrateCustomers(_filterKey = null) {
  logger.info('=== Starting Customer Migration ===');
  const raw = await extractCustomers();
  const customers = raw.map(transformCustomer).filter((c) => c.email);

  if (!config.migration.dryRun) {
    logger.info('--- Schema Validation: Customers ---');
    await validateAndEnsureAttributes('Customer', customers);
  } else {
    logger.info('--- Schema Validation: skipped in DRY RUN ---');
  }

  const results = await processBatches(customers, upsertCustomer, 'customers');

  logger.info(`Customers done: ${results.success} success, ${results.failed} failed`);
  return results;
}

module.exports = { migrateCustomers };
