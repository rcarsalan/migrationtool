// CTP customer schema:
// { id, customerNumber, email, firstName, lastName, dateOfBirth,
//   addresses: [{ streetName, streetNumber, city, state, postalCode, country, ... }],
//   defaultShippingAddressId, defaultBillingAddressId }

function transformCustomer(src) {
  return {
    customer_no: src.customerNumber || undefined,
    first_name: src.firstName || '',
    last_name: src.lastName || '',
    email: src.email || '',
    phone_home: src.phone || undefined,
    birthday: src.dateOfBirth || undefined,
    enabled: src.isEmailVerified !== false,
    addresses: (src.addresses || []).map((addr) =>
      transformAddress(addr, src.defaultShippingAddressId, src.defaultBillingAddressId)
    ),
    custom_attributes: buildCustomerAttributes(src),
  };
}

function transformAddress(addr, defaultShippingId, defaultBillingId) {
  // CTP uses streetName + streetNumber separately
  const street = [addr.streetName, addr.streetNumber].filter(Boolean).join(' ');

  return {
    address_id: addr.key || addr.id,
    address1: street || addr.streetName || '',
    address2: addr.additionalStreetInfo || undefined,
    city: addr.city || '',
    state_code: addr.state || '',
    postal_code: addr.postalCode || '',
    country_code: addr.country || 'US',
    first_name: addr.firstName || '',
    last_name: addr.lastName || '',
    phone: addr.phone || undefined,
    preferred: addr.id === defaultShippingId || addr.id === defaultBillingId,
  };
}

function buildCustomerAttributes(src) {
  const reserved = ['id', 'version', 'customerNumber', 'email', 'firstName', 'lastName',
    'password', 'dateOfBirth', 'phone', 'addresses', 'defaultShippingAddressId',
    'defaultBillingAddressId', 'isEmailVerified', 'createdAt', 'lastModifiedAt',
    'authenticationMode', 'customerGroup', 'stores'];

  const attrs = [];
  for (const [key, value] of Object.entries(src)) {
    if (!reserved.includes(key) && value !== null && value !== undefined && typeof value !== 'object') {
      attrs.push({ attribute_id: key, value });
    }
  }
  return attrs.length ? attrs : undefined;
}

module.exports = { transformCustomer };
