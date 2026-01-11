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

// Only add password if it's provided and not empty
if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
  poolConfig.password = process.env.DB_PASSWORD;
}

const pool = new Pool(poolConfig);

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migration 010: Add booking_cancellations table...');
    console.log(`📊 Connecting to database: ${poolConfig.database} on ${poolConfig.host}`);
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '010_add_booking_cancellations_table.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration 010 completed successfully!');
    console.log('📋 Created booking_cancellations table with extra_refund and note fields');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === '28P01') {
      console.error('');
      console.error('💡 Password authentication failed. Please check:');
      console.error('   1. Your backend/.env file has correct DB_PASSWORD');
      console.error('   2. PostgreSQL is running');
      console.error('   3. Database credentials are correct');
      console.error('');
      console.error('   Current connection settings:');
      console.error(`   - Host: ${poolConfig.host}`);
      console.error(`   - Port: ${poolConfig.port}`);
      console.error(`   - Database: ${poolConfig.database}`);
      console.error(`   - User: ${poolConfig.user}`);
      console.error(`   - Password: ${poolConfig.password ? '(set)' : '(not set)'}`);
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

