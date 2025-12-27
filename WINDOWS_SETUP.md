# Windows Setup Guide

## PowerShell Execution Policy Issue

If you encounter the error:
```
File cannot be loaded because running scripts is disabled on this system
```

Here are **3 ways** to fix it:

### Solution 1: Use Batch File (Easiest - No Policy Changes)

Simply run:
```cmd
.\setup.cmd
```

This batch file doesn't require any execution policy changes and will work immediately.

### Solution 2: Bypass Policy for This Script Only

Run PowerShell with bypass flag:
```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

This runs the script without changing your system's execution policy permanently.

### Solution 3: Change Execution Policy (Permanent)

If you want to allow scripts to run in the future:

**For Current User Only (Recommended):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then you can run:
```powershell
.\setup.ps1
```

**For All Users (Requires Admin):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine
```

**Note:** You may need to run PowerShell as Administrator for the LocalMachine scope.

## Manual Setup (If Scripts Don't Work)

If you prefer to set up manually:

### 1. Create Storage Directories
```cmd
mkdir storage\uploads\products
mkdir storage\uploads\invoices
mkdir storage\uploads\profiles
```

### 2. Install Dependencies
```cmd
REM Root
npm install

REM Frontend
cd frontend
npm install
cd ..

REM Backend
cd backend
npm install
cd ..
```

### 3. Create Environment Files

**Backend:**
```cmd
copy backend\.env.example backend\.env
```
Then edit `backend\.env` with your database credentials.

**Frontend:**
```cmd
copy frontend\.env.local.example frontend\.env.local
```

### 4. Set Up Database

1. Create PostgreSQL database:
```cmd
createdb -U postgres rental_db
```

2. Run migration:
```cmd
cd backend
npm run db:migrate
cd ..
```

3. (Optional) Seed database:
```cmd
cd backend
npm run db:seed
cd ..
```

### 5. Start Development

```cmd
npm run dev
```

## Troubleshooting

### PostgreSQL Command Not Found

If `createdb` command is not found:
1. Add PostgreSQL bin directory to your PATH
2. Or use pgAdmin to create the database
3. Or use psql:
```cmd
psql -U postgres
CREATE DATABASE rental_db;
\q
```

### Port Already in Use

If ports 3000 or 3001 are already in use:

**Find and kill the process:**
```cmd
netstat -ano | findstr :3001
taskkill /PID <PID_NUMBER> /F
```

**Or change the port in:**
- Backend: `backend\.env` → `PORT=3002`
- Frontend: `frontend\package.json` → `"dev": "next dev -p 3002"`

