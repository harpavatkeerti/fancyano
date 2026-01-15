#!/bin/bash

# Script to run the booking_cancellations table migration

echo "=================================================="
echo "Running Booking Cancellations Table Migration"
echo "=================================================="

# Navigate to backend directory
cd "$(dirname "$0")/backend" || exit 1

# Check if PostgreSQL is running
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
  echo "❌ PostgreSQL is not running on localhost:5432"
  echo "Please start PostgreSQL first"
  exit 1
fi

echo ""
echo "📋 Running migration: 014_booking_cancellations.sql"
echo ""

# Run the migration
PGPASSWORD=rentals psql -h localhost -U rentals -d rentals -f src/database/migrations/014_booking_cancellations.sql

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration completed successfully!"
  echo ""
  echo "The booking_cancellations table has been created."
  echo "You can now use the booking cancellation feature."
else
  echo ""
  echo "❌ Migration failed!"
  echo "Please check the error messages above."
  exit 1
fi

echo ""
echo "=================================================="
echo "Migration Complete!"
echo "=================================================="

