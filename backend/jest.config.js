// Load .env and redirect tests to a separate test database
// This MUST happen before any test file loads connection.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
process.env.__PROD_DB_NAME = process.env.DB_NAME || 'rental_db';
process.env.DB_NAME = process.env.__PROD_DB_NAME + '_test';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/database/migrations/**',
    '!src/database/seed.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000,
  // Force exit after tests complete (pool stays open since individual files don't close it)
  forceExit: true,
  // Ignore node_modules
  testPathIgnorePatterns: ['/node_modules/'],
  // Global setup: creates test database with schema copied from production
  globalSetup: './jest.globalSetup.js',
  // Safety guard: blocks unscoped DELETE/TRUNCATE to protect data
  setupFiles: ['./jest.testSafetyGuard.js'],
  // Global teardown: minimal cleanup after all tests
  globalTeardown: './jest.globalTeardown.js'
};
