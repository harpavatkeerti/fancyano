// Script to run the created_by migration
const pool = require('./connection');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add created_by column if it doesn't exist
    await client.query(`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
    `);
    
    await client.query('COMMIT');
    console.log('✅ Migration successful: created_by column added to bookings table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
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

