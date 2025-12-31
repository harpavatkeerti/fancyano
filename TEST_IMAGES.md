# Image Display Test - MUST DO

## The Problem
Your browser has **cached the old JavaScript code** that doesn't know how to display the images.

## The Solution - DO THIS EXACTLY:

### Step 1: Force Kill Everything
```bash
# Terminal 1 (Frontend)
Ctrl+C
pkill -f "next dev" || true

# Terminal 2 (Backend) 
Ctrl+C
pkill -f "nodemon" || true
```

### Step 2: Start Backend FRESH
```bash
# In Terminal 2:
cd backend
npm run dev
```

Wait for: `Server is running on http://localhost:3001`

### Step 3: Start Frontend FRESH
```bash
# In Terminal 1:
cd frontend
rm -rf .next
npm run dev
```

**The `rm -rf .next` is CRITICAL** - it deletes the build cache.

Wait for: `✓ Ready in X.Xs`

### Step 4: Test Image URL DIRECTLY First

Open this URL in your browser:
```
http://localhost:3001/uploads/products/SH-000156_1767086222335.jpeg
```

**Expected:** You should see the actual image file.

**If you see the image** → Backend is working ✅  
**If 404 error** → Backend needs restart

### Step 5: Clear Browser Completely

**Option A (Recommended):**
1. Open browser
2. Press `Ctrl + Shift + Delete`
3. Select "All time"
4. Check "Cached images and files"
5. Click "Clear data"

**Option B (Quick):**
1. Open browser
2. Press `Ctrl + F5` (or `Ctrl + Shift + R`)
3. Do this 2-3 times

### Step 6: Open Console BEFORE Going to Page

1. Press `F12` (opens DevTools)
2. Click "Console" tab
3. Now navigate to: `http://localhost:3000/admin/inventory`

### Step 7: Look for THIS Message

In the console, you MUST see:
```
🔄 Inventory page loaded with IMAGE HELPER v2.0
```

**If you see this** → Frontend code is updated ✅  
**If you DON'T see this** → Frontend still has old code ❌

### Step 8: Check What's Happening with Images

In the console, look for these logs when images load:
```
Converting image path to URL: /uploads/products/SH-000156_1767086222335.jpeg → http://localhost:3001/uploads/products/SH-000156_1767086222335.jpeg
```

**If you see "Converting image path"** → Helper is working ✅  
**If you see nothing** → Images have wrong format

### Step 9: Inspect the Broken Image

1. Right-click on the broken image in the table
2. Select "Inspect Element"
3. Look at the `<img>` tag
4. Check the `src` attribute

**It should be:**
```html
<img src="http://localhost:3001/uploads/products/SH-000156_1767086222335.jpeg" ...>
```

**If it shows:** `data:image/jpeg;base64...` → Old base64 format (re-upload needed)  
**If it shows:** `/uploads/products/...` (without http://) → Helper not running  
**If it shows:** Full URL with `http://localhost:3001` → Should work!

## Quick Verification Checklist

Before doing anything else, verify:

- [ ] Terminal 2 shows: `Server is running on http://localhost:3001`
- [ ] Terminal 1 shows: `✓ Ready in X.Xs`
- [ ] Browser URL is: `http://localhost:3000/admin/inventory`
- [ ] Console (F12) shows: `🔄 Inventory page loaded with IMAGE HELPER v2.0`
- [ ] Direct image URL works: `http://localhost:3001/uploads/products/SH-000156_1767086222335.jpeg`

## If STILL Not Working After All This

Share these details:

1. **Console logs** - Copy everything from the Console tab (F12)
2. **Inspected img tag** - Right-click broken image → Inspect → copy the `<img>` tag
3. **Network tab** - F12 → Network → reload page → look for failed requests (red)
4. **Terminal output** - Copy last 20 lines from both terminals

## Why This Should Work

The backend IS working (I verified):
- ✅ Images ARE being saved to `storage/uploads/products/`
- ✅ Backend returns correct path `/uploads/products/...`
- ✅ Images ARE accessible at `http://localhost:3001/uploads/products/...`

The frontend code IS correct (I verified):
- ✅ `getImageUrl()` helper function exists
- ✅ It's imported in the inventory page
- ✅ It's used in the img tags
- ✅ No linter or TypeScript errors

The ONLY issue is the browser needs to load the NEW code.

## Emergency Workaround (If Nothing Works)

If after ALL the above steps it still doesn't work, you can directly put the backend URL in the img src temporarily to test:

Edit `frontend/app/admin/inventory/page.tsx` and temporarily change line 210 to:
```typescript
src={`http://localhost:3001${(product as any).image}`}
```

This will prove whether it's a code loading issue or something else.


