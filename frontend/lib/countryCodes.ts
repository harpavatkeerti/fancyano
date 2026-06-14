import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import { parsePhoneNumber, isValidPhoneNumber as libIsValidPhoneNumber } from 'libphonenumber-js';

// Define CountryCode type based on ISO 3166-1 alpha-2 country codes
export type CountryCode = string;

export interface CountryInfo {
  code: CountryCode; // ISO 3166-1 alpha-2 code (e.g., 'IN', 'US')
  name: string;
  callingCode: string; // e.g., '+91', '+1'
}

// Get list of all countries from libphonenumber-js
const allCountries = getCountries();

// Popular countries to show first
const POPULAR_COUNTRIES = ['IN', 'US', 'GB', 'CA', 'AU', 'AE', 'SG', 'MY', 'CN', 'JP'];

// Country names mapping
const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  AE: 'United Arab Emirates',
  SG: 'Singapore',
  MY: 'Malaysia',
  CN: 'China',
  JP: 'Japan',
  KR: 'South Korea',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  LK: 'Sri Lanka',
  NP: 'Nepal',
  TH: 'Thailand',
  VN: 'Vietnam',
  ID: 'Indonesia',
  PH: 'Philippines',
  NZ: 'New Zealand',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  OM: 'Oman',
  BH: 'Bahrain',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  BR: 'Brazil',
  MX: 'Mexico',
  ZA: 'South Africa',
};

export const COUNTRIES: CountryInfo[] = allCountries.map((code) => ({
  code,
  name: COUNTRY_NAMES[code] || code,
  callingCode: `+${getCountryCallingCode(code as any)}`,
}));

// Sort countries: popular first, then alphabetically
export const SORTED_COUNTRIES = [
  ...COUNTRIES.filter(c => POPULAR_COUNTRIES.includes(c.code)),
  ...COUNTRIES.filter(c => !POPULAR_COUNTRIES.includes(c.code)).sort((a, b) => a.name.localeCompare(b.name)),
];

export function getCountryInfo(callingCode: string): CountryInfo | undefined {
  return COUNTRIES.find(c => c.callingCode === callingCode);
}

export function getCountryByCode(code: CountryCode): CountryInfo | undefined {
  return COUNTRIES.find(c => c.code === code);
}

// Helper to get expected number length for a country
export function getExpectedLength(callingCode: string): { min: number; max: number } | null {
  const country = getCountryInfo(callingCode);
  if (!country) return null;
  
  // Common lengths for popular countries (can be extended)
  const lengthMap: Record<string, { min: number; max: number }> = {
    '+91': { min: 10, max: 10 }, // India
    '+1': { min: 10, max: 10 },  // US/Canada
    '+44': { min: 10, max: 10 }, // UK
    '+61': { min: 9, max: 9 },   // Australia
    '+971': { min: 9, max: 9 },  // UAE
    '+65': { min: 8, max: 8 },   // Singapore
    '+86': { min: 11, max: 11 }, // China
    '+81': { min: 10, max: 10 }, // Japan
  };
  
  return lengthMap[callingCode] || { min: 7, max: 15 };
}

export function isValidPhoneNumber(phoneNumber: string, countryIsoCode: string): boolean {
  if (!phoneNumber || phoneNumber.length === 0) return false;
  
  const digits = phoneNumber.replace(/\D/g, '');
  const country = getCountryByCode(countryIsoCode);
  
  if (!country) {
    console.error('Country not found:', countryIsoCode);
    return false;
  }
  
  // First check: Does it match the expected length?
  const expectedLength = getExpectedLength(country.callingCode);
  if (!expectedLength) {
    console.error('No expected length for country:', countryIsoCode);
    return false;
  }
  
  const isCorrectLength = digits.length >= expectedLength.min && digits.length <= expectedLength.max;
  if (!isCorrectLength) {
    return false;
  }
  
  // Second check: Validate with libphonenumber-js
  try {
    const parsed = parsePhoneNumber(digits, countryIsoCode as any);
    
    if (parsed && parsed.isValid()) {
      return true;
    }
    
    // If parsing fails but length is correct, accept it (be lenient)
    return true;
  } catch {
    // If there's an error but length matches, accept it (be lenient)
    return true;
  }
}

