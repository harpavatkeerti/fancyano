# Quick SMTP Setup Guide

## For Gmail Users (Easiest)

### 1. Get Gmail App Password
1. Visit: https://myaccount.google.com/apppasswords
2. Sign in to your Google account
3. Select "Mail" → "Other (Custom name)"
4. Type: "Rental System"
5. Click "Generate"
6. **Copy the 16-character password** (looks like: `abcd efgh ijkl mnop`)

### 2. Edit .env File
Open `backend/.env` file and add these lines at the end:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop
```

**Replace:**
- `your-email@gmail.com` → Your Gmail address
- `abcdefghijklmnop` → The 16-character app password (remove spaces)

### 3. Save and Restart
1. Save the `.env` file
2. Restart backend server: `npm run dev`

### 4. Test
1. Go to any booking → Generate Invoice
2. Click "Email" button
3. Enter customer email
4. Email will be sent with PDF attached! ✅

---

## If .env File Doesn't Exist

Create it in the `backend` folder with this content:

```env
# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password-here
```

---

## Common Issues

**"Invalid login" error?**
- Make sure you're using App Password, not regular password
- Remove spaces from the app password

**"Service not configured" error?**
- Check `.env` file exists in `backend` folder
- Make sure variable names are exactly: `SMTP_HOST`, `SMTP_PORT`, etc.
- Restart server after editing `.env`

**Email not sending?**
- Check backend console for error messages
- Verify internet connection
- Try with a different email provider

