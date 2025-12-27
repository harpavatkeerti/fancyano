# Prerequisites Installation Guide

Before running the setup script, you need to install the following:

## 1. Node.js and npm

### Windows

**Option 1: Official Installer (Recommended)**
1. Download Node.js from: https://nodejs.org/
2. Choose the **LTS (Long Term Support)** version
3. Run the installer and follow the setup wizard
4. Make sure to check "Add to PATH" during installation
5. Restart your terminal/PowerShell after installation

**Option 2: Using Chocolatey**
```powershell
choco install nodejs
```

**Option 3: Using Winget**
```powershell
winget install OpenJS.NodeJS.LTS
```

### Verify Installation

After installation, verify it works:
```cmd
node --version
npm --version
```

You should see version numbers like:
```
v20.10.0
10.2.3
```

### Troubleshooting

**If `node` or `npm` is not recognized:**
1. Restart your terminal/PowerShell
2. Check if Node.js is in your PATH:
   ```cmd
   where node
   where npm
   ```
3. If not found, add Node.js to PATH manually:
   - Usually installed at: `C:\Program Files\nodejs\`
   - Add this to your system PATH environment variable

## 2. PostgreSQL

### Windows

**Option 1: Official Installer**
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer
3. Remember the password you set for the `postgres` user
4. Make sure to install pgAdmin (optional but helpful)

**Option 2: Using Chocolatey**
```powershell
choco install postgresql
```

**Option 3: Using Winget**
```powershell
winget install PostgreSQL.PostgreSQL
```

### Verify Installation

```cmd
psql --version
```

Or connect to PostgreSQL:
```cmd
psql -U postgres
```

### Create Database

After PostgreSQL is installed:
```cmd
createdb -U postgres rental_db
```

Or using psql:
```cmd
psql -U postgres
CREATE DATABASE rental_db;
\q
```

### Troubleshooting

**If PostgreSQL commands are not found:**
- Add PostgreSQL bin directory to PATH:
  - Usually: `C:\Program Files\PostgreSQL\<version>\bin\`
- Or use pgAdmin GUI to create the database

## 3. Git (Optional but Recommended)

### Windows

**Download from:** https://git-scm.com/download/win

Or using package managers:
```powershell
# Chocolatey
choco install git

# Winget
winget install Git.Git
```

## Quick Check Script

Run this to check if everything is installed:

```cmd
@echo off
echo Checking prerequisites...
echo.

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js is installed
    node --version
) else (
    echo [MISSING] Node.js is not installed
    echo Download from: https://nodejs.org/
)

echo.

where npm >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] npm is installed
    npm --version
) else (
    echo [MISSING] npm is not installed
)

echo.

where psql >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL is installed
    psql --version
) else (
    echo [MISSING] PostgreSQL is not installed
    echo Download from: https://www.postgresql.org/download/
)

echo.
pause
```

Save this as `check-prerequisites.cmd` and run it.

## After Installation

1. **Close and reopen your terminal/PowerShell**
2. **Run the setup script:**
   ```cmd
   .\setup.cmd
   ```

## Minimum Versions Required

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher (comes with Node.js)
- **PostgreSQL**: v14.0 or higher

## Need Help?

If you're still having issues:
1. Make sure you've restarted your terminal after installation
2. Check that the programs are in your system PATH
3. Try running the commands directly (node, npm, psql) to see if they work
4. Check the installation directories and add them to PATH if needed

