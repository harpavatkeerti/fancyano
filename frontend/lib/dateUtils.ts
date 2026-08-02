/**
 * Date utility functions for consistent formatting
 * Uses DD/MM/YYYY format throughout the application
 */

/**
 * Format date to DD/MM/YYYY
 */
export function formatDate(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format date with time to DD/MM/YYYY, HH:MM AM/PM
 */
export function formatDateTime(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format date to long format: DD Month YYYY
 */
export function formatDateLong(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Format date for input fields (YYYY-MM-DD)
 */
export function formatDateForInput(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  return d.toISOString().split('T')[0];
}

/**
 * Get ordinal suffix for a day number (1st, 2nd, 3rd, 4th, etc.)
 */
function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Format a date with ordinal day suffix for management tables.
 * Example: "11th Jul, 2026, 04:30 PM"
 * Returns '-' for null/undefined/empty values.
 */
export function formatDateWithOrdinal(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    const time = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${day}${getOrdinalSuffix(day)} ${month}, ${year}, ${time}`;
  } catch {
    return dateString || '-';
  }
}
