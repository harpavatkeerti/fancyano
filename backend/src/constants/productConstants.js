/**
 * productConstants.js
 *
 * Backend constants for product-related lists.
 * NOTE: This file is currently not imported anywhere in the backend.
 * Size constants are kept for reference; product types are now managed
 * dynamically via the product_categories / product_types tables.
 */

// ── Size Lists ───────────────────────────────────────────────────────────────

/** Numeric sizes for male products */
const MALE_NUMERIC_SIZES = ['34', '36', '38', '40', '42', '44', '46'];

/** Standard label sizes */
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

module.exports = {
  MALE_NUMERIC_SIZES,
  STANDARD_SIZES,
  FANCY_COSTUME_SIZES,
};
