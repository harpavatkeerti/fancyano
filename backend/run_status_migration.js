const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'rental_db',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, 'src', 'database', 'migrations', '015_add_partially_cancelled_status.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration: 015_add_partially_cancelled_status.sql');
    console.log('This will add "partially_cancelled" status to the bookings table...\n');

    // Execute the migration
    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('The bookings table now accepts "partially_cancelled" status.');
    
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

