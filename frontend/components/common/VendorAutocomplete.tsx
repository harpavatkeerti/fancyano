'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { vendorsApi, type Vendor } from '@/lib/api';

interface VendorAutocompleteProps {
  /** Current text value of the input */
  value: string;
  /** Called when the text value changes (typing) */
  onChange: (value: string) => void;
  /** Called when a vendor is selected from the dropdown */
  onSelect?: (vendor: Vendor) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional className for the input element */
  className?: string;
  /** Label text (rendered above the input) */
  label?: string;
}

export default function VendorAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search or enter vendor name',
  className = '',
  label,
}: VendorAutocompleteProps) {
  const [results, setResults] = useState<Vendor[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await vendorsApi.search(query.trim());
        const vendors = res.data || [];
        setResults(vendors);
        setShowDropdown(vendors.length > 0);
      } catch {
        setResults([]);
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSelect = (vendor: Vendor) => {
    onChange(vendor.name);
    setShowDropdown(false);
    setResults([]);
    onSelect?.(vendor);
  };

  const inputClasses = className || 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}
      <input
        type="text"
        value={value}
        onChange={e => {
          const val = e.target.value;
          onChange(val);
          search(val);
        }}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        className={inputClasses}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((vendor) => (
            <button
              key={vendor.id}
              type="button"
              onClick={() => handleSelect(vendor)}
              className="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors border-b last:border-0"
            >
              <p className="font-medium text-gray-900">{vendor.name}</p>
              {vendor.phone && (
                <p className="text-sm text-gray-500">
                  {vendor.phone}
                  {vendor.gst_number ? ` · GST: ${vendor.gst_number}` : ''}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
      {isSearching && <p className="text-xs text-gray-400 mt-1">Searching vendors...</p>}
    </div>
  );
}
