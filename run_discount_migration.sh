#!/bin/bash

# Migration script to add discount fields to bookings table

echo "🔄 Starting discount fields migration..."

# Get database connection details from .env or use defaults
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="rental_db"
DB_USER="postgres"
DB_PASSWORD=""

# Try to read from backend/.env if it exists
if [ -f backend/.env ]; then
    echo "📄 Reading database config from backend/.env..."
    # Use grep and sed to safely extract values (handles Windows line endings)
    DB_HOST=$(grep -E "^DB_HOST=" backend/.env | sed 's/DB_HOST=//' | tr -d '\r' | tr -d '"' | tr -d "'")
    DB_PORT=$(grep -E "^DB_PORT=" backend/.env | sed 's/DB_PORT=//' | tr -d '\r' | tr -d '"' | tr -d "'")
    DB_NAME=$(grep -E "^DB_NAME=" backend/.env | sed 's/DB_NAME=//' | tr -d '\r' | tr -d '"' | tr -d "'")
    DB_USER=$(grep -E "^DB_USER=" backend/.env | sed 's/DB_USER=//' | tr -d '\r' | tr -d '"' | tr -d "'")
    DB_PASSWORD=$(grep -E "^DB_PASSWORD=" backend/.env | sed 's/DB_PASSWORD=//' | tr -d '\r' | tr -d '"' | tr -d "'")
    
    # Use defaults if extraction failed
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_NAME="${DB_NAME:-rental_db}"
    DB_USER="${DB_USER:-postgres}"
fi

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
    echo "📝 Added columns:"
    echo "   - discount_type (VARCHAR)"
    echo "   - discount_value (DECIMAL)"
    echo "   - discount_amount (DECIMAL)"
else
    echo ""
    echo "❌ Migration failed!"
    echo ""
    echo "💡 Try running manually:"
    echo "   psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database/migrations/add_discount_fields.sql"
    exit 1
fi
