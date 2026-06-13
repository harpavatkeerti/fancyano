import { SERVER_BASE_URL } from './api';

/**
 * Helper function to get the correct image URL
 * Handles both base64 images (old format) and file paths (new format)
 * Also handles arrays of images (returns first image)
 */
export function getImageUrl(imagePath: string | string[] | undefined | null | any): string | null {
  // Handle null, undefined, or empty values
  if (!imagePath) return null;

  // Handle arrays - return first image
  if (Array.isArray(imagePath)) {
    if (imagePath.length === 0) return null;
    // Recursively call with first image
    return getImageUrl(imagePath[0]);
  }

  // Handle objects (in case image is wrapped in an object)
  if (typeof imagePath === 'object' && imagePath !== null) {
    // Try to extract a string value from the object
    if (imagePath.url) return getImageUrl(imagePath.url);
    if (imagePath.path) return getImageUrl(imagePath.path);
    if (imagePath.image) return getImageUrl(imagePath.image);
    // If it's an object with numeric keys (array-like object), try to get first value
    const firstKey = Object.keys(imagePath)[0];
    if (firstKey !== undefined) {
      return getImageUrl(imagePath[firstKey]);
    }
    console.warn('Invalid image object format:', imagePath);
    return null;
  }

  // Ensure it's a string before calling string methods
  if (typeof imagePath !== 'string') {
    console.warn('Invalid image path type:', typeof imagePath, imagePath);
    return null;
  }

  // Try to parse as JSON array (in case it's stored as JSON string)
  if (imagePath.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(imagePath);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return getImageUrl(parsed[0]);
      }
    } catch (e) {
      // Not valid JSON, continue
    }
  }

  // If it's already a base64 data URL, return as-is
  if (imagePath.startsWith('data:image')) {
    return imagePath;
  }

  // If it's a file path, prepend the backend URL
  if (imagePath.startsWith('/uploads/')) {
    // Get the base backend URL without /api suffix
    return `${SERVER_BASE_URL}${imagePath}`;
  }

  // If it's already a full URL (cloud storage), return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Fallback: return as-is (might be a valid path we don't recognize)
  return imagePath;
}

