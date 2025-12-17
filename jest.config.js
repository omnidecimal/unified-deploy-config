module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lib/**/*.js',
    'cli.js',
    '!dist/**',
    '!node_modules/**'
  ],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ]
};
