#!/bin/bash

# Migration script to rename exchange_charge to rent_diff
# This reflects the streamlined exchange logic

echo "Starting migration: Rename exchange_charge to rent_diff..."

# Try different authentication methods
if command -v sudo &> /dev/null; then
    # Try with sudo -u postgres (most common in WSL)
    sudo -u postgres psql -d rental_db -f backend/src/database/migrations/013_rename_exchange_charge_to_rent_diff.sql
elif [ -n "$PGPASSWORD" ]; then
    # If PGPASSWORD is set, use it
    psql -U postgres -d rental_db -f backend/src/database/migrations/013_rename_exchange_charge_to_rent_diff.sql
else
    # Try without password (trust authentication)
    psql -U postgres -d rental_db -f backend/src/database/migrations/013_rename_exchange_charge_to_rent_diff.sql
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "Changes made:"
    echo "  - Renamed column 'exchange_charge' to 'rent_diff' in product_exchanges table"
    echo "  - Updated column comment to reflect new purpose"
    echo "  - Updated settings key from 'exchange_charges' to 'rent_diff_enabled'"
    echo ""
    echo "Note: Code has been updated to use 'rentDiff' variable naming throughout."
else
    echo ""
    echo "❌ Migration failed! Please check the error messages above."
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Make sure PostgreSQL is running: sudo service postgresql start"
    echo "  2. Try running with sudo: sudo ./run_exchange_rename_migration.sh"
    echo "  3. Or run the SQL directly: sudo -u postgres psql -d rental_db -f backend/src/database/migrations/013_rename_exchange_charge_to_rent_diff.sql"
    exit 1
fi

