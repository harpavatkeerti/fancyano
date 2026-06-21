'use client';

import * as Flags from 'country-flag-icons/react/3x2';
import { hasFlag } from 'country-flag-icons';

interface FlagIconProps {
  /** ISO 3166-1 alpha-2 country code e.g. 'IN', 'US' */
  countryCode: string;
  /** Tailwind classes applied to the SVG element */
  className?: string;
  /** Accessible alt text; defaults to the country code */
  alt?: string;
}

/**
 * Renders a country flag as an inline SVG using the locally-bundled
 * `country-flag-icons` package (3:2 aspect ratio).
 *
 * No network request is made — all SVG data is compiled into the bundle.
 */
export default function FlagIcon({ countryCode, className = 'w-5 h-3.5', alt }: FlagIconProps) {
  const code = countryCode?.toUpperCase();
  if (!code || !hasFlag(code)) return null;

  // Flags is a map of { 'IN': ReactComponent, 'US': ReactComponent, ... }
  const Flag = (Flags as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[code];
  if (!Flag) return null;

  return (
    <Flag
      className={className}
      aria-label={alt ?? code}
      role="img"
    />
  );
}
