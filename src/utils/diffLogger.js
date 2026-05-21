const logger = require('./logger');

function logProductDiff(product) {
  const lines = [];
  lines.push(`┌─ Product: ${product.id} ${'─'.repeat(Math.max(0, 50 - product.id.length))}┐`);
  lines.push(`│  name             → ${_val(product.name?.default)}`);
  lines.push(`│  online           → ${_val(product.online)}`);
  lines.push(`│  searchable       → ${_val(product.searchable)}`);
  lines.push(`│  price            → ${product.price != null ? `${product.price} ${product.currency_mnemonic || ''}` : _missing()}`);
  lines.push(`│  primary_category → ${_val(product.primary_category_id)}`);
  lines.push(`│  type             → ${_typeLabel(product.type)}`);

  if (product.image) {
    lines.push(`│  image            → ${product.image.link}`);
  } else {
    lines.push(`│  image            → ${_missing()}`);
  }

  if (product.variants?.length) {
    lines.push(`│  variants         → ${product.variants.length} variant(s)`);
  }

  const attrs = product.custom_attributes;
  if (attrs?.length) {
    lines.push(`│  custom_attributes (${attrs.length}):`);
    for (const a of attrs) {
      lines.push(`│    ✦ ${a.attribute_id.padEnd(28)} → ${_val(a.value)}`);
    }
  } else {
    lines.push(`│  custom_attributes → (none)`);
  }

  lines.push(`└${'─'.repeat(54)}┘`);
  logger.info('\n' + lines.join('\n'));
}

function logCustomerDiff(customer) {
  const lines = [];
  const label = customer.email || customer.customer_no || 'unknown';
  lines.push(`┌─ Customer: ${label} ${'─'.repeat(Math.max(0, 46 - label.length))}┐`);
  lines.push(`│  email            → ${_val(customer.email)}`);
  lines.push(`│  first_name       → ${_val(customer.first_name)}`);
  lines.push(`│  last_name        → ${_val(customer.last_name)}`);
  lines.push(`│  customer_no      → ${_val(customer.customer_no)}`);
  lines.push(`│  phone_home       → ${_val(customer.phone_home)}`);
  lines.push(`│  birthday         → ${_val(customer.birthday)}`);
  lines.push(`│  enabled          → ${_val(customer.enabled)}`);

  if (customer.addresses?.length) {
    lines.push(`│  addresses        → ${customer.addresses.length} address(es)`);
  } else {
    lines.push(`│  addresses        → ${_missing()}`);
  }

  const attrs = customer.custom_attributes;
  if (attrs?.length) {
    lines.push(`│  custom_attributes (${attrs.length}):`);
    for (const a of attrs) {
      lines.push(`│    ✦ ${a.attribute_id.padEnd(28)} → ${_val(a.value)}`);
    }
  } else {
    lines.push(`│  custom_attributes → (none)`);
  }

  lines.push(`└${'─'.repeat(54)}┘`);
  logger.info('\n' + lines.join('\n'));
}

function _val(v) {
  if (v === null || v === undefined || v === '') return _missing();
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

function _missing() {
  return '(empty/missing)';
}

function _typeLabel(type) {
  if (!type) return _missing();
  if (type.master) return 'master (has variants)';
  if (type.variant) return 'variant';
  return 'item (standalone)';
}

module.exports = { logProductDiff, logCustomerDiff };
