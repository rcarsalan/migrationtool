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
  const raw = await extractProducts(filterKey);
  const products = raw.map(transformProduct);

  if (!config.migration.dryRun) {
    logger.info('--- Schema Validation: Products ---');
    await validateAndEnsureAttributes('Product', products);
  } else {
    logger.info('--- Schema Validation: skipped in DRY RUN ---');
  }

  const results = await processBatches(
    products,
    async (product) => {
      await upsertProduct(product);
      if (product.primary_category_id) {
        await assignProductToCategory(product.id, product.primary_category_id, CATALOG_ID);
      }
    },
    'products'
  );

  logger.info(`Products done: ${results.success} success, ${results.failed} failed`);
  return results;
}

module.exports = { migrateProducts, migrateCategories };
