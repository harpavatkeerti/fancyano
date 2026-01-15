@echo off
REM Migration script to add discount fields to bookings table (Windows)

echo Starting discount fields migration...

REM Get database connection details from .env or use defaults
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=costume_rental
set DB_USER=postgres

REM Read from backend/.env if it exists
if exist backend\.env (
    for /f "tokens=1,2 delims==" %%a in (backend\.env) do (
        if "%%a"=="DB_HOST" set DB_HOST=%%b
        if "%%a"=="DB_PORT" set DB_PORT=%%b
        if "%%a"=="DB_NAME" set DB_NAME=%%b
        if "%%a"=="DB_USER" set DB_USER=%%b
        if "%%a"=="DB_PASSWORD" set PGPASSWORD=%%b
    )
)

echo Database: %DB_NAME%
echo Host: %DB_HOST%:%DB_PORT%
echo User: %DB_USER%
echo.

REM Run the migration using WSL
wsl psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f database/migrations/add_discount_fields.sql

if %ERRORLEVEL% EQU 0 (
    echo Migration completed successfully!
    echo.
    echo Added columns:
    echo    - discount_type (VARCHAR)
    echo    - discount_value (DECIMAL)
    echo    - discount_amount (DECIMAL)
) else (
    echo Migration failed!
    exit /b 1
)
