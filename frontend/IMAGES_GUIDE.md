# Image Display Fix Guide

## Issue
Images not showing after upload due to migration from base64 storage to file storage.

## What Was Fixed

### 1. Image Helper Function
Created `frontend/lib/imageHelper.ts` that intelligently handles:
- **Base64 images** (old format) - displays directly
- **File paths** (new format) - prepends backend URL
- **Cloud URLs** (future) - displays directly

### 2. Updated Image Display
Modified `frontend/app/admin/inventory/page.tsx` to use the helper function in:
- Product table thumbnails
- Product details modal

## How It Works

The `getImageUrl()` function checks the image path and returns the correct URL:

```typescript
// Base64 (old products)
"data:image/jpeg;base64,/9j/4AAQ..." 
→ Returns as-is

// File path (new products)
"/uploads/products/BL-000101_1234567890.jpeg"
→ Returns "http://localhost:3001/uploads/products/BL-000101_1234567890.jpeg"

// Cloud URL (future)
"https://s3.amazonaws.com/bucket/image.jpg"
→ Returns as-is
```

## Testing

After restarting the frontend:

1. **Old products** (with base64 images) - will display correctly
2. **New products** (with file paths) - will display correctly  
3. **No image** - will show placeholder icon

## Troubleshooting

### Images Still Not Showing?

1. **Check backend is running:**
   ```bash
   # Terminal 2 should show:
   Server is running on http://localhost:3001
   ```

2. **Check frontend is running:**
   ```bash
   # Terminal 1 should show:
   ▲ Next.js 14.2.35
   - Local: http://localhost:3000
   ```

3. **Hard refresh browser:**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

4. **Check browser console** (F12):
   - Look for 404 errors on image URLs
   - Check what URL is being requested

5. **Verify image file exists:**
   ```bash
   ls storage/uploads/products/
   ```

6. **Test image URL directly:**
   - Open: `http://localhost:3001/uploads/products/{filename}`
   - Should show the image

### Common Issues

**Problem:** 404 Not Found for images
- **Solution:** Restart backend server

**Problem:** CORS error
- **Solution:** Backend already has CORS enabled, but verify it's running

**Problem:** Old products show broken image
- **Solution:** Re-upload the image for those products

## Migration for Old Products

If you want to convert old base64 images to files:

1. Edit each product with a base64 image
2. Re-upload the image (or keep the existing one)
3. Save the product
4. The system will automatically convert it to a file

## Environment Variables

The helper function uses these defaults:
- Backend URL: `http://localhost:3001` (development)

For production, create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.com
```

## File Locations

- Image Helper: `frontend/lib/imageHelper.ts`
- Updated Component: `frontend/app/admin/inventory/page.tsx`
- Storage Directory: `storage/uploads/products/`
- Backend Static Server: `backend/src/server.js` (line 17)


