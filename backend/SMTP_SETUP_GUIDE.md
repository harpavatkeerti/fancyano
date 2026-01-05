# SMTP Email Configuration Guide

This guide will help you set up SMTP email service to send PDF invoices/estimates via email with automatic PDF attachment.

## Step-by-Step Setup

### Step 1: Locate or Create the `.env` File

1. Navigate to the `backend` folder in your project
2. Check if a `.env` file exists (it might be hidden)
3. If it doesn't exist, create a new file named `.env`

### Step 2: Choose Your Email Provider

#### Option A: Gmail (Recommended for Testing)

**Step 2.1: Enable 2-Step Verification**
1. Go to https://myaccount.google.com/security
2. Under "Signing in to Google", click "2-Step Verification"
3. Follow the prompts to enable it

**Step 2.2: Generate App Password**
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" as the app
3. Select "Other (Custom name)" as the device
4. Enter "Rental System" as the name
5. Click "Generate"
6. **Copy the 16-character password** (you'll need this for Step 3)

**Step 2.3: Add to .env File**
Add these lines to your `.env` file:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
```

Replace:
- `your-email@gmail.com` with your Gmail address
- `your-16-character-app-password` with the password from Step 2.2

---

#### Option B: Outlook/Hotmail

**Step 2.1: Enable App Password**
1. Go to https://account.microsoft.com/security
2. Click "Advanced security options"
3. Under "App passwords", create a new app password
4. Copy the generated password

**Step 2.2: Add to .env File**
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-app-password
```

---

#### Option C: Yahoo Mail

**Step 2.1: Generate App Password**
1. Go to https://login.yahoo.com/account/security
2. Enable "Generate app password"
3. Create an app password for "Mail"
4. Copy the generated password

**Step 2.2: Add to .env File**
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-app-password
```

---

#### Option D: Custom SMTP Server

If you have your own email server or use a different provider:

```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-password
```

**Common SMTP Ports:**
- `587` - TLS (recommended)
- `465` - SSL (set `SMTP_SECURE=true`)
- `25` - Usually blocked by ISPs

---

### Step 3: Complete .env File Example

Your complete `.env` file should look something like this:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rental_db
DB_USER=postgres
DB_PASSWORD=your-db-password

# Server Configuration
PORT=3001

# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

**Important Notes:**
- Remove spaces from the app password if Gmail shows it with spaces
- Keep the `.env` file secure and never commit it to Git
- The `.env` file is already in `.gitignore` to protect your credentials

---

### Step 4: Restart Backend Server

After adding SMTP configuration:

1. Stop your backend server (Ctrl+C if running)
2. Restart it:
   ```bash
   cd backend
   npm run dev
   ```

---

### Step 5: Test Email Functionality

1. Go to any booking order details page
2. Generate an Invoice/Estimate
3. Click the "Email" button
4. Enter the customer's email address when prompted
5. The email should be sent automatically with PDF attachment

---

## Troubleshooting

### Error: "Email service not configured"
- Check that all SMTP variables are in your `.env` file
- Make sure there are no typos in variable names
- Restart the backend server after adding variables

### Error: "Invalid login credentials"
- For Gmail: Make sure you're using an App Password, not your regular password
- Verify 2-Step Verification is enabled
- Check that the password has no spaces

### Error: "Connection timeout"
- Check your internet connection
- Verify the SMTP_HOST and SMTP_PORT are correct
- Some networks block SMTP ports - try a different network

### Error: "PDF file not found"
- Make sure you've generated the PDF first (click Estimate/Invoice button)
- The PDF must be generated before sending email

---

## Security Best Practices

1. ✅ Never commit `.env` file to Git (already in `.gitignore`)
2. ✅ Use App Passwords instead of regular passwords
3. ✅ Keep your `.env` file secure and backed up
4. ✅ Rotate passwords periodically
5. ✅ Use different email accounts for development and production

---

## Quick Reference

**Gmail SMTP Settings:**
- Host: `smtp.gmail.com`
- Port: `587`
- Security: `false` (TLS)
- Requires: App Password (not regular password)

**Outlook SMTP Settings:**
- Host: `smtp-mail.outlook.com`
- Port: `587`
- Security: `false` (TLS)
- Requires: App Password

**Yahoo SMTP Settings:**
- Host: `smtp.mail.yahoo.com`
- Port: `587`
- Security: `false` (TLS)
- Requires: App Password

---

## Need Help?

If you encounter issues:
1. Check the backend console logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test with a simple email first
4. Make sure nodemailer package is installed: `npm install nodemailer`

