// CTP product schema:
// { id, key, masterData: { current: { name, description, slug, categories,
//   masterVariant: { sku, prices, images, attributes }, variants: [] } } }

function transformProduct(src) {
  const current = src.masterData?.current || src.masterData?.staged || {};
  const masterVariant = current.masterVariant || {};

  const productId = src.key || src.id;
  const name = localizedString(current.name);

  return {
    id: productId,
    name: { default: name },
    short_description: current.description ? { default: localizedString(current.description) } : undefined,
    online: true,
    searchable: true,
    primary_category_id: current.categories?.[0]?.id || undefined,
    custom_attributes: buildCustomAttributes(masterVariant.attributes),
  };
}

function transformVariant(v, parentProductId) {
  const price = extractPrice(v.prices);
  return {
    product_id: v.sku || `${parentProductId}-${v.id}`,
    variation_values: attributesToMap(v.attributes),
    price: price?.amount,
    ean: v.ean || undefined,
  };
}

function transformCategory(src) {
  return {
    id: src.key || src.id,
    name: { default: localizedString(src.name) },
    description: src.description ? { default: localizedString(src.description) } : undefined,
    parent_category_id: src.parent?.id || undefined,
    online: true,
  };
}

// CTP localized strings: { en: "...", "en-US": "..." }
function localizedString(obj) {
  if (!obj || typeof obj === 'string') return obj || '';
  return obj['en-US'] || obj['en'] || Object.values(obj)[0] || '';
}

// CTP prices: [{ value: { centAmount: 1000, currencyCode: "USD" } }]
function extractPrice(prices = []) {
  if (!prices.length) return null;
  const usd = prices.find((p) => p.value?.currencyCode === 'USD') || prices[0];
  return {
    amount: usd.value.centAmount / 100,
    currency: usd.value.currencyCode,
  };
}

// CTP attributes: [{ name: "color", value: "red" }]
function attributesToMap(attributes = []) {
  return attributes.reduce((acc, attr) => {
    acc[attr.name] = typeof attr.value === 'object' && attr.value !== null
      ? localizedString(attr.value)
      : attr.value;
    return acc;
  }, {});
}

function buildCustomAttributes(attributes = []) {
  const attrs = attributes.map((attr) => ({
    attribute_id: attr.name,
    value: typeof attr.value === 'object' && attr.value !== null
      ? localizedString(attr.value)
      : attr.value,
  }));
  return attrs.length ? attrs : undefined;
}

module.exports = { transformProduct, transformCategory };
