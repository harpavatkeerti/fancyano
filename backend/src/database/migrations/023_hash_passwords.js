/**
 * Migration: Hash all existing passwords with bcrypt
 * 
 * This script:
 * 1. Reads all users from the users table
 * 2. Hashes existing plain-text passwords with bcrypt (salt rounds = 10)
 * 3. Sets a default password for users without passwords (their username, hashed)
 * 4. Ensures an admin user exists with password 'admin' (hashed)
 * 5. Logs progress for each user
 * 
 * Run with: node backend/src/database/migrations/023_hash_passwords.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const bcrypt = require('bcryptjs');
const pool = require('../connection');

const SALT_ROUNDS = 10;

async function hashPasswords() {
  console.log('🔐 Starting password hashing migration...\n');

  try {
    // 1. Get all users
    const result = await pool.query('SELECT id, name, username, password, role FROM users ORDER BY id');
    const users = result.rows;
    console.log(`📋 Found ${users.length} users to process\n`);

    let hashed = 0;
    let defaultSet = 0;
    let alreadyHashed = 0;

    for (const user of users) {
      // Check if password looks like it's already hashed (bcrypt hashes start with $2a$ or $2b$)
      if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
        console.log(`  ✓ User #${user.id} (${user.name}) — already hashed, skipping`);
        alreadyHashed++;
        continue;
      }

      if (user.password && user.password.trim() !== '') {
        // Has a plain-text password — hash it
        const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
        console.log(`  🔒 User #${user.id} (${user.name}) — hashed existing password`);
        hashed++;
      } else {
        // No password — set default (username as password)
        const defaultPassword = user.username || user.name.toLowerCase().replace(/\s+/g, '');
        const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
        console.log(`  🔑 User #${user.id} (${user.name}) — set default password (username: ${defaultPassword})`);
        defaultSet++;
      }
    }

    // 2. Ensure an admin user exists
    const adminCheck = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      // No admin exists — create one
      const adminPassword = await bcrypt.hash('admin', SALT_ROUNDS);
      await pool.query(
        "INSERT INTO users (name, username, password, role, phone) VALUES ('Admin', 'admin', $1, 'admin', '0000000000')",
        [adminPassword]
      );
      console.log(`\n  🆕 Created admin user (username: admin, password: admin)`);
    } else {
      // Admin exists — ensure password is 'admin' (hashed) if it was just migrated
      const adminUser = await pool.query("SELECT id, password FROM users WHERE role = 'admin' LIMIT 1");
      const admin = adminUser.rows[0];
      // Only set to 'admin' if password was just defaulted (not if user already had a custom password)
      // We'll check if the current hashed password matches 'admin'
      const isAlreadyAdmin = await bcrypt.compare('admin', admin.password);
      if (!isAlreadyAdmin) {
        // Check if we should override — only if the admin didn't have a custom password before
        // Since we can't know for sure, we'll leave the admin's password as-is after hashing
        console.log(`\n  ℹ️  Admin user #${admin.id} exists with a custom password (kept as-is)`);
      } else {
        console.log(`\n  ✓ Admin user already has password 'admin'`);
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Hashed existing passwords: ${hashed}`);
    console.log(`   Set default passwords: ${defaultSet}`);
    console.log(`   Already hashed (skipped): ${alreadyHashed}`);
    console.log(`   Total users processed: ${users.length}`);
    console.log(`\n✅ Password hashing migration complete!`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  hashPasswords()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = hashPasswords;
