const axios = require('axios');
const config = require('../config');
const { withRetry } = require('../utils/httpClient');
const logger = require('../utils/logger');

const { getSFCCToken } = require('../loaders/sfccAuth');

async function getAMHeaders() {
  const token = await getSFCCToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-dw-client-id': config.sfcc.clientId,
  };
}

function metaUrl(path) {
  const { baseUrl, version } = config.sfcc;
  return `${baseUrl}/s/-/dw/data/${version}${path}`;
}

async function fetchSFCCAttributes(objectType) {
  const headers = await getAMHeaders();
  const url = metaUrl(`/system_object_definitions/${objectType}/attribute_definitions`);

  let res;
  try {
    res = await withRetry(
      () => axios.get(url, {
        headers,
        params: { count: 200 },
      }),
      `fetch ${objectType} attribute definitions`
    );
  } catch (err) {
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data || {});
    logger.error(`Schema fetch failed (${status}) for ${objectType}: ${body}`);
    logger.error(`URL attempted: ${url}`);
    throw err;
  }

  const defs = res.data.data || [];
  const ids = new Set(defs.map((d) => d.id));
  logger.info(`SFCC ${objectType}: ${ids.size} existing attributes found`);
  return ids;
}

function inferAttributeType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  return 'string';
}

async function createCustomAttribute(objectType, attributeId, sampleValue) {
  const headers = await getAMHeaders();
  const typeId = inferAttributeType(sampleValue);

  await withRetry(
    () => axios.put(
      metaUrl(`/system_object_definitions/${objectType}/attribute_definitions/${encodeURIComponent(attributeId)}`),
      {
        id: attributeId,
        type: { id: typeId },
        mandatory: false,
        searchable: false,
        externally_defined: false,
        externally_managed: false,
        order_required: false,
        display_name: { default: attributeId },
      },
      { headers }
    ),
    `create attribute ${attributeId} on ${objectType}`
  );

  logger.info(`Custom attribute created: ${objectType}.${attributeId} (type: ${typeId})`);
}

// Main function: collect unique attributes from transformed records,
// check which ones exist in SFCC, create any that are missing.
async function validateAndEnsureAttributes(objectType, transformedRecords, attributeKey = 'custom_attributes') {
  const candidateMap = new Map();
  for (const record of transformedRecords) {
    const attrs = record[attributeKey];
    if (!Array.isArray(attrs)) continue;
    for (const attr of attrs) {
      if (attr.attribute_id && !candidateMap.has(attr.attribute_id)) {
        candidateMap.set(attr.attribute_id, attr.value);
      }
    }
  }

  if (candidateMap.size === 0) {
    logger.info(`No custom attributes found for ${objectType} — skipping schema validation`);
    return;
  }

  logger.info(`Validating ${candidateMap.size} unique custom attributes for SFCC ${objectType}...`);

  let existingIds;
  try {
    existingIds = await fetchSFCCAttributes(objectType);
  } catch (err) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data || err.message);
    logger.warn(`Schema validation skipped — could not reach SFCC system_object_definitions (${status}: ${detail})`);
    logger.warn(`Custom attributes will be sent as-is. SFCC may reject records with undefined attributes.`);
    return;
  }

  const missing = [...candidateMap.entries()].filter(([id]) => !existingIds.has(id));

  if (missing.length === 0) {
    logger.info(`All ${objectType} attributes already exist in SFCC — no changes needed`);
    return;
  }

  logger.info(`Creating ${missing.length} missing custom attributes on SFCC ${objectType}...`);

  for (const [attributeId, sampleValue] of missing) {
    try {
      await createCustomAttribute(objectType, attributeId, sampleValue);
    } catch (err) {
      const status = err.response?.status;
      const detail = JSON.stringify(err.response?.data || err.message);
      logger.warn(`Could not create attribute ${objectType}.${attributeId} (${status}: ${detail}) — skipping`);
    }
  }

  logger.info(`Schema validation complete for ${objectType}`);
}

module.exports = { validateAndEnsureAttributes };
