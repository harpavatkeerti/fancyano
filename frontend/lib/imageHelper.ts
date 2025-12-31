/**
 * Helper function to get the correct image URL
 * Handles both base64 images (old format) and file paths (new format)
 */
export function getImageUrl(imagePath: string | undefined | null): string | null {
  if (!imagePath) return null;

  // If it's already a base64 data URL, return as-is
  if (imagePath.startsWith('data:image')) {
    console.log('Image is base64 format');
    return imagePath;
  }

  // If it's a file path, prepend the backend URL
  if (imagePath.startsWith('/uploads/')) {
    // Get the base backend URL without /api suffix
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const backendUrl = apiUrl.replace('/api', ''); // Remove /api suffix if present
    const fullUrl = `${backendUrl}${imagePath}`;
    console.log('Converting image path to URL:', imagePath, '→', fullUrl);
    return fullUrl;
  }

  // If it's already a full URL (cloud storage), return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    console.log('Image is already a full URL');
    return imagePath;
  }

  // Fallback: return as-is
  console.warn('Unknown image format:', imagePath);
  return imagePath;
}

