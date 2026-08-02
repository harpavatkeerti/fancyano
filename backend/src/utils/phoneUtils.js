/**
 * phoneUtils.js
 *
 * Shared phone number validation for backend services.
 * Mirrors the length logic used by the frontend's libphonenumber-js / countryCodes.ts.
 *
 * Usage:
 *   const { validatePhoneLength } = require('../utils/phoneUtils');
 *   const err = validatePhoneLength(phone, phone_country);
 *   if (err) throw Object.assign(new Error(err), { status: 400 });
 */

/**
 * Expected national digit lengths per country, keyed by ISO-2 code.
 * Countries not listed fall back to the ITU range of 7–15 digits.
 */
const PHONE_LENGTH_MAP = {
  IN: { min: 10, max: 10 }, // India
  US: { min: 10, max: 10 }, // United States
  CA: { min: 10, max: 10 }, // Canada
  GB: { min: 10, max: 10 }, // United Kingdom
  AU: { min: 9,  max: 9  }, // Australia
  AE: { min: 9,  max: 9  }, // UAE
  SG: { min: 8,  max: 8  }, // Singapore
  CN: { min: 11, max: 11 }, // China
  JP: { min: 10, max: 10 }, // Japan
  KR: { min: 10, max: 10 }, // South Korea
  PK: { min: 10, max: 10 }, // Pakistan
  BD: { min: 10, max: 10 }, // Bangladesh
  LK: { min: 9,  max: 9  }, // Sri Lanka
  NP: { min: 10, max: 10 }, // Nepal
  TH: { min: 9,  max: 9  }, // Thailand
  VN: { min: 9,  max: 10 }, // Vietnam
  ID: { min: 9,  max: 12 }, // Indonesia
  PH: { min: 10, max: 10 }, // Philippines
  NZ: { min: 9,  max: 9  }, // New Zealand
  SA: { min: 9,  max: 9  }, // Saudi Arabia
  QA: { min: 8,  max: 8  }, // Qatar
  KW: { min: 8,  max: 8  }, // Kuwait
  OM: { min: 8,  max: 8  }, // Oman
  BH: { min: 8,  max: 8  }, // Bahrain
  DE: { min: 10, max: 11 }, // Germany
  FR: { min: 9,  max: 9  }, // France
  IT: { min: 9,  max: 10 }, // Italy
  ES: { min: 9,  max: 9  }, // Spain
  BR: { min: 10, max: 11 }, // Brazil
  MX: { min: 10, max: 10 }, // Mexico
};

const PHONE_LENGTH_FALLBACK = { min: 7, max: 15 }; // ITU E.164 range

/**
 * Validate phone digit count against the country's expected length.
 *
 * @param {string} phone   - national digits (spaces/dashes stripped internally)
 * @param {string} country - ISO-2 country code, e.g. 'IN'
 * @returns {string|null}  error message string, or null if valid
 */
function validatePhoneLength(phone, country) {
  if (!phone) return null; // presence is checked separately
  const digits = phone.replace(/\D/g, '');
  const { min, max } = PHONE_LENGTH_MAP[country] || PHONE_LENGTH_FALLBACK;
  if (digits.length < min || digits.length > max) {
    const range = min === max ? `${min}` : `${min}–${max}`;
    return `Phone number for ${country} must be ${range} digits (got ${digits.length}).`;
  }
  return null;
}

module.exports = { validatePhoneLength, PHONE_LENGTH_MAP, PHONE_LENGTH_FALLBACK };
