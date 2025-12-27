@echo off
echo Setting up Rental Booking System...
echo.

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed or not in your PATH.
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Node.js includes npm automatically.
    echo.
    echo After installing Node.js:
    echo 1. Close and reopen this terminal
    echo 2. Run this script again: .\setup.cmd
    echo.
    pause
    exit /b 1
)

REM Check Node.js version
echo Checking Node.js installation...
node --version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo npm version:
npm --version
echo.

REM Create storage directories
echo Creating storage directories...
if not exist "storage\uploads\products" mkdir "storage\uploads\products"
if not exist "storage\uploads\invoices" mkdir "storage\uploads\invoices"
if not exist "storage\uploads\profiles" mkdir "storage\uploads\profiles"

REM Install root dependencies
echo Installing root dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install root dependencies
    pause
    exit /b 1
)

REM Install frontend dependencies
echo Installing frontend dependencies...
cd frontend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install frontend dependencies
    cd ..
    pause
    exit /b 1
)
cd ..

REM Install backend dependencies
echo Installing backend dependencies...
cd backend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install backend dependencies
    cd ..
    pause
    exit /b 1
)
cd ..

REM Copy environment files
echo Setting up environment files...
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env"
    echo Created backend\.env - Please update with your database credentials
)

if not exist "frontend\.env.local" (
    copy "frontend\.env.local.example" "frontend\.env.local"
    echo Created frontend\.env.local
)

echo.
echo Setup complete!
echo.
echo Next steps:
echo 1. Update backend\.env with your PostgreSQL credentials
echo 2. Create PostgreSQL database: createdb rental_db
echo 3. Run database migration: cd backend ^&^& npm run db:migrate
echo 4. (Optional) Seed database: cd backend ^&^& npm run db:seed
echo 5. Start development: npm run dev
pause

