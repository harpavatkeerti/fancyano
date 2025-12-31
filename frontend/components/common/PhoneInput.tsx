'use client';

import { useState, useRef, useEffect } from 'react';
import { SORTED_COUNTRIES, getCountryByCode, isValidPhoneNumber, getExpectedLength, getCountryInfo } from '@/lib/countryCodes';

interface PhoneInputProps {
  label: string;
  value: string;
  countryCode: string; // This is the ISO country code like 'IN', 'US'
  onValueChange: (value: string) => void;
  onCountryCodeChange: (code: string) => void;
  required?: boolean;
  placeholder?: string;
}

export default function PhoneInput({
  label,
  value,
  countryCode,
  onValueChange,
  onCountryCodeChange,
  required = false,
  placeholder,
}: PhoneInputProps) {
  const [error, setError] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const country = getCountryByCode(countryCode);
  const expectedLength = country ? getExpectedLength(country.callingCode) : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePhoneChange = (inputValue: string) => {
    // Remove all non-digits
    const digitsOnly = inputValue.replace(/\D/g, '');
    
    // Apply length restrictions based on country
    if (expectedLength && digitsOnly.length > expectedLength.max) {
      return; // Don't update if exceeds max length
    }
    
    onValueChange(digitsOnly);
    
    // Validate
    if (digitsOnly.length === 0) {
      if (required) {
        setError('This field is required');
      } else {
        setError('');
      }
    } else if (expectedLength) {
      if (digitsOnly.length < expectedLength.min) {
        // Still typing, show helpful message
        setError('');
      } else if (digitsOnly.length === expectedLength.min || digitsOnly.length === expectedLength.max) {
        // Full number entered, validate it
        const isValid = isValidPhoneNumber(digitsOnly, countryCode);
        if (!isValid) {
          setError('Invalid phone number format');
        } else {
          setError('');
        }
      } else if (digitsOnly.length > expectedLength.min && digitsOnly.length < expectedLength.max) {
        // Between min and max, no error yet
        setError('');
      } else {
        setError('');
      }
    } else {
      setError('');
    }
  };

  const handleCountrySelect = (isoCode: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('Selected country ISO code:', isoCode);
    onCountryCodeChange(isoCode);
    setError('');
    onValueChange('');
    setIsOpen(false);
    setSearchQuery('');
  };

  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    if (expectedLength) {
      if (expectedLength.min === expectedLength.max) {
        return `${expectedLength.min} digits`;
      }
      return `${expectedLength.min}-${expectedLength.max} digits`;
    }
    return 'Mobile number';
  };

  // Get flag URL from flagcdn
  const getFlagUrl = (countryIsoCode: string) => {
    return `https://flagcdn.com/w20/${countryIsoCode.toLowerCase()}.png`;
  };

  // Filter countries based on search
  const filteredCountries = searchQuery
    ? SORTED_COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.callingCode.includes(searchQuery) ||
          c.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SORTED_COUNTRIES;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="flex space-x-2">
        {/* Custom Country Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-36 px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              {country && (
                <>
                  <img
                    src={getFlagUrl(country.code)}
                    alt={`${country.name} flag`}
                    className="w-5 h-3.5 object-cover rounded-sm"
                  />
                  <span>{country.callingCode}</span>
                </>
              )}
            </div>
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-[100] mt-1 w-80 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-hidden left-0">
              {/* Search */}
              <div className="p-2 border-b border-gray-200">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search country..."
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Country List */}
              <div className="overflow-y-auto max-h-64">
                {filteredCountries.map((c) => (
                  <div
                    key={c.code}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCountrySelect(c.code, e as any);
                    }}
                    className={`w-full px-3 py-2 flex items-center space-x-3 hover:bg-blue-50 transition-colors text-left cursor-pointer ${
                      c.code === countryCode ? 'bg-blue-100' : ''
                    }`}
                  >
                    <img
                      src={getFlagUrl(c.code)}
                      alt={`${c.name} flag`}
                      className="w-6 h-4 object-cover rounded-sm flex-shrink-0 pointer-events-none"
                    />
                    <span className="flex-1 text-sm truncate pointer-events-none">{c.name}</span>
                    <span className="text-sm text-gray-500 flex-shrink-0 pointer-events-none">{c.callingCode}</span>
                  </div>
                ))}
                {filteredCountries.length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    No countries found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phone Input */}
        <div className="flex-1">
          <input
            type="tel"
            value={value}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder={getPlaceholder()}
            required={required}
            className={`w-full px-4 py-2 border rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 ${
              error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
            }`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}

