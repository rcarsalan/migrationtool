const { getCTPCoreAttributes } = require('../extractors/schemaExtractor');
const { fetchExistingAttributes, createAttribute } = require('../loaders/schemaLoader');
const config = require('../config');
const logger = require('../utils/logger');

async function migrateSchema() {
  logger.info('=== Starting Schema Migration ===');

  // Phase 1 — Load CTP core product attribute definitions
  logger.info('--- Phase 1: CTP core product attributes ---');
  const ctpAttributes = getCTPCoreAttributes();
  logger.info(`Total CTP core attributes to process: ${ctpAttributes.length}`);
  ctpAttributes.forEach((attr) => {
    logger.info(`  • ${attr.id} (${attr.value_type}) — "${attr.display_name}"`);
  });

  if (config.migration.dryRun) {
    logger.info('--- Phase 2: SFCC comparison skipped (DRY RUN) ---');
    logger.info('--- Phase 3: Attribute creation skipped (DRY RUN) ---');
    logger.info('[DRY RUN] Would create/verify the following on SFCC Product:');
    ctpAttributes.forEach((attr) => {
      logger.info(`  [DRY RUN] c_${attr.id} — type: ${attr.value_type}`);
    });
    logger.info(`Schema migration done: ${ctpAttributes.length} success, 0 failed`);
    return { success: ctpAttributes.length, failed: 0 };
  }

  // Phase 2 — GET existing SFCC Product attribute definitions
  logger.info('--- Phase 2: Fetching existing SFCC Product attributes ---');
  let existingIds;
  try {
    existingIds = await fetchExistingAttributes('Product');
  } catch (err) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data || err.message);
    logger.error(`Failed to fetch SFCC attribute definitions (${status}: ${detail})`);
    return { success: 0, failed: ctpAttributes.length };
  }

  const alreadyExist = ctpAttributes.filter((attr) => existingIds.has(attr.id));
  const missing = ctpAttributes.filter((attr) => !existingIds.has(attr.id));

  if (alreadyExist.length > 0) {
    logger.info(`Already exist in SFCC (${alreadyExist.length}):`);
    alreadyExist.forEach((attr) => logger.info(`  ✓ c_${attr.id}`));
  }

  // Phase 3 — Create missing attributes
  logger.info(`--- Phase 3: Creating ${missing.length} missing attribute(s) in SFCC ---`);

  if (missing.length === 0) {
    logger.info('All CTP core attributes already exist in SFCC — no changes needed');
    return { success: ctpAttributes.length, failed: 0 };
  }

  let success = alreadyExist.length;
  let failed = 0;

  for (const attr of missing) {
    try {
      await createAttribute('Product', attr);
      success++;
    } catch (err) {
      const status = err.response?.status;
      const detail = JSON.stringify(err.response?.data || err.message);
      logger.warn(`Failed to create c_${attr.id} (${status}: ${detail})`);
      failed++;
    }
  }

  logger.info(`Schema migration done: ${success} success, ${failed} failed`);
  return { success, failed };
}

module.exports = { migrateSchema };
