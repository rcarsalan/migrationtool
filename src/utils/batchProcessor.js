const pLimit = require('p-limit');
const config = require('../config');
const logger = require('./logger');

async function processBatches(items, processFn, label = 'items') {
  const limit = pLimit(config.migration.concurrency);
  const batchSize = config.migration.batchSize;
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);

    logger.info(`Processing batch ${batchNum}/${totalBatches} (${batch.length} ${label})`);

    const promises = batch.map((item) =>
      limit(async () => {
        try {
          await processFn(item);
          results.success++;
        } catch (err) {
          results.failed++;
          const detail = err.response?.data ? ` — ${JSON.stringify(err.response.data)}` : '';
          const url = err.config?.url ? ` [${err.config.url}]` : '';
          results.errors.push({ item, error: err.message });
          logger.error(`Failed to process item: ${err.message}${url}${detail}`);
        }
      })
    );

    await Promise.all(promises);
  }

  return results;
}

module.exports = { processBatches };
