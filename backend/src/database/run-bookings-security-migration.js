require('dotenv').config();
const pool = require('./connection');
const fs = require('fs');
const path = require('path');

async function runBookingsSecurityMigration() {
  try {
    console.log('🔄 Running bookings security_deposit migration...');
    
    const migrationPath = path.join(__dirname, 'migrations', '010_add_payment_and_security.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    
    console.log('✅ Bookings security deposit migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

runBookingsSecurityMigration();

