# SFCC Schema Validation — Migration Tool

**Page Owner:** Migration Team
**Last Updated:** 2026-05-21
**Status:** Implemented
**Component:** Pre-Migration Schema Validator

---

## Table of Contents

1. [Background & Context](#1-background--context)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Architecture](#4-architecture)
5. [Full Migration Flow](#5-full-migration-flow)
6. [SFCC API Details](#6-sfcc-api-details)
7. [How Fields Are Mapped — Standard vs Custom](#7-how-fields-are-mapped--standard-vs-custom)
8. [How Attribute Types Are Decided](#8-how-attribute-types-are-decided)
9. [Code Walkthrough](#9-code-walkthrough)
10. [Running the Migration](#10-running-the-migration)
11. [Single Product Debug Mode](#11-single-product-debug-mode)
12. [Dry Run — Detailed Diff Report](#12-dry-run--detailed-diff-report)
13. [Where to Verify in SFCC Business Manager](#13-where-to-verify-in-sfcc-business-manager)
14. [Real Example — End to End](#14-real-example--end-to-end)
15. [Log Output Reference](#15-log-output-reference)
16. [SFCC Permissions Required](#16-sfcc-permissions-required)
17. [Environment Configuration](#17-environment-configuration)
18. [Known Limitations](#18-known-limitations)
19. [Troubleshooting](#19-troubleshooting)
20. [Glossary](#20-glossary)

---

## 1. Background & Context

This Migration Tool moves commerce data from **Commercetools (CTP)** into **Salesforce Commerce Cloud (SFCC)**. The data types migrated are:

| Data Type | CTP Source | SFCC Target |
|---|---|---|
| Products | `/products` | `/dw/data/v24_5/products` |
| Categories | `/categories` | `/dw/data/v24_5/catalogs/{id}/categories` |
| Customers | `/customers` | `/dw/data/v24_5/customers` |
| Inventory | `/inventory` | `/dw/data/v24_5/inventory_lists` |

Both CTP and SFCC have their own data models. While standard fields (name, price, email, etc.) map directly, **custom attributes** are unique to each client's setup and cannot be hardcoded in the tool.

---

## 2. Problem Statement

### What is a Custom Attribute?

In CTP, merchants can define their own extra fields on products and customers — these are called **custom attributes**. Examples:

- `fit_type` → "slim", "regular", "oversized"
- `fabric_weight` → 180 (grams per sqm)
- `is_sustainable` → true/false
- `care_instructions` → "machine wash cold"
- `loyalty_tier` → "gold", "silver" (on Customer)

These are not standard SFCC fields. Before you can save a product in SFCC with `fit_type`, that attribute must first **exist** in SFCC's object schema.

### What Happened Before This Fix

```
CTP Product (has "fit_type: slim")
    ↓
Transform → SFCC format with custom_attributes: [{ attribute_id: "fit_type", value: "slim" }]
    ↓
Load into SFCC
    ↓
❌ SFCC returns: 400 Bad Request — "fit_type" is not a defined attribute on Product
```

The migration would fail silently for those records, and engineers had to:
1. Read through error logs to find which attribute caused the failure
2. Manually go into SFCC Business Manager
3. Create the attribute
4. Re-run the migration for failed records

This was time-consuming and error-prone, especially when migrating 10,000+ products.

### Summary of Problems

| Problem | Business Impact |
|---|---|
| Custom attributes in CTP not present in SFCC | Products/Customers fail to load — data loss risk |
| No automated check before migration | Failures only discovered during or after migration |
| Manual Business Manager attribute creation | Developer time wasted, human error risk |
| Had to re-run migration for failed records | Migration takes longer, increases downtime window |
| No way to debug a single product | Hard to trace issues without running full migration |

---

## 3. Solution Overview

We added two key features:

### Feature 1 — Schema Validation Step
Runs automatically before any data is loaded into SFCC:
1. After transforming CTP data, collect every custom attribute name
2. Ask SFCC: "Which of these attributes do you already know about?"
3. For any attribute SFCC does not know — **create it automatically**
4. Only then, load the actual data

### Feature 2 — Single Product Debug Mode
Run migration for just one product by key. Useful for:
- Testing a specific product end-to-end before full migration
- Debugging a product that failed
- Verifying field mapping for a particular product type

### Feature 3 — Dry Run Detailed Diff Report
In dry run mode, instead of just logging the product ID, the tool now shows every field that would be sent to SFCC — including all custom attributes and their values.

> **Key benefit:** Migration will never fail due to a missing custom attribute. The schema is always prepared before data arrives.

---

## 4. Architecture

### Where the validator sits in the tool:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        MIGRATION TOOL                                │
│                                                                      │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────────┐    │
│  │  EXTRACTOR  │    │  TRANSFORMER │    │   SCHEMA VALIDATOR   │    │
│  │             │    │              │    │                      │    │
│  │  CTP API    │───►│  CTP format  │───►│  system_object_      │    │
│  │  /products  │    │  → SFCC      │    │  definitions API     │    │
│  │  /customers │    │  format      │    │                      │    │
│  │  /inventory │    │              │    │  • Fetch schema      │    │
│  └─────────────┘    └──────────────┘    │  • Find missing      │    │
│   (supports                             │  • Create missing    │    │
│    --key filter)                        └──────────┬───────────┘    │
│                                                    │                │
│                                         ┌──────────▼───────────┐    │
│                                         │       LOADER         │    │
│                                         │                      │    │
│                                         │  SFCC OCAPI          │    │
│                                         │  /products           │    │
│                                         │  /customers          │    │
│                                         │  (diff log in        │    │
│                                         │   dry run mode)      │    │
│                                         └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Files involved:

```
src/
├── validators/
│   └── sfccSchemaValidator.js     ← NEW: Core validation & attribute creation logic
├── utils/
│   └── diffLogger.js              ← NEW: Detailed dry run field diff formatter
├── migrations/
│   ├── migrateProducts.js         ← UPDATED: validator + filterKey support
│   └── migrateCustomers.js        ← UPDATED: validator + filterKey support
├── extractors/
│   └── productsExtractor.js       ← UPDATED: single product fetch by --key
├── loaders/
│   ├── productsLoader.js          ← UPDATED: detailed diff log in dry run
│   └── customersLoader.js         ← UPDATED: detailed diff log in dry run
└── index.js                       ← UPDATED: --key CLI flag + SINGLE RECORD banner
web/
├── app/run/page.tsx               ← UPDATED: Filter by Key input field
└── app/api/migrate/route.ts       ← UPDATED: passes --key to CLI
```

---

## 5. Full Migration Flow

### Before (old flow):

```
Extract → Transform → Load
                        ↓
              ❌ Some records fail (missing attributes)
              ↓
              Engineer reads logs → finds missing attr
              → creates manually in Business Manager
              → re-runs migration
```

### After (new flow):

```
Extract → Transform → [Schema Validate] → Load
    ↑           ↓             ↓
 --key      diff log    SFCC has all attrs?
 filter     in dry run  ┌──────────────────────────┐
 (optional)             │  YES → skip, move on     │
                        │  NO  → auto-create attrs │
                        └──────────────────────────┘
                                    ↓
                          ✅ Load — 0 attribute errors
```

### Detailed step-by-step:

```
STEP 1 — EXTRACT
   CTP API is called → Products, Customers, Inventory records fetched
   If --key is provided → only that one product is fetched
   (full migration uses pagination, fetches in batches of 100)

STEP 2 — TRANSFORM
   CTP data structure → converted to SFCC-compatible structure
   Standard fields mapped automatically (name, price, email etc.)
   Custom attributes collected:
   e.g. { attribute_id: "fit_type", value: "slim" }
        { attribute_id: "fabric_weight", value: 180 }

STEP 3 — SCHEMA VALIDATION (skipped in dry run)
   3a. Scan all transformed records → collect every unique attribute_id
   3b. Call SFCC system_object_definitions GET → get all existing attribute IDs
   3c. Compare the two lists
   3d. For each missing attribute → call system_object_definitions PUT to create it
   3e. Log a summary of what was created

STEP 4 — LOAD (or DIFF LOG in dry run)
   DRY RUN:  Print detailed field-by-field report for each record
   REAL RUN: Products/Customers sent to SFCC OCAPI
             All custom attributes are now valid → no 400 errors
```

---

## 6. SFCC API Details

### Base URL pattern:

```
https://{your-sfcc-instance}/s/-/dw/data/{version}/system_object_definitions
```

> The `-` in `/s/-/` means this is a **global** operation, not tied to a specific storefront site.

### API Call 1 — Fetch existing attribute definitions

```
GET /s/-/dw/data/v24_5/system_object_definitions/Product/attribute_definitions?count=200

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json
  x-dw-client-id: {client_id}
```

**Sample Response:**
```json
{
  "count": 3,
  "data": [
    { "id": "color",   "type": { "id": "string"  }, "mandatory": false },
    { "id": "size",    "type": { "id": "string"  }, "mandatory": false },
    { "id": "is_new",  "type": { "id": "boolean" }, "mandatory": false }
  ]
}
```

### API Call 2 — Create a missing custom attribute

```
PUT /s/-/dw/data/v24_5/system_object_definitions/Product/attribute_definitions/fit_type

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json
  x-dw-client-id: {client_id}

Body:
{
  "id": "fit_type",
  "type": { "id": "string" },
  "mandatory": false,
  "searchable": false,
  "externally_defined": false,
  "externally_managed": false,
  "order_required": false,
  "display_name": { "default": "fit_type" }
}
```

**Success Response:** `200 OK` or `201 Created`

### Object types supported:

| SFCC Object | Used For |
|---|---|
| `Product` | Product custom attributes from CTP product variants |
| `Customer` | Customer custom attributes from CTP customer records |

---

## 7. How Fields Are Mapped — Standard vs Custom

When a product is migrated from CTP to SFCC, two kinds of fields are handled differently:

### Standard Fields — already exist in SFCC, no creation needed

These fields are mapped directly by `productTransformer.js`:

| SFCC Field | Source in CTP | Notes |
|---|---|---|
| `id` | `product.key` | Product key used as SFCC ID |
| `name` | `masterData.current.name` | Localized, `en` or `en-US` used |
| `price` | `masterVariant.prices[0].value.centAmount` | Divided by 100 for decimal |
| `currency_mnemonic` | `prices[0].value.currencyCode` | Defaults to `USD` |
| `online` | hardcoded `true` | All migrated products go live |
| `searchable` | hardcoded `true` | All migrated products are searchable |
| `primary_category_id` | `categories[0].id` | First category used |
| `image` | `masterVariant.images[0].url` | First image used |
| `short_description` | `masterData.current.description` | Optional |
| `type.master` | `variants.length > 0` | True if product has variants |

### Custom Attributes — may not exist in SFCC, auto-created if missing

Any extra fields on CTP product variants (beyond the standard ones above) become `custom_attributes` in SFCC:

```
CTP variant attribute: { name: "fit_type", value: "slim" }
          ↓
SFCC custom_attribute: { attribute_id: "fit_type", value: "slim" }
```

**Before loading**, the Schema Validator checks if `fit_type` exists as a defined attribute on the SFCC `Product` object. If not, it creates it automatically via `system_object_definitions`.

### Where to see them in Business Manager:

```
Product Detail Page
  ├── General tab       → id, name, price, online, searchable
  ├── Images tab        → image
  ├── Categories tab    → primary_category_id
  ├── Variations tab    → variants
  └── Custom Attrs tab  → all custom_attributes (fit_type, fabric_weight, etc.)
```

---

## 8. How Attribute Types Are Decided

When a new custom attribute is created in SFCC, its data type is **automatically inferred** from the actual value in CTP data.

The logic is in `sfccSchemaValidator.js → inferAttributeType()`:

```javascript
function inferAttributeType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number')  return Number.isInteger(value) ? 'int' : 'double';
  return 'string';   // default for text, arrays, unknowns
}
```

### Type mapping table:

| CTP Value Example | JavaScript `typeof` | SFCC Type Created |
|---|---|---|
| `"slim"`, `"cotton"`, `"M"` | `string` | `string` |
| `180`, `3`, `0` | `number` (integer) | `int` |
| `29.99`, `1.5`, `0.75` | `number` (decimal) | `double` |
| `true`, `false` | `boolean` | `boolean` |
| `null`, object, array | anything else | `string` (safe default) |

> **Note:** The type is inferred from the **first record** that contains this attribute. If later records have a different value type for the same attribute, SFCC will handle it at load time — but the attribute definition type will not be changed.

---

## 9. Code Walkthrough

### `src/validators/sfccSchemaValidator.js`

**`metaUrl(path)`**
Builds the SFCC Data API URL using `/s/-/` (global scope). Schema operations are always global — not site-specific.

**`fetchSFCCAttributes(objectType)`**
Calls SFCC and returns a `Set` of all existing attribute IDs. Uses `withRetry()` for network resilience. On failure, logs the exact URL and SFCC error response body.

**`inferAttributeType(value)`**
Pure function — inspects a JavaScript value and returns the correct SFCC attribute type string.

**`createCustomAttribute(objectType, attributeId, sampleValue)`**
Sends a `PUT` to SFCC to create one custom attribute. Created as non-mandatory and non-searchable by default.

**`validateAndEnsureAttributes(objectType, transformedRecords)`**
Main entry point called from migration files. Collects unique attribute IDs across all records, fetches SFCC schema once, then creates only the missing ones.

---

### `src/utils/diffLogger.js`

Used in dry run mode to print a readable summary of what each record contains.

**`logProductDiff(product)`** — prints:
- Standard fields: name, price, online, primary_category, type, image
- All custom attributes with their values
- Missing fields clearly marked as `(empty/missing)`

**`logCustomerDiff(customer)`** — prints:
- email, name, phone, birthday, enabled
- address count
- All custom attributes

---

### `src/migrations/migrateProducts.js` — what changed

```javascript
// BEFORE
async function migrateProducts() {
  const raw = await extractProducts();
  const products = raw.map(transformProduct);
  await processBatches(products, upsertProduct, 'products');
}

// AFTER
async function migrateProducts(filterKey = null) {
  const raw = await extractProducts(filterKey);   // single product support
  const products = raw.map(transformProduct);

  if (!config.migration.dryRun) {
    await validateAndEnsureAttributes('Product', products);  // schema validation
  }

  await processBatches(products, upsertProduct, 'products'); // diff log in dry run
}
```

Same pattern applied to `migrateCustomers.js`.

---

## 10. Running the Migration

### Available npm scripts:

| Command | What it does |
|---|---|
| `npm run dry-run` | Simulate full migration — no data written |
| `npm run migrate:all` | Migrate everything: categories, products, customers, inventory |
| `npm run migrate:products` | Migrate categories + products only |
| `npm run migrate:customers` | Migrate customers only |
| `npm run migrate:inventory` | Migrate inventory only |
| `npm run web` | Start web UI at `localhost:3000` |

### Via Web UI:

```
localhost:3000/run
  → Select data types (checkboxes)
  → Toggle Dry Run on/off
  → Enter Filter Key (optional — for single product)
  → Click "Start Migration" or "Start Dry Run"
  → Watch live logs stream in real time
```

---

## 11. Single Product Debug Mode

Run migration for just **one product** by its CTP key. This is useful for:
- Testing the full flow (extract → transform → schema validate → load) on one product before running 730+
- Debugging a specific product that failed
- Verifying field mapping without touching all records

### Via terminal:

```bash
# Dry run — just see the diff report, no data written
DRY_RUN=true node src/index.js products --key=ct1001

# Real migration — actually load to SFCC
node src/index.js products --key=ct1001
```

### Via Web UI:

```
localhost:3000/run
  → Select "Products"
  → Filter by Product Key: ct1001
  → Toggle Dry Run on
  → Start Dry Run
```

### What the `--key` flag does internally:

```javascript
// productsExtractor.js
async function extractProducts(filterKey = null) {
  if (filterKey) {
    // CTP API: GET /products?where=key="ct1001"
    // Returns only that one product
  }
  // otherwise: paginated fetch of all products
}
```

---

## 12. Dry Run — Detailed Diff Report

In dry run mode, instead of just printing the product ID, the tool now prints a full field-by-field report for every record.

### Product diff output example:

```
┌─ Product: ct1001 ──────────────────────────────────┐
│  name             → "Classic M&M's"
│  online           → true
│  searchable       → true
│  price            → 12.99 USD
│  primary_category → snacks
│  type             → master (has variants)
│  image            → https://cdn.example.com/ct1001.jpg
│  variants         → 3 variant(s)
│  custom_attributes (5):
│    ✦ NET_WEIGHT                     → "180g"
│    ✦ PACKAGING_TYPE                 → "bag"
│    ✦ IS_PERSONALIZABLE              → true
│    ✦ FLAVOR                         → "milk-chocolate"
│    ✦ COUNTRY_OF_ORIGIN              → "US"
└────────────────────────────────────────────────────┘
```

### Customer diff output example:

```
┌─ Customer: john@example.com ───────────────────────┐
│  email            → "john@example.com"
│  first_name       → "John"
│  last_name        → "Doe"
│  customer_no      → "C-10045"
│  phone_home       → (empty/missing)
│  birthday         → "1990-05-15"
│  enabled          → true
│  addresses        → 2 address(es)
│  custom_attributes (2):
│    ✦ loyalty_tier                   → "gold"
│    ✦ preferred_language             → "en"
└────────────────────────────────────────────────────┘
```

Fields marked as `(empty/missing)` will not be sent to SFCC or will be sent as `undefined`.

---

## 13. Where to Verify in SFCC Business Manager

After migration, verify the product in Business Manager:

### Step-by-step path:

```
Business Manager
  → Merchant Tools
    → Products & Catalogs
      → Products
        → Search: "ct1001"   ← enter the product key
          → Click on result
            → Product detail page opens
```

### What to check on each tab:

| BM Tab | What to verify |
|---|---|
| **General** | `id`, `name`, `price`, `online = true`, `searchable = true` |
| **Images** | Product image from CTP |
| **Categories** | `primary_category_id` assigned correctly |
| **Variations** | Variants migrated (if product has variants) |
| **Custom Attributes** | All CTP custom attributes: `fit_type`, `fabric_weight`, etc. |

### Quick API check (without logging into BM):

```bash
curl -X GET \
  "https://zzeu-008.dx.commercecloud.salesforce.com/s/-/dw/data/v24_5/products/ct1001" \
  -H "Authorization: Bearer {your_token}" \
  -H "Content-Type: application/json"
```

This returns the full product JSON including all custom attributes.

### Custom attribute definitions (confirm they were created):

```bash
curl -X GET \
  "https://zzeu-008.dx.commercecloud.salesforce.com/s/-/dw/data/v24_5/system_object_definitions/Product/attribute_definitions" \
  -H "Authorization: Bearer {your_token}"
```

Any attribute created by the schema validator will appear here.

---

## 14. Real Example — End to End

### Scenario:
- CTP has 730 products (confirmed from dry run)
- Products have 113 unique custom attributes
- SFCC already has some standard attributes, but not all 113

### What happens:

```
STEP 1 — Extract
  730 products fetched from CTP (15 batches of 50)

STEP 2 — Transform
  All 730 products converted to SFCC format
  Each product has standard fields + custom_attributes array

STEP 3 — Schema Validation
  113 unique custom attribute IDs collected
  SFCC GET /system_object_definitions/Product/attribute_definitions
  Response: SFCC has X existing attributes

  For each missing one:
    SFCC PUT /system_object_definitions/Product/attribute_definitions/{id}
    → Created with inferred type (string/int/double/boolean)

STEP 4 — Load
  730 products → upserted into SFCC OCAPI
  Result: 730 success, 0 failed ✅

STEP 5 — Verify in BM
  Merchant Tools → Products & Catalogs → Products
  Search "ct1001" → open product → check all tabs
```

---

## 15. Log Output Reference

### Dry run with single product (detailed diff):

```
[SINGLE RECORD] Filtering by key: ct1001

[info]  === Starting Product Migration ===
[info]  Extracting single product from Commercetools (key: ct1001)...
[info]  Fetched 1 records from CTP/products
[info]  --- Schema Validation: skipped in DRY RUN ---

[info]
┌─ Product: ct1001 ──────────────────────────────────┐
│  name             → "Classic M&M's"
│  online           → true
│  price            → 12.99 USD
│  primary_category → snacks
│  type             → master (has variants)
│  image            → https://cdn.example.com/img.jpg
│  custom_attributes (5):
│    ✦ NET_WEIGHT                     → "180g"
│    ✦ PACKAGING_TYPE                 → "bag"
│    ✦ IS_PERSONALIZABLE              → true
│    ✦ FLAVOR                         → "milk-chocolate"
│    ✦ COUNTRY_OF_ORIGIN              → "US"
└────────────────────────────────────────────────────┘

[info]  Products done: 1 success, 0 failed
```

### Real migration with schema validation (some attributes missing):

```
[info]  === Starting Product Migration ===
[info]  Fetched 730 records from CTP/products
[info]  --- Schema Validation: Products ---
[info]  Validating 113 unique custom attributes for SFCC Product...
[info]  SFCC Product: 98 existing attributes found
[info]  Creating 15 missing custom attributes on SFCC Product...
[info]  Custom attribute created: Product.fit_type (type: string)
[info]  Custom attribute created: Product.fabric_weight (type: int)
[info]  Custom attribute created: Product.is_sustainable (type: boolean)
[info]  ... (12 more)
[info]  Schema validation complete for Product: 15 attributes created
[info]  Processing batch 1/15 (50 products)
[info]  ...
[info]  Products done: 730 success, 0 failed
```

### All attributes already exist:

```
[info]  Validating 113 unique custom attributes for SFCC Product...
[info]  SFCC Product: 113 existing attributes found
[info]  All Product attributes already exist in SFCC — no changes needed
```

### Network error with retry:

```
[warn]  fetch Product attribute definitions attempt 1 failed. Retrying... (2 left)
[warn]  fetch Product attribute definitions attempt 2 failed. Retrying... (1 left)
[info]  SFCC Product: 98 existing attributes found
```

---

## 16. SFCC Permissions Required

The SFCC API client (configured in `.env`) must have the following Data API permissions:

| Permission | Required For |
|---|---|
| `Read` on `Products` | Loading products |
| `Write` on `Products` | Creating/updating products |
| `Read` on `Customers` | Loading customers |
| `Write` on `Customers` | Creating/updating customers |
| `Read` on `system_object_definitions` | Fetching existing attribute list |
| `Write` on `system_object_definitions` | Creating missing custom attributes |

### How to check in SFCC Business Manager:

```
Administration
  → Organization
    → API Clients
      → Find your Client ID
        → Data API Settings
          → Check: system_object_definitions → Read ✅ Write ✅
          → Check: Products → Read ✅ Write ✅
          → Check: Customers → Read ✅ Write ✅
```

> If write permission is missing on `system_object_definitions`, the schema fetch will succeed but attribute creation will return `403 Forbidden`.

---

## 17. Environment Configuration

No new environment variables are needed. All settings use existing `.env` variables:

```env
# Commercetools (Source)
CTP_PROJECT_KEY=mars-mms-dev-us
CTP_CLIENT_ID=your-ctp-client-id
CTP_CLIENT_SECRET=your-ctp-client-secret
CTP_AUTH_URL=https://auth.us-central1.gcp.commercetools.com
CTP_API_URL=https://api.us-central1.gcp.commercetools.com
CTP_SCOPES=manage_project:mars-mms-dev-us

# SFCC (Target)
SFCC_BASE_URL=https://zzeu-008.dx.commercecloud.salesforce.com
SFCC_CLIENT_ID=your-sfcc-client-id
SFCC_CLIENT_SECRET=your-sfcc-client-secret
SFCC_SITE_ID=RefArch
SFCC_VERSION=v24_5

# Migration Settings
BATCH_SIZE=50
CONCURRENCY=5
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=2000
DRY_RUN=false
LOG_LEVEL=info
```

> `SFCC_VERSION` controls the OCAPI version used for both data loading AND `system_object_definitions` calls.

---

## 18. Known Limitations

| Limitation | Details |
|---|---|
| Attribute type from first occurrence | If `price_override` is `"free"` (string) in one product and `0` (number) in another, type is inferred from whichever appears first |
| `count: 200` limit on SFCC fetch | If SFCC has more than 200 attributes on one object, some may not be fetched. Pagination not yet implemented |
| No attribute group assignment | New attributes are created but not assigned to any attribute group in BM — must be done manually for Storefront display |
| No attribute deletion | Attributes removed from CTP are NOT removed from SFCC — must be cleaned up manually |
| Inventory not validated | Inventory records have no `custom_attributes` — schema validation is skipped automatically |
| `--key` filter for products only | Single record filter currently only works for products, not customers or inventory |

---

## 19. Troubleshooting

### Error: `403 Forbidden` on attribute creation

**Cause:** SFCC API client does not have Write permission on `system_object_definitions`
**Fix:** Update the API client permissions in Business Manager (see Section 16)

---

### Error: `400 Bad Request` during schema validation

**Cause 1:** SFCC credentials not yet configured in `.env`
**Fix:** Set `SFCC_BASE_URL`, `SFCC_CLIENT_ID`, `SFCC_CLIENT_SECRET` in `.env`

**Cause 2:** Wrong OCAPI version — endpoint may not exist on that version
**Fix:** Check `SFCC_VERSION` in `.env` — use `v24_5` or higher

---

### Error: `400 Bad Request` during Load (after validation ran)

**Cause:** Attribute created with wrong type — e.g. CTP sends `"180"` (string) but value is numeric
**Fix:** Manually change the attribute type in Business Manager, or delete and let the tool re-create it

---

### Error: `pLimit is not a function`

**Cause:** `p-limit` v4+ is ESM-only and incompatible with CommonJS `require()`
**Fix:** Downgrade to v3: `npm install p-limit@3`

---

### Product not found with `--key`

**Cause:** Product key does not exist in CTP, or key is case-sensitive
**Fix:** Check the exact key in CTP → Commerce Manager → Products. Keys are case-sensitive.

---

### `No custom attributes found — skipping schema validation` for Products

**Cause:** CTP products have no variant attributes, OR the `productTransformer.js` returned empty `custom_attributes`
**Fix:** Check that the CTP product type has attribute definitions and that `expand: productType` is working in the extractor

---

### Migrated product not visible in Business Manager

**Cause 1:** Product was migrated but not assigned to a catalog visible in BM search
**Fix:** Check `SFCC_CATALOG_ID` in `.env` — must match the catalog configured in BM

**Cause 2:** Product was migrated in dry run mode — no actual data was written
**Fix:** Re-run without `DRY_RUN=true`

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **CTP** | Commercetools Platform — the source system data is migrated FROM |
| **SFCC** | Salesforce Commerce Cloud — the target system data is migrated TO |
| **OCAPI** | Open Commerce API — SFCC's REST API for reading and writing commerce data |
| **BM** | Business Manager — SFCC's admin UI where merchants manage their store |
| **system_object_definitions** | SFCC Data API endpoint for reading and managing object schemas (metadata) |
| **custom attribute** | A merchant-defined extra field on an object (e.g. Product, Customer) not in the standard schema |
| **attribute_id** | The unique name/key of a custom attribute — e.g. `fit_type`, `fabric_weight` |
| **object type** | The SFCC object the attribute belongs to — e.g. `Product`, `Customer`, `Order` |
| **DRY_RUN** | Migration mode where no data is written — shows detailed diff report instead |
| **diff report** | Field-by-field output in dry run showing exactly what would be sent to SFCC |
| **--key flag** | CLI argument to filter migration to a single product by its CTP key |
| **schema validator** | The component that checks and creates missing SFCC attributes before data is loaded |
| **filterKey** | The product key value passed via `--key` flag or web UI "Filter by Key" input |
