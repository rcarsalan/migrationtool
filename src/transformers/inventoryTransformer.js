// CTP inventory schema:
// { id, sku, quantityOnStock, availableQuantity, restockableInDays,
//   expectedDelivery, supplyChannel }

function transformInventoryRecord(src) {
  return {
    product_id: src.sku,
    allocation: src.quantityOnStock || 0,
    perpetual: false,
    preorderable: false,
    backorderable: (src.restockableInDays || 0) > 0,
    in_stock_date: src.expectedDelivery
      ? src.expectedDelivery.split('T')[0]
      : undefined,
  };
}

function transformInventoryList(listId, description = '') {
  return {
    id: listId,
    description: description || `Migrated inventory list ${listId}`,
    on_order: false,
    default_in_stock: false,
  };
}

module.exports = { transformInventoryRecord, transformInventoryList };
