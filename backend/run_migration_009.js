require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/database/connection');

async function runMigration() {
  try {
    console.log('🚀 Starting migration 009: Add transaction_type column...\n');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '009_add_transaction_type.sql'),
      'utf8'
    );
    
    await pool.query(migrationSQL);
    
    console.log('✅ Migration 009 completed successfully!\n');
    console.log('📊 Summary:');
    console.log('   - Added transaction_type column to payment_transactions table');
    console.log('   - Migrated existing exchange/cancellation transactions');
    console.log('   - Extracted payment methods from notes for exchange transactions\n');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();

