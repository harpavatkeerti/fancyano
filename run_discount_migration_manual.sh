#!/bin/bash

# Manual migration script - prompts for database details

echo "🔄 Manual Discount Fields Migration"
echo "===================================="
echo ""

# Prompt for database details
read -p "Database Host (default: localhost): " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "Database Port (default: 5432): " DB_PORT
DB_PORT=${DB_PORT:-5432}

read -p "Database Name (default: rental_db): " DB_NAME
DB_NAME=${DB_NAME:-rental_db}

read -p "Database User (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "Database Password: " DB_PASSWORD
echo ""
echo ""

echo "📊 Database: $DB_NAME"
echo "🖥️  Host: $DB_HOST:$DB_PORT"
echo "👤 User: $DB_USER"
echo ""

# Run the migration
export PGPASSWORD="$DB_PASSWORD"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database/migrations/add_discount_fields.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📝 Added columns to bookings table:"
    echo "   - discount_type (VARCHAR)"
    echo "   - discount_value (DECIMAL)"
    echo "   - discount_amount (DECIMAL)"
else
    echo ""
    echo "❌ Migration failed!"
    exit 1
fi
