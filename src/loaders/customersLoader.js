const axios = require('axios');
const config = require('../config');
const { getSFCCHeaders } = require('./sfccAuth');
const { withRetry } = require('../utils/httpClient');
const { logCustomerDiff } = require('../utils/diffLogger');
const logger = require('../utils/logger');

function ocapiUrl(path) {
  const { baseUrl, version } = config.sfcc;
  return `${baseUrl}/s/-/dw/data/${version}${path}`;
}

async function searchCustomerByEmail(email) {
  const headers = await getSFCCHeaders();
  try {
    const res = await axios.post(
      ocapiUrl('/customer_search'),
      { query: { text_query: { fields: ['email'], search_phrase: email } }, count: 1 },
      { headers }
    );
    return res.data.hits?.[0] || null;
  } catch {
    return null;
  }
}

async function upsertCustomer(customer) {
  if (config.migration.dryRun) {
    logCustomerDiff(customer);
    return;
  }

  const headers = await getSFCCHeaders();
  const existing = await searchCustomerByEmail(customer.email);

  if (existing) {
    await withRetry(
      () => axios.patch(
        ocapiUrl(`/customers/${existing.customer_id}`),
        customer,
        { headers }
      ),
      `update customer ${customer.email}`
    );
    logger.debug(`Customer updated: ${customer.email}`);
  } else {
    await withRetry(
      () => axios.post(ocapiUrl('/customers'), customer, { headers }),
      `create customer ${customer.email}`
    );
    logger.debug(`Customer created: ${customer.email}`);
  }
}

module.exports = { upsertCustomer };
