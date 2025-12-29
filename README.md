# Rental Booking Management System

A full-stack application for managing rental store bookings with support for Admin, Salesman, and Customer roles.

To open terminal window, ctrl + `
Ensure that phone and machine are connected to same wifi
Open new WSL window, use + sign (or down arrow near +)
In first window, run
```bash
cd backend
npm run dev
```

For web, open another terminal window in same manner
```bash
cd frontend
npm run dev
```
To view, open http://localhost:3000/ in chrome

For mobile app, open another termninal window
```bash
cd mobile
npm run start:lan
```
To view, open Expo Go app (SDK version 49) in phone and scan QR
Note: Use Expo Go SDK 49 - SDK 54 has compatibility issues with React Navigation

To kill any running process, Ctrl + C
To copy in a terminal window, Ctrl + shift + C
To paste, Ctrl + V

## Project Structure

```
rental-booking-system/
├── frontend/          # Next.js web application
├── backend/           # Node.js/Express API server
├── database/          # PostgreSQL database scripts
└── storage/           # Local file storage
```

## Tech Stack

- **Frontend**: Next.js 14 (React)
- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **File Storage**: Local filesystem

## Prerequisites

**⚠️ IMPORTANT: Install these before running setup!**

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **PostgreSQL** (v14 or higher) - [Download here](https://www.postgresql.org/download/)
- **npm** (comes with Node.js)

> 📖 **Need help installing?** See [PREREQUISITES.md](PREREQUISITES.md) for detailed installation instructions.

**Quick Check:**
```cmd
node --version
npm --version
psql --version
```

If any command is not recognized, you need to install that software first.

## Setup Instructions

### Quick Setup (Windows)

**⚠️ Make sure Node.js and npm are installed first!** (See Prerequisites above)

**Option 1: Use Batch File (Recommended for Windows)**
```cmd
.\setup.cmd
```

The script will check if npm is installed and show helpful error messages if not.

**Option 2: Use PowerShell with Bypass**
```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

**Option 3: Manual Setup**
Follow the steps below.

### 1. Install Dependencies

**Automated:**
```bash
npm run install:all
```

**Or install individually:**
```bash
# Root
npm install

# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### 2. Database Setup

1. Create PostgreSQL database:
```bash
createdb rental_db
```

2. Update database credentials in `backend/.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rental_db
DB_USER=your_username
DB_PASSWORD=your_password
```

3. Run database migrations:
```bash
cd backend
npm run db:migrate
```

### 3. Environment Configuration

#### Backend (.env)
```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rental_db
DB_USER=postgres
DB_PASSWORD=your_password

# File Storage
UPLOAD_DIR=../storage/uploads
MAX_FILE_SIZE=5242880
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### 4. Create Storage Directories

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "storage\uploads\products"
New-Item -ItemType Directory -Force -Path "storage\uploads\invoices"
New-Item -ItemType Directory -Force -Path "storage\uploads\profiles"
```

**Windows (CMD):**
```cmd
mkdir storage\uploads\products
mkdir storage\uploads\invoices
mkdir storage\uploads\profiles
```

**Linux/Mac:**
```bash
mkdir -p storage/uploads/products
mkdir -p storage/uploads/invoices
mkdir -p storage/uploads/profiles
```

### 5. Start Development Servers

Run both frontend and backend:
```bash
npm run dev
```

Or run separately:
```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Development

### Backend API Endpoints

- `GET /api/health` - Health check
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/bookings` - List bookings
- `POST /api/bookings` - Create booking

### Database Schema

See `database/schema.sql` for the complete database schema.

## Project Status

This is an MVP version without:
- Authentication/Authorization
- Payment processing
- Notifications
- Redis caching

These features can be added in future iterations.

