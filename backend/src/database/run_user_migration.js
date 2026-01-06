const fs = require('fs');
const path = require('path');
const pool = require('./connection');

async function runMigration() {
  try {
    console.log('🚀 Running user credentials migration...');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'migrations', 'add_user_credentials.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the migration
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

