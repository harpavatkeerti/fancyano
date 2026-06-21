'use client';

/**
 * @deprecated Use FlagIcon from '@/components/common' instead.
 * This component now delegates to FlagIcon for local SVG rendering.
 */
import FlagIcon from './FlagIcon';

interface CountryFlagProps {
  countryCode: string; // ISO 3166-1 alpha-2 code
  className?: string;
}

export default function CountryFlag({ countryCode, className = 'w-6 h-4' }: CountryFlagProps) {
  return <FlagIcon countryCode={countryCode} className={className} />;
}
