const axios = require('axios');
const config = require('../config');
const { withRetry } = require('../utils/httpClient');
const logger = require('../utils/logger');
const { getSFCCToken } = require('../loaders/sfccAuth');

const PAGE_SIZE = 200;

async function getHeaders() {
  const token = await getSFCCToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function metaUrl(path) {
  const { baseUrl, metaVersion, bmClientId } = config.sfcc;
  return `${baseUrl}/s/-/dw/data/${metaVersion}${path}?client_id=${encodeURIComponent(bmClientId)}`;
}

// GET all existing attribute definitions for an object type (handles pagination)
async function fetchAllSFCCAttributes(objectType) {
  const headers = await getHeaders();
  const basePath = `/system_object_definitions/${objectType}/attribute_definitions`;
  const ids = new Set();
  let start = 0;
  let total = null;

  logger.info(`Fetching existing SFCC ${objectType} attribute definitions...`);

  do {
    const res = await withRetry(
      () => axios.get(metaUrl(basePath), {
        headers,
        params: { count: PAGE_SIZE, start },
      }),
      `fetch ${objectType} attributes (start=${start})`
    );

    const data = res.data;
    if (total === null) {
      total = data.total || 0;
      logger.info(`SFCC ${objectType}: ${total} total attribute definitions`);
    }

    const page = data.data || [];
    for (const attr of page) {
      ids.add(attr.id);
    }

    start += PAGE_SIZE;
  } while (start < total);

  logger.info(`SFCC ${objectType}: loaded ${ids.size} attribute IDs`);
  return ids;
}

function inferAttributeType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  return 'string';
}

// PUT — create a single custom attribute definition
async function createCustomAttribute(objectType, attributeId, sampleValue) {
  const headers = await getHeaders();
  const typeId = inferAttributeType(sampleValue);
  const path = `/system_object_definitions/${objectType}/attribute_definitions/${encodeURIComponent(attributeId)}`;

  await withRetry(
    () => axios.put(
      metaUrl(path),
      {
        id: attributeId,
        value_type: typeId,
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

  logger.info(`Created: ${objectType}.${attributeId} (type: ${typeId})`);
}

// Main entry point called by migrateProducts before upserting records.
// Flow:
//   1. GET all existing SFCC attributes (paginated)
//   2. Collect all attribute IDs needed by the transformed records
//   3. PUT any that are missing
async function validateAndEnsureAttributes(objectType, transformedRecords, attributeKey = 'custom_attributes') {
  // Step 1 — GET existing attributes from SFCC
  let existingIds;
  try {
    existingIds = await fetchAllSFCCAttributes(objectType);
  } catch (err) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data || err.message);
    logger.warn(`Schema validation skipped — GET system_object_definitions failed (${status}: ${detail})`);
    logger.warn('Products will be sent as-is. SFCC may reject records with undefined custom attributes.');
    return;
  }

  // Step 2 — Collect all unique attribute IDs needed from CTP-transformed data
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
    logger.info(`No custom attributes to validate for ${objectType}`);
    return;
  }

  logger.info(`${objectType}: ${candidateMap.size} unique custom attributes needed from CTP data`);

  // Step 3 — Diff and PUT missing attributes
  const missing = [...candidateMap.entries()].filter(([id]) => !existingIds.has(id));

  if (missing.length === 0) {
    logger.info(`All ${objectType} custom attributes already exist in SFCC — no creation needed`);
    return;
  }

  logger.info(`Creating ${missing.length} missing attribute(s) on SFCC ${objectType}...`);

  for (const [attributeId, sampleValue] of missing) {
    try {
      await createCustomAttribute(objectType, attributeId, sampleValue);
    } catch (err) {
      const status = err.response?.status;
      const detail = JSON.stringify(err.response?.data || err.message);
      logger.warn(`Could not create ${objectType}.${attributeId} (${status}: ${detail}) — skipping`);
    }
  }

  logger.info(`Schema validation complete for ${objectType}`);
}

module.exports = { validateAndEnsureAttributes };
