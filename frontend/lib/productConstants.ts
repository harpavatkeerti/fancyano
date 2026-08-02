/**
 * productConstants.ts
 *
 * Single source of truth (frontend) for product-related lists.
 * ⚠️  IMPORTANT: This file is duplicated in the backend at:
 *     backend/src/constants/productConstants.js
 * Any changes here MUST be propagated to that file (and vice versa).
 */

// ── Product Types ────────────────────────────────────────────────────────────

export const MALE_PRODUCT_TYPES = ['Sherwani', 'Indo Western', 'Suit', 'Kurta Pajama'];
export const FEMALE_PRODUCT_TYPES = ['Lehenga', 'Girlish Crop Top', 'Gowns'];

export const ALL_PRODUCT_TYPES = [
  ...MALE_PRODUCT_TYPES,
  ...FEMALE_PRODUCT_TYPES,
  'Artificial Jewelleries',
  'Fancy Costumes',
  'Other',
] as const;

export type ProductType = typeof ALL_PRODUCT_TYPES[number];

/** Product types that use size=null (no size applicable) */
export const NO_SIZE_TYPES: string[] = ['Artificial Jewelleries'];

/** Product types that use age-based fancy sizes */
export const FANCY_SIZE_TYPES: string[] = ['Fancy Costumes'];

/** Product types where gender drives the size list */
export const GENDER_SIZED_TYPES: string[] = [
  'Sherwani', 'Indo Western', 'Suit', 'Kurta Pajama',
  'Lehenga', 'Girlish Crop Top', 'Gowns', 'Other',
];

// ── Size Lists ───────────────────────────────────────────────────────────────

/** Numeric sizes for male products (except Kurta Pajama which uses S/M/L) */
export const MALE_NUMERIC_SIZES = ['34', '36', '38', '40', '42', '44', '46'] as const;

/** Standard label sizes (female + Kurta Pajama) */
export const STANDARD_SIZES: { value: string; label: string }[] = [
  { value: 'S',   label: 'Small (S)' },
  { value: 'M',   label: 'Medium (M)' },
  { value: 'L',   label: 'Large (L)' },
  { value: 'XL',  label: 'Extra Large (XL)' },
  { value: 'XXL', label: 'XX Large (XXL)' },
];

/** Age-based sizes for Fancy Costumes */
export const FANCY_COSTUME_SIZES = [
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
] as const;

// ── Filter Size Options (for inventory filter bar) ───────────────────────────
// Combined list used by the size filter dropdown.

export const FILTER_SIZE_OPTIONS = [
  { group: 'Standard Sizes', sizes: STANDARD_SIZES.map(s => s.value) },
  { group: 'Numeric Sizes',  sizes: MALE_NUMERIC_SIZES as unknown as string[] },
  { group: 'Age-Based (Fancy Costumes)', sizes: FANCY_COSTUME_SIZES as unknown as string[] },
  { group: 'Other', sizes: ['Adult Size'] },
];

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns the valid sizes for a given product type and gender.
 * Must stay in sync with backend/src/constants/productConstants.js
 */
export function getSizesForProduct(productType: string, gender?: string | null): string[] {
  if (NO_SIZE_TYPES.includes(productType)) {
    return [];
  }

  if (FANCY_SIZE_TYPES.includes(productType)) {
    return [...FANCY_COSTUME_SIZES];
  }

  if (GENDER_SIZED_TYPES.includes(productType)) {
    if (gender?.toLowerCase() === 'male') {
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
