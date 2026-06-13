/**
 * JWT Authentication Middleware
 * 
 * Verifies the JWT token from the Authorization header.
 * On success, attaches `req.user` with { userId, role, name }.
 * On failure, returns 401 Unauthorized.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production';
const JWT_EXPIRY_HOURS = parseInt(process.env.JWT_EXPIRY_HOURS || '24', 10);

/**
 * Middleware: verifyToken
 * Extracts and verifies JWT from Authorization: Bearer <token> header.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  // Expect format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Authentication required. Invalid token format.' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach user info to request for downstream use
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      name: decoded.name
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Generate a JWT token for a user.
 * @param {Object} user - User object with id, role, name
 * @returns {{ token: string, expiresAt: number }} - JWT token and expiry timestamp (ms)
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    name: user.name
  };

  const expiresIn = JWT_EXPIRY_HOURS * 60 * 60; // seconds
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn });
  const expiresAt = Date.now() + (expiresIn * 1000); // milliseconds

  return { token, expiresAt };
}

/**
 * Hash a plain-text password using bcrypt.
 * Use this everywhere instead of calling bcrypt.hash() directly.
 * @param {string} password - Plain-text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

module.exports = { verifyToken, generateToken, hashPassword, JWT_SECRET };
