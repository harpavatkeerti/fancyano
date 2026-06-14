/**
 * Brand configuration — single source of truth for logo and brand identity.
 * Backend mirror of frontend/lib/brand.ts.
 *
 * To swap the logo app-wide, update LOGO_PATH here.
 */

const path = require('path');

const LOGO_PATH = path.join(__dirname, '../../../frontend/public/assets/logo.png');
const BRAND_NAME = 'Fancyano';

module.exports = { LOGO_PATH, BRAND_NAME };
