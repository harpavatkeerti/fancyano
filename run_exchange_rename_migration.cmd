@echo off
REM Migration script to rename exchange_charge to rent_diff
REM This reflects the streamlined exchange logic

echo Starting migration: Rename exchange_charge to rent_diff...
echo.

REM Run the migration using WSL with sudo
wsl bash -c "sudo -u postgres psql -d rental_db -f backend/src/database/migrations/013_rename_exchange_charge_to_rent_diff.sql"

if %errorlevel% equ 0 (
    echo.
    echo ✅ Migration completed successfully!
    echo.
    echo Changes made:
    echo   - Renamed column 'exchange_charge' to 'rent_diff' in product_exchanges table
    echo   - Updated column comment to reflect new purpose
    echo   - Updated settings key from 'exchange_charges' to 'rent_diff_enabled'
    echo.
    echo Note: Code has been updated to use 'rentDiff' variable naming throughout.
) else (
    echo.
    echo ❌ Migration failed! Please check the error messages above.
    echo.
    echo Troubleshooting tips:
    echo   1. Make sure PostgreSQL is running: wsl sudo service postgresql start
    echo   2. Try running the migration manually: wsl sudo -u postgres psql -d rental_db -f backend/src/database/migrations/013_rename_exchange_charge_to_rent_diff.sql
    exit /b 1
)

pause

