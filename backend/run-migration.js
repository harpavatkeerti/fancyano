require('dotenv').config();
const pool = require('./src/database/connection');
const fs = require('fs');

async function runMigration() {
  try {
    const migrationFile = process.argv[2] || './migrations/006_create_credit_notes.sql';
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log(`Running migration: ${migrationFile}`);
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

