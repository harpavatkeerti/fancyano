# How to Run Security Deposit Migration

## Option 1: Using psql (Recommended)

Connect to your PostgreSQL database and run the migration:

```bash
# Connect to PostgreSQL (replace with your database name and user)
psql -U postgres -d rental_db

# Then run the SQL commands:
ALTER TABLE products ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10, 2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN products.security_deposit IS 'Security deposit amount required for this product';

# Exit psql
\q
```

Or run it directly from command line:
```bash
psql -U postgres -d rental_db -f backend/src/database/migrations/add_security_deposit_to_products.sql
```

## Option 2: Using npm Script (Easiest!)

Simply run:

```bash
cd backend
npm run db:migrate:security-deposit
```

This will automatically run the migration using the database credentials from your `backend/.env` file.

## Option 3: Copy and Paste SQL

1. Open your PostgreSQL client (pgAdmin, DBeaver, or psql)
2. Connect to your `rental_db` database
3. Copy and paste this SQL:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10, 2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN products.security_deposit IS 'Security deposit amount required for this product';
```

4. Execute the SQL

## Verify Migration

After running the migration, verify it worked:

```sql
-- Check if column exists
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'security_deposit';
```

You should see the `security_deposit` column with type `numeric`, `is_nullable = NO`, and `column_default = 0`.

