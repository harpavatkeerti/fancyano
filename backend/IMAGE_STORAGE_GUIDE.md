# Image Storage System Guide

## Overview

The application uses a flexible image storage system that can be easily switched between local storage and cloud storage without major code changes.

## Current Configuration

**Storage Type:** Local File System

Images are currently stored locally in:
```
storage/uploads/products/
```

## How It Works

### Local Storage (Current)
- Images are received as base64 from the frontend
- Converted to actual image files (JPEG/PNG)
- Saved to local `storage/uploads/products/` directory
- Filename format: `{productCode}_{timestamp}.{extension}`
- Database stores the relative path: `/uploads/products/{filename}`
- Images served as static files via Express

### Image Processing Flow
1. Frontend sends base64 encoded image
2. Backend receives and validates the image
3. Image storage service processes the image:
   - Extracts image format and data
   - Generates unique filename with product code
   - Saves to configured storage (local or cloud)
4. Returns URL/path to be stored in database
5. Frontend displays images using the stored URL

## Switching to Cloud Storage

### Step 1: Choose Your Cloud Provider

The system is designed to work with popular cloud storage providers:

#### Option A: AWS S3
```bash
npm install aws-sdk
```

#### Option B: Cloudinary
```bash
npm install cloudinary
```

### Step 2: Configure Environment Variables

Add to your `.env` file:

**For AWS S3:**
```env
IMAGE_STORAGE=cloud
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

**For Cloudinary:**
```env
IMAGE_STORAGE=cloud
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Step 3: Implement Cloud Storage

The placeholder code is already in `backend/src/services/imageStorage.js`:

1. Uncomment the cloud storage implementation section
2. Add the necessary npm packages
3. Configure your cloud credentials
4. Test the upload/delete functionality

### Example: AWS S3 Implementation

```javascript
// In imageStorage.js - saveImageToCloud function

const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

async function saveImageToCloud(base64Data, productCode) {
  const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  const imageType = matches[1];
  const base64Image = matches[2];
  const buffer = Buffer.from(base64Image, 'base64');
  
  const timestamp = Date.now();
  const key = `products/${productCode}_${timestamp}.${imageType}`;
  
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: `image/${imageType}`,
    ACL: 'public-read'
  };
  
  const result = await s3.upload(params).promise();
  return result.Location;
}

async function deleteImageFromCloud(imageUrl) {
  const url = new URL(imageUrl);
  const key = url.pathname.substring(1); // Remove leading slash
  
  await s3.deleteObject({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key
  }).promise();
  
  return true;
}
```

### Example: Cloudinary Implementation

```javascript
// In imageStorage.js - saveImageToCloud function

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function saveImageToCloud(base64Data, productCode) {
  const result = await cloudinary.uploader.upload(base64Data, {
    folder: 'products',
    public_id: `${productCode}_${Date.now()}`,
    resource_type: 'image'
  });
  
  return result.secure_url;
}

async function deleteImageFromCloud(imageUrl) {
  const publicId = extractPublicIdFromUrl(imageUrl);
  await cloudinary.uploader.destroy(publicId);
  return true;
}

function extractPublicIdFromUrl(url) {
  // Extract public_id from Cloudinary URL
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  return 'products/' + filename.split('.')[0];
}
```

## Migration from Local to Cloud

If you have existing products with local images and want to migrate to cloud storage:

1. Create a migration script to upload existing images to cloud
2. Update database records with new cloud URLs
3. Optionally delete local files
4. Switch `IMAGE_STORAGE` environment variable to `cloud`

Example migration script structure:

```javascript
// backend/scripts/migrate-images-to-cloud.js

const pool = require('../src/database/connection');
const imageStorage = require('../src/services/imageStorage');
const fs = require('fs');
const path = require('path');

async function migrateImages() {
  const products = await pool.query('SELECT id, code, image FROM products WHERE image LIKE \'/uploads/%\'');
  
  for (const product of products.rows) {
    // Read local file
    const localPath = path.join(__dirname, '../../storage', product.image);
    const imageBuffer = fs.readFileSync(localPath);
    const base64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    
    // Upload to cloud
    const cloudUrl = await imageStorage.saveImage(base64, product.code);
    
    // Update database
    await pool.query('UPDATE products SET image = $1 WHERE id = $2', [cloudUrl, product.id]);
    
    console.log(`Migrated image for product ${product.code}`);
  }
  
  console.log('Migration complete!');
}

migrateImages();
```

## File Structure

```
backend/
├── src/
│   ├── services/
│   │   └── imageStorage.js       # Image storage abstraction layer
│   ├── routes/
│   │   └── products.js            # Uses imageStorage service
│   └── server.js                  # Serves static files
├── storage/
│   └── uploads/
│       └── products/              # Local image storage directory
└── IMAGE_STORAGE_GUIDE.md         # This guide
```

## Advantages of This Architecture

1. **Flexibility**: Switch between local and cloud storage with one environment variable
2. **No Frontend Changes**: Frontend code remains unchanged when switching storage
3. **Easy Testing**: Use local storage in development, cloud in production
4. **Cost Effective**: Start with local storage, migrate to cloud when needed
5. **Future Proof**: Easy to add new storage providers (Google Cloud, Azure, etc.)

## Troubleshooting

### Images not displaying
- Check if `storage/uploads/products/` directory exists
- Verify file permissions
- Check backend console for errors
- Ensure static file serving is working: `http://localhost:3001/uploads/products/{filename}`

### Cloud upload fails
- Verify cloud credentials in `.env`
- Check network connectivity
- Review cloud provider quota/limits
- Check backend logs for detailed errors

## Security Considerations

1. **Local Storage**:
   - Ensure proper file permissions
   - Add `.gitignore` entry for `storage/uploads/`
   - Regular backups

2. **Cloud Storage**:
   - Keep credentials secure (use `.env`, never commit)
   - Use IAM roles with minimum required permissions
   - Enable encryption at rest
   - Set proper CORS policies
   - Consider CDN for better performance

## Performance Optimization

### Current (Local Storage)
- Fast for development
- No external API calls
- Limited by server disk space

### Cloud Storage Benefits
- Unlimited scalability
- CDN distribution
- Automatic backups
- Better performance for global users
- Reduced server load

## Support

For issues or questions about image storage:
1. Check this guide
2. Review `backend/src/services/imageStorage.js` comments
3. Check backend logs for detailed error messages


