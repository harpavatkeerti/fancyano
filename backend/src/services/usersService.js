/**
 * usersService.js
 *
 * All database interactions for the /users resource.
 * Routes (users.js) call these functions — no pool.query in routes.
 */

const pool = require('../database/connection');
const { hashPassword } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Expected national digit lengths per country, keyed by ISO-2 code.
 * Mirrors the frontend's getExpectedLength() in lib/countryCodes.ts.
 * Countries not listed fall back to the ITU range of 7–15 digits.
 */
const PHONE_LENGTH_MAP = {
  IN: { min: 10, max: 10 }, // India
  US: { min: 10, max: 10 }, // United States
  CA: { min: 10, max: 10 }, // Canada
  GB: { min: 10, max: 10 }, // United Kingdom
  AU: { min: 9, max: 9 }, // Australia
  AE: { min: 9, max: 9 }, // UAE
  SG: { min: 8, max: 8 }, // Singapore
  CN: { min: 11, max: 11 }, // China
  JP: { min: 10, max: 10 }, // Japan
};
const PHONE_LENGTH_FALLBACK = { min: 7, max: 15 }; // ITU E.164 range

/**
 * Validate phone digit count against the country's expected length.
 * @param {string} phone   - national digits (may contain spaces/dashes — stripped internally)
 * @param {string} country - ISO-2 country code, e.g. 'IN'
 * @returns {string|null}  error message, or null if valid
 */
function validatePhoneLength(phone, country) {
  if (!phone) return null; // presence is checked separately
  const digits = phone.replace(/\D/g, '');
  const { min, max } = PHONE_LENGTH_MAP[country] || PHONE_LENGTH_FALLBACK;
  if (digits.length < min || digits.length > max) {
    const range = min === max ? `${min}` : `${min}–${max}`;
    return `Phone number for ${country} must be ${range} digits (got ${digits.length}).`;
  }
  return null;
}

/**
 * Returns the E.164 calling code prefix for a given ISO-2 country code.
 * Mirrors the callingCode values in the frontend's lib/countryCodes.ts.
 */
const CALLING_CODE_MAP = {
  IN: '+91', US: '+1', CA: '+1', GB: '+44', AU: '+61',
  AE: '+971', SG: '+65', CN: '+86', JP: '+81', KR: '+82',
  PK: '+92', BD: '+880', LK: '+94', NP: '+977', TH: '+66',
  VN: '+84', ID: '+62', PH: '+63', NZ: '+64', SA: '+966',
  QA: '+974', KW: '+965', OM: '+968', BH: '+973', DE: '+49',
  FR: '+33', IT: '+39', ES: '+34', BR: '+55', MX: '+52',
  ZA: '+27',
};

function getCallingCode(countryIso2) {
  return CALLING_CODE_MAP[countryIso2] || `+${countryIso2}`;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * List all non-deleted users, with optional role/search filters.
 * Returns users without the password field.
 * @param {{ role?: string, search?: string }} filters
 */
async function listUsers({ role, search } = {}) {
  let query = 'SELECT * FROM users WHERE is_deleted = FALSE';
  const params = [];
  let paramCount = 0;

  if (role) {
    paramCount++;
    query += ` AND role = $${paramCount}`;
    params.push(role);
  }

  if (search) {
    paramCount++;
    query += ` AND (name ILIKE $${paramCount} OR phone ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  query += ' ORDER BY created_at DESC';

  const result = await pool.query(query, params);
  return result.rows.map(({ password, ...rest }) => rest);
}

/**
 * Search users by partial phone match (for booking form autocomplete).
 * Returns up to 10 matching non-deleted users (no password field).
 * @param {string} phone - partial phone digits, minimum 3 chars
 * @throws {Error} with .status = 400 if phone is too short
 */
async function searchUsers(phone) {
  if (!phone || phone.trim().length < 3) {
    const err = new Error('Provide at least 3 digits to search.');
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `SELECT id, name, phone, phone_country, alternate_phone, alternate_phone_country, address, email, is_deleted
     FROM users
     WHERE phone ILIKE $1
     ORDER BY is_deleted ASC, name
     LIMIT 10`,
    [`%${phone.trim()}%`]
  );

  return result.rows;
}

/**
 * Fetch a single non-deleted user by ID (no password field).
 * @param {number|string} id
 * @throws {Error} with .status = 404 if not found
 */
async function getUserById(id) {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const { password, ...userWithoutPassword } = result.rows[0];
  return userWithoutPassword;
}

/**
 * Create a new user (customer or staff).
 * Auto-sets username and bcrypt-hashed password for customers.
 * @param {{
 *   name: string,
 *   phone: string,
 *   phone_country?: string,
 *   alternate_phone: string,
 *   alternate_phone_country?: string,
 *   role?: string,
 *   email?: string,
 *   address?: string
 * }} data
 * @returns {object} created user (no password field)
 * @throws {Error} with .status = 400 for validation errors
 * @throws {Error} with .status = 409 for duplicate phone/username
 */
async function createUser({
  name,
  phone,
  phone_country = 'IN',
  alternate_phone,
  alternate_phone_country = 'IN',
  role = 'customer',
  email,
  address,
}) {
  if (!name || !phone || !alternate_phone) {
    const err = new Error('Name, phone, and alternate phone are required.');
    err.status = 400;
    throw err;
  }

  const validRoles = ['admin', 'salesman', 'customer'];
  if (!validRoles.includes(role)) {
    const err = new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}.`);
    err.status = 400;
    throw err;
  }

  // Phone length validation
  const phoneErr = validatePhoneLength(phone, phone_country);
  if (phoneErr) {
    const err = new Error(phoneErr);
    err.status = 400;
    throw err;
  }

  const altErr = validatePhoneLength(alternate_phone, alternate_phone_country);
  if (altErr) {
    const err = new Error(`Alternate phone: ${altErr}`);
    err.status = 400;
    throw err;
  }

  // Auto-set auth fields
  const callingCode = getCallingCode(phone_country);
  const username = `${callingCode}${phone}`;
  const hashedPassword = await hashPassword('customer');

  try {
    const result = await pool.query(
      `INSERT INTO users
         (name, phone, phone_country, alternate_phone, alternate_phone_country,
          email, address, role, username, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        name,
        phone,
        phone_country,
        alternate_phone,
        alternate_phone_country,
        email || null,
        address || null,
        role,
        username,
        hashedPassword,
      ]
    );

    const { password: _pw, ...created } = result.rows[0];
    return created;
  } catch (error) {
    if (error.code === '23505') {
      if (error.constraint === 'users_phone_unique') {
        const err = new Error('This phone number is already registered.');
        err.status = 409;
        throw err;
      }
      if (error.constraint === 'users_username_key') {
        const err = new Error('Username already exists.');
        err.status = 409;
        throw err;
      }
      const err = new Error('Duplicate entry.');
      err.status = 409;
      throw err;
    }
    throw error;
  }
}

/**
 * Update mutable fields on an existing non-deleted user.
 * Phone and phone_country are NOT editable.
 * @param {number|string} id
 * @param {{
 *   name?: string,
 *   alternate_phone?: string,
 *   alternate_phone_country?: string,
 *   email?: string,
 *   address?: string,
 *   role?: string,
 *   username?: string,
 *   password?: string
 * }} data
 * @returns {object} updated user (no password field)
 * @throws {Error} with .status = 400/404/409
 */
async function updateUser(id, {
  name,
  alternate_phone,
  alternate_phone_country,
  email,
  address,
  role,
  username,
  password,
  is_deleted,
} = {}) {
  // Alternate phone length validation (if being updated)
  if (alternate_phone !== undefined && alternate_phone !== null && alternate_phone !== '') {
    const resolvedCountry = alternate_phone_country || 'IN';
    const altErr = validatePhoneLength(alternate_phone, resolvedCountry);
    if (altErr) {
      const err = new Error(`Alternate phone: ${altErr}`);
      err.status = 400;
      throw err;
    }
  }

  const updates = [];
  const values = [];
  let paramCount = 0;

  if (name !== undefined) { paramCount++; updates.push(`name = $${paramCount}`); values.push(name); }
  if (alternate_phone !== undefined) { paramCount++; updates.push(`alternate_phone = $${paramCount}`); values.push(alternate_phone || null); }
  if (alternate_phone_country !== undefined) { paramCount++; updates.push(`alternate_phone_country = $${paramCount}`); values.push(alternate_phone_country); }
  if (email !== undefined) { paramCount++; updates.push(`email = $${paramCount}`); values.push(email); }
  if (address !== undefined) { paramCount++; updates.push(`address = $${paramCount}`); values.push(address); }
  if (role !== undefined) { paramCount++; updates.push(`role = $${paramCount}`); values.push(role); }
  if (username !== undefined) { paramCount++; updates.push(`username = $${paramCount}`); values.push(username); }
  // is_deleted: only false (reactivation) is accepted — setting to true is done via deleteUser
  if (is_deleted === false) { paramCount++; updates.push(`is_deleted = $${paramCount}`); values.push(false); }
  if (password !== undefined && password !== null && password.trim() !== '') {
    const hashedPassword = await hashPassword(password);
    paramCount++;
    updates.push(`password = $${paramCount}`);
    values.push(hashedPassword);
  }

  if (updates.length === 0) {
    const err = new Error('No updatable fields provided.');
    err.status = 400;
    throw err;
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  paramCount++;
  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const { password: _pw, ...updated } = result.rows[0];
    return updated;
  } catch (error) {
    if (error.code === '23505') {
      if (error.constraint === 'users_username_key') {
        const err = new Error('Username already exists.');
        err.status = 409;
        throw err;
      }
      const err = new Error('Duplicate entry.');
      err.status = 409;
      throw err;
    }
    throw error;
  }
}

/**
 * Soft-delete a user by ID.
 * Blocked if the user has any non-cancelled/non-completed bookings.
 * @param {number|string} id
 * @throws {Error} with .status = 400 if active bookings exist
 * @throws {Error} with .status = 404 if not found
 */
async function deleteUser(id) {
  // Guard: no active bookings
  const activeCheck = await pool.query(
    `SELECT id FROM bookings
     WHERE user_id = $1 AND status NOT IN ('cancelled', 'completed')
     LIMIT 1`,
    [id]
  );

  if (activeCheck.rows.length > 0) {
    const err = new Error(
      'Cannot deactivate customer with active bookings. Please cancel or complete all bookings first.'
    );
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    'UPDATE users SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
}

module.exports = {
  listUsers,
  searchUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
