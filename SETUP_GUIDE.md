# Setup Guide - Rental Booking System

## Quick Start

### Windows (PowerShell)
```powershell
.\setup.ps1
```

### Linux/Mac (Bash)
```bash
chmod +x setup.sh
./setup.sh
```

## Manual Setup

### 1. Install Dependencies

```bash
# Root
npm install

# Frontend
cd frontend
npm install
cd ..

# Backend
cd backend
npm install
cd ..
```

### 2. Database Setup

#### Install PostgreSQL
- Download from: https://www.postgresql.org/download/
- Or use package manager:
  - Windows: `choco install postgresql` or download installer
  - Mac: `brew install postgresql`
  - Linux: `sudo apt-get install postgresql`

#### Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE rental_db;

# Exit
\q
```

Or using command line:
```bash
createdb -U postgres rental_db
```

### 3. Environment Configuration

#### Backend (.env)
Copy `backend/.env.example` to `backend/.env` and update:

```env
PORT=3001
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=rental_db
DB_USER=postgres
DB_PASSWORD=your_password

UPLOAD_DIR=../storage/uploads
MAX_FILE_SIZE=5242880
```

#### Frontend (.env.local)
Copy `frontend/.env.local.example` to `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### 4. Create Storage Directories

```bash
# Windows PowerShell
New-Item -ItemType Directory -Force -Path "storage\uploads\products"
New-Item -ItemType Directory -Force -Path "storage\uploads\invoices"
New-Item -ItemType Directory -Force -Path "storage\uploads\profiles"

# Linux/Mac
mkdir -p storage/uploads/products
mkdir -p storage/uploads/invoices
mkdir -p storage/uploads/profiles
```

### 5. Run Database Migration

```bash
cd backend
npm run db:migrate
```

This will create all necessary tables in your PostgreSQL database.

### 6. (Optional) Seed Database

```bash
cd backend
npm run db:seed
```

This will add sample products and users to your database.

### 7. Start Development Servers

#### Option 1: Run Both Together
```bash
npm run dev
```

#### Option 2: Run Separately
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

## Project Structure

```
rental-booking-system/
├── frontend/                 # Next.js application
│   ├── app/                 # App router pages
│   ├── components/          # React components
│   ├── lib/                 # Utilities and API client
│   └── types/               # TypeScript types
├── backend/                 # Node.js/Express API
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── database/       # DB connection and migrations
│   │   └── server.js       # Express server
│   └── .env                # Environment variables
├── database/               # Database scripts
│   └── schema.sql          # Database schema
└── storage/                # Local file storage
    └── uploads/            # Uploaded files
```

## Troubleshooting

### Database Connection Issues

1. **Check PostgreSQL is running:**
   ```bash
   # Windows
   Get-Service postgresql*
   
   # Linux/Mac
   sudo systemctl status postgresql
   ```

2. **Verify credentials in backend/.env**

3. **Test connection:**
   ```bash
   psql -U postgres -d rental_db
   ```

### Port Already in Use

If port 3000 or 3001 is already in use:

1. **Change port in configuration:**
   - Frontend: `frontend/package.json` → `"dev": "next dev -p 3002"`
   - Backend: `backend/.env` → `PORT=3002`

2. **Or kill the process using the port:**
   ```bash
   # Windows
   netstat -ano | findstr :3001
   taskkill /PID <PID> /F
   
   # Linux/Mac
   lsof -ti:3001 | xargs kill
   ```

### Module Not Found Errors

```bash
# Delete node_modules and reinstall
rm -rf node_modules frontend/node_modules backend/node_modules
npm run install:all
```

## Development Tips

1. **Database Changes**: Update `backend/src/database/schema.sql` and run migration again
2. **API Testing**: Use Postman or curl to test endpoints
3. **Frontend Changes**: Next.js hot-reloads automatically
4. **Backend Changes**: Nodemon auto-restarts the server

## Next Steps

1. Review the API routes in `backend/src/routes/`
2. Start building frontend pages in `frontend/app/`
3. Customize the database schema as needed
4. Add more features based on your requirements

