// CTP core product fields that have no OOTB equivalent in SFCC.
// These will be created as custom attributes (c_ prefix) on the SFCC Product object.
//
// Already covered by SFCC OOTB — NOT included here:
//   key              → id
//   name             → name
//   description      → short_description
//   metaTitle        → page_title
//   metaDescription  → page_description
//   metaKeywords     → page_keywords
//   published        → online
//   taxCategory      → tax_class_id
//   masterVariant.sku → manufacturer_sku

const CTP_CORE_PRODUCT_ATTRIBUTES = [
  {
    id: 'slug',
    value_type: 'string',
    display_name: 'CTP Slug',
  },
  {
    id: 'searchKeywords',
    value_type: 'string',
    display_name: 'CTP Search Keywords',
  },
  {
    id: 'categoryOrderHints',
    value_type: 'string',
    display_name: 'CTP Category Order Hints',
  },
  {
    id: 'ctpState',
    value_type: 'string',
    display_name: 'CTP Product State',
  },
  {
    id: 'variantAssets',
    value_type: 'string',
    display_name: 'CTP Variant Assets',
  },
];

function getCTPCoreAttributes() {
  return CTP_CORE_PRODUCT_ATTRIBUTES;
}

module.exports = { getCTPCoreAttributes };
