module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    '*.js',
    '!dist/**',
    '!node_modules/**'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js'
  ]
};
