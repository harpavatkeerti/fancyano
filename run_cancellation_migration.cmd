@echo off
echo Running booking cancellations table migration...
echo.

cd backend
node run_migration_010_simple.js

echo.
echo Migration complete!
echo.
echo This migration added the booking_cancellations table to track:
echo   - Cancelled products with rent and security amounts
echo   - Penalty amounts per product
echo   - Extra refund amounts with optional notes
echo   - Final refund calculation
echo.
pause

