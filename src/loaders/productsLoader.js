const axios = require('axios');
const config = require('../config');
const { getSFCCHeaders } = require('./sfccAuth');
const { withRetry } = require('../utils/httpClient');
const { logProductDiff } = require('../utils/diffLogger');
const logger = require('../utils/logger');

const CATALOG_ID = process.env.SFCC_CATALOG_ID || 'storefront-catalog-en';

function ocapiUrl(path) {
  const { baseUrl, version, bmClientId } = config.sfcc;
  return `${baseUrl}/s/-/dw/data/${version}${path}?client_id=${encodeURIComponent(bmClientId)}`;
}

function toOcapiPayload(product) {
  const { custom_attributes, ...rest } = product;
  const payload = {
    ...rest,
    owning_catalog_id: CATALOG_ID,
  };
  if (Array.isArray(custom_attributes)) {
    for (const { attribute_id, value } of custom_attributes) {
      if (attribute_id) payload[`c_${attribute_id}`] = value;
    }
  }
  return payload;
}

async function upsertProduct(product) {
  if (config.migration.dryRun) {
    logProductDiff(product);
    return;
  }

  const headers = await getSFCCHeaders();
  const payload = toOcapiPayload(product);

  const customCount = product.custom_attributes?.length || 0;
  logger.info(`Upserting product: [${product.id}] "${product.name?.default || ''}"`);
  logger.info(`  catalog: ${CATALOG_ID} | online: ${product.online} | custom attributes: ${customCount}`);
  if (product.custom_attributes?.length) {
    const attrList = product.custom_attributes
      .map(({ attribute_id, value }) => `    • c_${attribute_id}: ${JSON.stringify(value)}`)
      .join('\n');
    logger.info(`  Custom Attributes:\n${attrList}`);
  }

  await withRetry(
    () => axios.put(ocapiUrl(`/products/${encodeURIComponent(product.id)}`), payload, { headers }),
    `upsert product ${product.id}`
  );
  logger.info(`Product saved to SFCC: ${product.id}`);
}

async function upsertCategory(category, catalogId) {
  if (config.migration.dryRun) {
    logger.info(`[DRY RUN] Would upsert category: ${category.id}`);
    return;
  }

  const headers = await getSFCCHeaders();
  await withRetry(
    () => axios.put(
      ocapiUrl(`/catalogs/${encodeURIComponent(catalogId)}/categories/${encodeURIComponent(category.id)}`),
      category,
      { headers }
    ),
    `upsert category ${category.id}`
  );
  logger.debug(`Category upserted: ${category.id}`);
}

async function assignProductToCategory(productId, categoryId, catalogId) {
  if (config.migration.dryRun) return;

  const headers = await getSFCCHeaders();
  await withRetry(
    () => axios.put(
      ocapiUrl(`/catalogs/${encodeURIComponent(catalogId)}/categories/${encodeURIComponent(categoryId)}/products/${encodeURIComponent(productId)}`),
      {},
      { headers }
    ),
    `assign product ${productId} to category ${categoryId}`
  );
}

module.exports = { upsertProduct, upsertCategory, assignProductToCategory };
