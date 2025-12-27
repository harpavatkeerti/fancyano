# Quick Fix: Migration Password Error

## The Problem

The error `client password must be a string` means your `backend/.env` file is missing or has an invalid password setting.

## Quick Fix (3 Steps)

### Step 1: Create/Check .env file

In WSL, run:
```bash
cd backend

# Check if .env exists
ls -la .env

# If it doesn't exist, create it from example
cp .env.example .env
```

### Step 2: Edit .env file

Open `backend/.env` and make sure it looks like this:

**If PostgreSQL has NO password (common in WSL):**
```env
PORT=3001
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=rental_db
DB_USER=postgres
DB_PASSWORD=

UPLOAD_DIR=../storage/uploads
MAX_FILE_SIZE=5242880
```

**If PostgreSQL HAS a password:**
```env
PORT=3001
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=rental_db
DB_USER=postgres
DB_PASSWORD=your_actual_password_here

UPLOAD_DIR=../storage/uploads
MAX_FILE_SIZE=5242880
```

### Step 3: Run migration again

```bash
npm run db:migrate
```

## Why Migration is Needed

Migration creates all the database tables your app needs:
- Users table
- Products table  
- Bookings table
- And more...

**Without migration, your app won't work** because there are no tables to store data in!

## Test Connection First

Before migrating, test if you can connect:

```bash
psql -U postgres -d rental_db
```

If this works without asking for a password, then leave `DB_PASSWORD=` empty in `.env`.

If it asks for a password, set that password in `DB_PASSWORD=` in `.env`.

