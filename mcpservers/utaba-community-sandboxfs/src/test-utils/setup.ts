import { beforeEach, afterEach, vi } from 'vitest';

// Global test setup
beforeEach(() => {
  // Reset environment variables for clean test state
  delete process.env.LOG_LEVEL;
  delete process.env.LOG_FILE;
  delete process.env.MCP_SANDBOX_ROOT;
  delete process.env.MCP_SANDBOX_QUOTA;
});

afterEach(() => {
  // Clean up any test artifacts if needed
});

// Configure vitest for better test experience
vi.setConfig({
  testTimeout: 15000,
  hookTimeout: 10000
});
