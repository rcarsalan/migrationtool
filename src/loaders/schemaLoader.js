const axios = require('axios');
const config = require('../config');
const { withRetry } = require('../utils/httpClient');
const logger = require('../utils/logger');
const { getSFCCToken } = require('./sfccAuth');

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

async function fetchExistingAttributes(objectType) {
  const headers = await getHeaders();
  const basePath = `/system_object_definitions/${objectType}/attribute_definitions`;
  const ids = new Set();
  let start = 0;
  let total = null;

  do {
    const res = await withRetry(
      () => axios.get(metaUrl(basePath), { headers, params: { count: PAGE_SIZE, start } }),
      `fetch ${objectType} attributes (start=${start})`
    );
    const data = res.data;
    if (total === null) {
      total = data.total || 0;
      logger.info(`SFCC ${objectType}: ${total} total attribute definitions found`);
    }
    for (const attr of data.data || []) ids.add(attr.id);
    start += PAGE_SIZE;
  } while (start < total);

  return ids;
}

async function createAttribute(objectType, attr) {
  const headers = await getHeaders();
  const path = `/system_object_definitions/${objectType}/attribute_definitions/${encodeURIComponent(attr.id)}`;

  await withRetry(
    () => axios.put(
      metaUrl(path),
      {
        id: attr.id,
        value_type: attr.value_type,
        mandatory: false,
        searchable: false,
        externally_defined: false,
        externally_managed: false,
        order_required: false,
        display_name: { default: attr.display_name || attr.id },
      },
      { headers }
    ),
    `create attribute ${attr.id} on ${objectType}`
  );

  logger.info(`Created: ${objectType}.${attr.id} (type: ${attr.value_type})`);
}

module.exports = { fetchExistingAttributes, createAttribute };
