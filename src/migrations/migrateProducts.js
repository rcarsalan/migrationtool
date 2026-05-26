const { extractProducts, extractCategories } = require('../extractors/productsExtractor');
const { transformProduct, transformCategory } = require('../transformers/productTransformer');
const { upsertProduct, upsertCategory, assignProductToCategory } = require('../loaders/productsLoader');
const { validateAndEnsureAttributes } = require('../validators/sfccSchemaValidator');
const { processBatches } = require('../utils/batchProcessor');
const config = require('../config');
const logger = require('../utils/logger');

const CATALOG_ID = process.env.SFCC_CATALOG_ID || 'storefront-catalog-en';

async function migrateCategories(_filterKey = null) {
  logger.info('=== Starting Category Migration ===');
  const raw = await extractCategories();
  const categories = raw.map(transformCategory);

  const results = await processBatches(
    categories,
    (cat) => upsertCategory(cat, CATALOG_ID),
    'categories'
  );

  logger.info(`Categories done: ${results.success} success, ${results.failed} failed`);
  return results;
}

async function migrateProducts(filterKey = null) {
  logger.info('=== Starting Product Migration ===');

  // Phase 1 — Extract from Commercetools + Transform
  logger.info('--- Phase 1: Extracting products from Commercetools ---');
  const raw = await extractProducts(filterKey);
  const products = raw.map(transformProduct);
  logger.info(`Extracted and transformed ${products.length} product(s)`);

  // Phase 2 — Schema validation: GET existing SFCC attributes, PUT any missing ones
  if (!config.migration.dryRun) {
    logger.info('--- Phase 2: Schema validation (system_object_definitions v25_6) ---');
    await validateAndEnsureAttributes('Product', products);
  } else {
    logger.info('--- Phase 2: Schema validation skipped (DRY RUN) ---');
  }

  // Phase 3 — Upsert products into SFCC
  logger.info('--- Phase 3: Upserting products into SFCC ---');
  const results = await processBatches(
    products,
    async (product) => {
      await upsertProduct(product);
    },
    'products'
  );

  logger.info(`Products done: ${results.success} success, ${results.failed} failed`);
  return results;
}

module.exports = { migrateProducts, migrateCategories };
