const axios = require('axios');
const config = require('../config');
const { getSFCCHeaders } = require('./sfccAuth');
const { withRetry } = require('../utils/httpClient');
const logger = require('../utils/logger');

function ocapiUrl(path) {
  const { baseUrl, version, clientId } = config.sfcc;
  return `${baseUrl}/s/-/dw/data/${version}${path}?client_id=${encodeURIComponent(clientId)}`;
}

async function ensureInventoryList(inventoryList) {
  if (config.migration.dryRun) return;

  const headers = await getSFCCHeaders();
  await withRetry(
    () => axios.put(
      ocapiUrl(`/inventory_lists/${encodeURIComponent(inventoryList.id)}`),
      inventoryList,
      { headers }
    ),
    `ensure inventory list ${inventoryList.id}`
  );
  logger.info(`Inventory list ready: ${inventoryList.id}`);
}

async function upsertInventoryRecord(record, inventoryListId) {
  if (config.migration.dryRun) {
    logger.info(`[DRY RUN] Would upsert inventory: ${record.product_id}`);
    return;
  }

  const headers = await getSFCCHeaders();
  await withRetry(
    () => axios.put(
      ocapiUrl(`/inventory_lists/${encodeURIComponent(inventoryListId)}/product_inventory_records/${encodeURIComponent(record.product_id)}`),
      record,
      { headers }
    ),
    `upsert inventory ${record.product_id}`
  );
  logger.debug(`Inventory upserted: ${record.product_id}`);
}

module.exports = { ensureInventoryList, upsertInventoryRecord };
