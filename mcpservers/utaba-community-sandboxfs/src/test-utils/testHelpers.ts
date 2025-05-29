import { SandboxConfig } from '../config.js';

/**
 * Default test configuration
 */
export const TEST_CONFIG: SandboxConfig = {
  sandboxRoot: '/tmp/test-sandbox',
  quotaBytes: 10 * 1024 * 1024, // 10MB for tests
  maxFileSizeBytes: 5 * 1024 * 1024, // 5MB for tests
  allowDelete: true,
  allowDirectoryOps: true,
  allowBinary: true,
  blockedExtensions: [],
  allowedExtensions: []
};

/**
 * Create a test config with overrides
 */
export function createTestConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    ...TEST_CONFIG,
    ...overrides
  };
}

/**
 * Restricted config for security testing
 */
export const RESTRICTED_CONFIG: SandboxConfig = {
  ...TEST_CONFIG,
  allowDelete: false,
  allowDirectoryOps: false,
  allowBinary: false,
  blockedExtensions: ['.exe', '.dll', '.sh'],
  allowedExtensions: ['.txt', '.json', '.md']
};

/**
 * Minimal quota config for quota testing
 */
export const MINIMAL_QUOTA_CONFIG: SandboxConfig = {
  ...TEST_CONFIG,
  quotaBytes: 1024, // 1KB
  maxFileSizeBytes: 512 // 512 bytes
};

/**
 * Mock environment variables for testing
 */
export function mockEnvVars(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/**
 * Wait for a condition to be true (useful for async operations)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Create a promise that resolves after a delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
