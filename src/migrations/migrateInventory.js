const { extractInventory } = require('../extractors/productsExtractor');
const { transformInventoryRecord, transformInventoryList } = require('../transformers/inventoryTransformer');
const { ensureInventoryList, upsertInventoryRecord } = require('../loaders/inventoryLoader');
const { processBatches } = require('../utils/batchProcessor');
const logger = require('../utils/logger');

const INVENTORY_LIST_ID = process.env.SFCC_INVENTORY_LIST_ID || 'migrated-inventory';

async function migrateInventory(_filterKey = null) {
  logger.info('=== Starting Inventory Migration ===');

  const inventoryList = transformInventoryList(INVENTORY_LIST_ID, 'Migrated from source system');
  await ensureInventoryList(inventoryList);

  const raw = await extractInventory();
  const records = raw.map((item) => transformInventoryRecord(item, INVENTORY_LIST_ID));

  const results = await processBatches(
    records,
    (record) => upsertInventoryRecord(record, INVENTORY_LIST_ID),
    'inventory records'
  );

  logger.info(`Inventory done: ${results.success} success, ${results.failed} failed`);
  return results;
}

module.exports = { migrateInventory };
