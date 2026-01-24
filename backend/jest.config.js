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
  // Ignore node_modules
  testPathIgnorePatterns: ['/node_modules/'],
  // Setup and teardown
  globalSetup: undefined,
  globalTeardown: undefined
};
