require('dotenv').config();
const pool = require('./src/database/connection'); // Use the existing connection
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migration 010: Add booking_cancellations table...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '010_add_booking_cancellations_table.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration 010 completed successfully!');
    console.log('📋 Created booking_cancellations table with extra_refund and note fields');
    console.log('');
    console.log('You can now use the cancellation feature with:');
    console.log('  - Extra refund amount field');
    console.log('  - Extra refund note field');
    console.log('  - Proper refund calculation (cancelled products only)');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.code === '28P01') {
      console.error('');
      console.error('💡 Password authentication failed. Please check:');
      console.error('   1. Your backend/.env file has correct DB_PASSWORD');
      console.error('   2. PostgreSQL is running');
      console.error('   3. Database credentials are correct');
    } else if (error.code === '42P07') {
      console.error('');
      console.error('💡 Table already exists. Migration may have been run before.');
      console.error('   This is safe to ignore if the table is already there.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('');
      console.error('💡 Could not connect to database. Please check:');
      console.error('   1. PostgreSQL is running');
      console.error('   2. Database server is accessible');
    }
    
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('');
  console.error('❌ Migration process failed');
  process.exit(1);
});

