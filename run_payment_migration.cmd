@echo off
REM Run Payment History Enhancement Migration (009)
REM This script runs the database migration to add transaction_type column

echo ========================================
echo Payment History Enhancement Migration
echo ========================================
echo.

cd backend

echo Running migration 009...
node run_migration_009.js

echo.
echo ========================================
echo Migration Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Test payment history display in the app
echo 2. Create a new booking payment and verify it shows the actual payment method
echo 3. Perform an exchange and verify the transaction type is displayed correctly
echo.

pause

