import { beforeEach } from 'vitest';
import { setupTests } from './helpers.js';

// Global test setup
beforeEach(() => {
  setupTests();
});

// Re-export all test utilities
export * from './helpers.js';
