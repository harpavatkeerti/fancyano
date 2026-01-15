// Script to create the booking_cancellations table
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Build connection config - only include password if it's set (same as backend connection)
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'rental_db',
  user: process.env.DB_USER || 'postgres',
};

// Set password to empty string if not provided (for local PostgreSQL without password)
poolConfig.password = process.env.DB_PASSWORD || '';

const pool = new Pool(poolConfig);

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('==================================================');
    console.log('Running Booking Cancellations Table Migration');
    console.log('==================================================\n');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'src', 'database', 'migrations', '014_booking_cancellations.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📋 Executing migration: 014_booking_cancellations.sql\n');
    
    // Run the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!\n');
    console.log('The booking_cancellations table has been created.');
    console.log('You can now use the booking cancellation feature.\n');
    console.log('==================================================');
    console.log('Migration Complete!');
    console.log('==================================================');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

