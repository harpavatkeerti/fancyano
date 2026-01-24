const pool = require('./src/database/connection');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting new architecture migration...');
    
    await client.query('BEGIN');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'src/database/migrations/017_new_architecture.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute migration
    await client.query(sql);
    
    await client.query('COMMIT');
    console.log('✅ Migration successful: New architecture applied');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
