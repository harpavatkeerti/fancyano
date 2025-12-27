@echo off
echo ========================================
echo Prerequisites Check
echo ========================================
echo.

set MISSING=0

echo Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js is installed
    node --version
) else (
    echo [MISSING] Node.js is not installed
    echo          Download from: https://nodejs.org/
    set /a MISSING+=1
)

echo.

echo Checking npm...
where npm >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] npm is installed
    npm --version
) else (
    echo [MISSING] npm is not installed
    echo          npm comes with Node.js
    set /a MISSING+=1
)

echo.

echo Checking PostgreSQL...
where psql >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL is installed
    psql --version
) else (
    echo [MISSING] PostgreSQL is not installed
    echo          Download from: https://www.postgresql.org/download/
    set /a MISSING+=1
)

echo.
echo ========================================

if %MISSING% EQU 0 (
    echo All prerequisites are installed!
    echo You can now run: .\setup.cmd
    color 0A
) else (
    echo %MISSING% prerequisite(s) missing.
    echo Please install the missing software before running setup.
    echo See PREREQUISITES.md for detailed instructions.
    color 0C
)

echo ========================================
echo.
pause

