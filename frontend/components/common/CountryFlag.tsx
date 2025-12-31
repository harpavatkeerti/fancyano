'use client';

interface CountryFlagProps {
  countryCode: string; // ISO 3166-1 alpha-2 code
  className?: string;
}

export default function CountryFlag({ countryCode, className = 'w-6 h-4' }: CountryFlagProps) {
  // Use flag-icons CDN for reliable SVG flags
  const flagUrl = `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`;
  
  return (
    <img 
      src={flagUrl} 
      alt={`${countryCode} flag`}
      className={className}
      onError={(e) => {
        // Fallback to emoji if image fails to load
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
      }}
    />
  );
}

