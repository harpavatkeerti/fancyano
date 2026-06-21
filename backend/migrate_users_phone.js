const pool = require('./src/database/connection');

async function migrate() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20)');
    console.log('✅ Migration done: alternate_phone column added to users table');
  } catch (e) {
    console.error('❌ Migration error:', e.message);
  } finally {
    await pool.end();
  }
}

migrate();
