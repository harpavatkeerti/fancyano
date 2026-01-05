require('dotenv').config();
const pool = require('./connection');
const fs = require('fs');
const path = require('path');

async function runSecurityDepositMigration() {
  try {
    console.log('🔄 Running security_deposit migration...');
    
    const migrationPath = path.join(__dirname, 'migrations', 'add_security_deposit_to_products.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    
    console.log('✅ Security deposit migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

runSecurityDepositMigration();

