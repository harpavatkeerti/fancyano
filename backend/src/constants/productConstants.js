/**
 * productConstants.js
 *
 * Single source of truth (backend) for product-related lists.
 * ⚠️  IMPORTANT: This file is duplicated in the frontend at:
 *     frontend/lib/productConstants.ts
 * Any changes here MUST be propagated to that file (and vice versa).
 */

// ── Product Types ────────────────────────────────────────────────────────────

const MALE_PRODUCT_TYPES = ['Sherwani', 'Indo Western', 'Suit', 'Kurta Pajama'];
const FEMALE_PRODUCT_TYPES = ['Lehenga', 'Girlish Crop Top', 'Gowns'];

const ALL_PRODUCT_TYPES = [
  ...MALE_PRODUCT_TYPES,
  ...FEMALE_PRODUCT_TYPES,
  'Artificial Jewelleries',
  'Fancy Costumes',
  'Other',
];

/** Product types that use size=null (no size applicable) */
const NO_SIZE_TYPES = ['Artificial Jewelleries'];

/** Product types that use age-based fancy sizes */
const FANCY_SIZE_TYPES = ['Fancy Costumes'];

/** Product types where gender drives the size list */
const GENDER_SIZED_TYPES = [
  'Sherwani', 'Indo Western', 'Suit', 'Kurta Pajama',
  'Lehenga', 'Girlish Crop Top', 'Gowns', 'Other',
];

// ── Size Lists ───────────────────────────────────────────────────────────────

/** Numeric sizes for male products (except Kurta Pajama which uses S/M/L) */
const MALE_NUMERIC_SIZES = ['34', '36', '38', '40', '42', '44', '46'];

/** Standard label sizes (female + Kurta Pajama) */
const STANDARD_SIZES = [
  { value: 'S',   label: 'Small (S)' },
  { value: 'M',   label: 'Medium (M)' },
  { value: 'L',   label: 'Large (L)' },
  { value: 'XL',  label: 'Extra Large (XL)' },
  { value: 'XXL', label: 'XX Large (XXL)' },
];

/** Age-based sizes for Fancy Costumes */
const FANCY_COSTUME_SIZES = [
  '2-3 years',
  '3-4 years',
  '3-5 years',
  '4-6 years',
  '5-6 years',
  '5-7 years',
  '8-10 years',
  '12-14 years',
  '14-16 years',
  'Adult Size',
];

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns the valid sizes for a given product type and gender.
 * @param {string} productType - e.g. 'Sherwani', 'Fancy Costumes', 'Artificial Jewelleries'
 * @param {string|null} gender - 'male' or 'female' (required for gender-sized types)
 * @returns {string[]} - Array of valid size strings, or empty array if no sizes apply
 */
function getSizesForProduct(productType, gender) {
  if (NO_SIZE_TYPES.includes(productType)) {
    return [];
  }

  if (FANCY_SIZE_TYPES.includes(productType)) {
    return [...FANCY_COSTUME_SIZES];
  }

  if (GENDER_SIZED_TYPES.includes(productType)) {
    if (gender === 'male') {
      // Kurta Pajama uses standard (S/M/L) sizes, not numeric
      if (productType === 'Kurta Pajama') {
        return STANDARD_SIZES.map(s => s.value);
      }
      return [...MALE_NUMERIC_SIZES];
    }
    // Female products and 'Other' with female gender use standard sizes
    return STANDARD_SIZES.map(s => s.value);
  }

  // Fallback: no known type — return empty
  return [];
}

module.exports = {
  MALE_PRODUCT_TYPES,
  FEMALE_PRODUCT_TYPES,
  ALL_PRODUCT_TYPES,
  NO_SIZE_TYPES,
  FANCY_SIZE_TYPES,
  GENDER_SIZED_TYPES,
  MALE_NUMERIC_SIZES,
  STANDARD_SIZES,
  FANCY_COSTUME_SIZES,
  getSizesForProduct,
};
