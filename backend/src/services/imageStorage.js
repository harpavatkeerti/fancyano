const fs = require('fs');
const path = require('path');

// Storage configuration - can be switched via environment variable
const STORAGE_TYPE = process.env.IMAGE_STORAGE || 'local'; // 'local' or 'cloud'

// Local storage configuration
const UPLOAD_DIR = path.join(__dirname, '../../../storage/uploads/products');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Save image - works for both local and cloud storage
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} productCode - Product code for filename
 * @returns {Promise<string>} - Returns the image URL/path
 */
async function saveImage(base64Data, productCode) {
  if (!base64Data || !base64Data.startsWith('data:image')) {
    throw new Error('Invalid image data');
  }

  if (STORAGE_TYPE === 'local') {
    return saveImageLocally(base64Data, productCode);
  } else if (STORAGE_TYPE === 'cloud') {
    return saveImageToCloud(base64Data, productCode);
  } else {
    throw new Error(`Unknown storage type: ${STORAGE_TYPE}`);
  }
}

/**
 * Delete image - works for both local and cloud storage
 * @param {string} imageUrl - Image URL or path to delete
 * @returns {Promise<boolean>} - Returns true if successful
 */
async function deleteImage(imageUrl) {
  if (!imageUrl) return true;

  if (STORAGE_TYPE === 'local') {
    return deleteImageLocally(imageUrl);
  } else if (STORAGE_TYPE === 'cloud') {
    return deleteImageFromCloud(imageUrl);
  }
  
  return true;
}

/**
 * LOCAL STORAGE IMPLEMENTATION
 */
function saveImageLocally(base64Data, productCode) {
  try {
    // Extract base64 string and format
    const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 image format');
    }

    const imageType = matches[1]; // jpeg, png, etc.
    const base64Image = matches[2];
    const buffer = Buffer.from(base64Image, 'base64');

    // Generate unique filename with timestamp, random number, and hash of image data to prevent collisions
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000000); // Random 6-digit number
    // Create a hash from the ENTIRE base64 image data to ensure uniqueness
    const crypto = require('crypto');
    // Hash the entire image data, not just first 100 chars, to ensure each unique image gets a unique filename
    const imageHash = crypto.createHash('md5').update(base64Image).digest('hex').substring(0, 12);
    const filename = `${productCode}_${timestamp}_${randomSuffix}_${imageHash}.${imageType}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    console.log(`💾 Saving image with hash: ${imageHash.substring(0, 8)}... (full: ${imageHash})`);
    console.log(`   Filename: ${filename}`);
    console.log(`   Image data length: ${base64Image.length} chars`);

    // Save file
    fs.writeFileSync(filepath, buffer);

    // Return relative URL path
    const imageUrl = `/uploads/products/${filename}`;
    console.log(`✅ Image saved successfully: ${filename}`);
    console.log(`   Path returned to frontend: ${imageUrl}`);
    return imageUrl;
  } catch (error) {
    console.error('Error saving image locally:', error);
    throw new Error('Failed to save image locally');
  }
}

function deleteImageLocally(imageUrl) {
  try {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return true;

    const filename = path.basename(imageUrl);
    const filepath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`Deleted local image: ${filename}`);
    }
    return true;
  } catch (error) {
    console.error('Error deleting image locally:', error);
    return false;
  }
}

/**
 * CLOUD STORAGE IMPLEMENTATION (Placeholder for future)
 * Currently returns local storage, but can be replaced with AWS S3, Cloudinary, etc.
 */
async function saveImageToCloud(base64Data, productCode) {
  // TODO: Implement cloud storage (AWS S3, Cloudinary, etc.)
  // For now, fall back to local storage
  console.warn('Cloud storage not yet implemented, using local storage');
  
  /*
   * Future implementation example (AWS S3):
   * 
   * const AWS = require('aws-sdk');
   * const s3 = new AWS.S3({
   *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
   *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
   *   region: process.env.AWS_REGION
   * });
   * 
   * const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
   * const imageType = matches[1];
   * const base64Image = matches[2];
   * const buffer = Buffer.from(base64Image, 'base64');
   * 
   * const timestamp = Date.now();
   * const key = `products/${productCode}_${timestamp}.${imageType}`;
   * 
   * const params = {
   *   Bucket: process.env.AWS_S3_BUCKET,
   *   Key: key,
   *   Body: buffer,
   *   ContentType: `image/${imageType}`,
   *   ACL: 'public-read'
   * };
   * 
   * const result = await s3.upload(params).promise();
   * return result.Location; // Returns the cloud URL
   */

  /*
   * Future implementation example (Cloudinary):
   * 
   * const cloudinary = require('cloudinary').v2;
   * cloudinary.config({
   *   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
   *   api_key: process.env.CLOUDINARY_API_KEY,
   *   api_secret: process.env.CLOUDINARY_API_SECRET
   * });
   * 
   * const result = await cloudinary.uploader.upload(base64Data, {
   *   folder: 'products',
   *   public_id: `${productCode}_${Date.now()}`,
   *   resource_type: 'image'
   * });
   * 
   * return result.secure_url; // Returns the Cloudinary URL
   */

  return saveImageLocally(base64Data, productCode);
}

async function deleteImageFromCloud(imageUrl) {
  // TODO: Implement cloud deletion
  console.warn('Cloud storage deletion not yet implemented');
  
  /*
   * Future implementation example (AWS S3):
   * 
   * const AWS = require('aws-sdk');
   * const s3 = new AWS.S3({...});
   * 
   * const key = extractKeyFromUrl(imageUrl);
   * await s3.deleteObject({
   *   Bucket: process.env.AWS_S3_BUCKET,
   *   Key: key
   * }).promise();
   */

  /*
   * Future implementation example (Cloudinary):
   * 
   * const cloudinary = require('cloudinary').v2;
   * const publicId = extractPublicIdFromUrl(imageUrl);
   * await cloudinary.uploader.destroy(publicId);
   */

  return true;
}

/**
 * Get storage type
 */
function getStorageType() {
  return STORAGE_TYPE;
}

module.exports = {
  saveImage,
  deleteImage,
  getStorageType
};

