/**
 * Helper function to get the correct image URL
 * Handles both base64 images (old format) and file paths (new format)
 */
export function getImageUrl(imagePath: string | undefined | null): string | null {
  if (!imagePath) return null;

  // If it's already a base64 data URL, return as-is
  if (imagePath.startsWith('data:image')) {
    return imagePath;
  }

  // If it's a file path, prepend the backend URL
  if (imagePath.startsWith('/uploads/')) {
    // Get the base backend URL without /api suffix
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const backendUrl = apiUrl.replace('/api', ''); // Remove /api suffix if present
    return `${backendUrl}${imagePath}`;
  }

  // If it's already a full URL (cloud storage), return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Fallback: return as-is
  console.warn('Unknown image format:', imagePath);
  return imagePath;
}

