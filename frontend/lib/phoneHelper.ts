import { getCountryByCode } from '@/lib/countryCodes';

/**
 * Format a phone number for WhatsApp sharing.
 * Uses the stored country ISO code to prepend the correct calling code.
 * Falls back to India (+91) if no country code is provided.
 *
 * @param phone - The raw phone number (digits only or with formatting)
 * @param countryIsoCode - ISO 3166-1 alpha-2 code (e.g. 'IN', 'US', 'AE')
 * @returns The formatted phone number for wa.me URL, or null if invalid / empty.
 */
export function formatPhoneForWhatsApp(phone: string, countryIsoCode: string = 'IN'): string | null {
  if (!phone) return null;

  // Strip non-digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Look up the calling code for this country
  const country = getCountryByCode(countryIsoCode);
  const callingCode = country ? country.callingCode.replace('+', '') : '91';

  // If number already starts with the calling code, use as-is
  if (digits.startsWith(callingCode)) {
    return digits;
  }

  // Prepend the calling code
  const fullNumber = callingCode + digits;

  // Basic validation: WhatsApp expects 7-15 digits total
  if (fullNumber.length < 7 || fullNumber.length > 15) {
    return null;
  }

  return fullNumber;
}
