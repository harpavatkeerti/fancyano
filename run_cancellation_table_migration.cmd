@echo off
REM Script to run the booking_cancellations table migration on Windows

echo ==================================================
echo Running Booking Cancellations Table Migration
echo ==================================================

cd /d "%~dp0backend"

echo.
echo Running migration: 014_booking_cancellations.sql
echo.

REM Set PostgreSQL password
set PGPASSWORD=rentals

REM Run the migration
psql -h localhost -U rentals -d rentals -f src\database\migrations\014_booking_cancellations.sql

if %errorlevel% equ 0 (
  echo.
  echo Migration completed successfully!
  echo.
  echo The booking_cancellations table has been created.
  echo You can now use the booking cancellation feature.
) else (
  echo.
  echo Migration failed!
  echo Please check the error messages above.
  pause
  exit /b 1
)

echo.
echo ==================================================
echo Migration Complete!
echo ==================================================
pause

