# Fix Your Email Configuration

## Current Issue

Your `.env` file has placeholder values that need to be replaced:

**Current (WRONG):**
```env
SMTP_USER=your-email@gmail.com
SMTP_PASS=revi ljrg ipen lwuw
```

## Steps to Fix

### Step 1: Open `.env` File
Open `backend/.env` in a text editor (Notepad, VS Code, etc.)

### Step 2: Replace Placeholder Email
Find this line:
```
SMTP_USER=your-email@gmail.com
```

Replace `your-email@gmail.com` with your **actual Gmail address**, for example:
```
SMTP_USER=mybusiness@gmail.com
```

### Step 3: Fix Password (Remove Spaces)
Find this line:
```
SMTP_PASS=revi ljrg ipen lwuw
```

Remove all spaces from the password:
```
SMTP_PASS=reviljrgipenlwuw
```

### Step 4: Save and Restart
1. Save the `.env` file
2. **Restart your backend server** (very important!)
   - Stop it (Ctrl+C)
   - Start it again: `npm run dev`

### Step 5: Test Again
1. Generate an invoice
2. Click Email button
3. Enter customer email
4. Email should send automatically! ✅

---

## Complete Example

Your `.env` should look like this (with YOUR actual values):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=myactualemail@gmail.com
SMTP_PASS=reviljrgipenlwuw
```

**Important:**
- ✅ Use your REAL Gmail address (not "your-email@gmail.com")
- ✅ Remove ALL spaces from the app password
- ✅ Restart backend server after changes

