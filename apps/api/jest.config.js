/**
 * Jest is run with --experimental-vm-modules (see package.json) so that native
 * ES modules load without a transpiler - the project has no build step and no
 * TypeScript, and adding Babel purely for tests would contradict that.
 */
export default {
  testEnvironment: 'node',
  // Native ESM: no transform at all.
  transform: {},
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  moduleNameMapper: {
    '^@dhofar/shared$': '<rootDir>/../../packages/shared/src/index.js',
    '^@dhofar/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/docs/**',
  ],
  coverageThreshold: {
    global: { statements: 45, branches: 35, functions: 45, lines: 45 },
  },
  testTimeout: 30000,
  clearMocks: true,
  verbose: false,
  // The API holds module-level Prisma and Redis singletons that the suites
  // deliberately do not own, so the event loop stays alive after the last
  // assertion. Every suite closes its OWN clients in afterAll; this is the
  // backstop that stops the runner hanging on the app's.
  forceExit: true,
};
