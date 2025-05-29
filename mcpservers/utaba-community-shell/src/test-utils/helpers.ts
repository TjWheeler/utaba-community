import { vi, expect } from 'vitest';
import { Config, CommandConfig } from '../config';
import { Logger, LogLevel } from '../logger';

/**
 * Test utilities for mocking and setup
 */

// Global test setup
export function setupTests() {
  // Suppress console logs during tests unless debugging
  if (!process.env.DEBUG_TESTS) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }
}

// Mock configuration factory
export function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    projectRoots: [process.cwd()],
    trustedEnvironment: true,
    defaultTimeout: 30000,
    maxConcurrentCommands: 3,
    allowedCommands: [
      {
        command: 'echo',
        allowedArgs: ['test', 'hello'],
        description: 'Test echo command',
        timeout: 5000,
        workingDirRestriction: 'project-only',
        requiresConfirmation: false
      },
      {
        command: 'npm',
        allowedArgs: ['test', 'run'],
        description: 'NPM test command',
        timeout: 30000,
        workingDirRestriction: 'project-only',
        requiresConfirmation: false
      }
    ],
    logLevel: 'info',
    logToFile: false,
    blockedEnvironmentVars: ['HOME', 'PATH'],
    ...overrides
  };
}

// Mock logger for testing
export function createMockLogger(): Logger {
  const logger = Logger.getInstance();
  
  // Mock the Winston logger to prevent actual logging during tests
  vi.spyOn(logger as any, 'log').mockImplementation(() => {});
  
  return logger;
}

// Process spawning mock utilities
export function createMockChildProcess() {
  const mockProcess = {
    pid: 12345,
    stdout: {
      on: vi.fn()
    },
    stderr: {
      on: vi.fn()
    },
    on: vi.fn(),
    kill: vi.fn(),
    spawnargs: ['echo', 'test']
  };
  
  return mockProcess;
}

// Mock successful command execution
export function mockSuccessfulCommand(stdout = 'success', stderr = '', exitCode = 0) {
  return {
    exitCode,
    stdout,
    stderr,
    executionTime: 100,
    timedOut: false,
    killed: false,
    pid: 12345
  };
}

// Mock failed command execution
export function mockFailedCommand(exitCode = 1, stderr = 'error', stdout = '') {
  return {
    exitCode,
    stdout,
    stderr,
    executionTime: 150,
    timedOut: false,
    killed: false,
    pid: 12345
  };
}

// Mock timed out command
export function mockTimedOutCommand(stdout = 'partial', stderr = '') {
  return {
    exitCode: null,
    stdout,
    stderr,
    executionTime: 30000,
    timedOut: true,
    killed: true,
    pid: 12345
  };
}

// Test file utilities
export async function createTempTestFile(content: string): Promise<string> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-shell-test-'));
  const tempFile = path.join(tempDir, 'test-file.txt');
  await fs.writeFile(tempFile, content);
  
  return tempFile;
}

export async function cleanupTempFile(filePath: string): Promise<void> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  
  try {
    await fs.unlink(filePath);
    // Use fs.rm instead of fs.rmdir for Node.js 16+ compatibility
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Security test helpers
export const DANGEROUS_COMMAND_PATTERNS = [
  'echo $(whoami)',
  'echo `id`',
  'echo test; rm -rf /',
  'echo test | cat',
  'echo test > /etc/passwd',
  'echo test && sudo rm -rf /',
  'echo $USER',
  'echo test\x00malicious',
  'echo ../../../etc/passwd',
  'rm -rf test',
  'sudo echo test',
  'eval "echo test"'
];

export const SAFE_COMMAND_PATTERNS = [
  'echo test',
  'echo hello',
  'npm test',
  'npm run build'
];

// Timeout utilities for async tests
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Environment variable helpers for testing
export function withEnvironmentVariable(name: string, value: string, fn: () => Promise<void>): Promise<void> {
  const originalValue = process.env[name];
  
  return (async () => {
    process.env[name] = value;
    try {
      await fn();
    } finally {
      if (originalValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  })();
}

// Working directory helpers
export async function withTempDirectory<T>(fn: (tempDir: string) => Promise<T>): Promise<T> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-shell-test-'));
  
  try {
    return await fn(tempDir);
  } finally {
    try {
      // Use fs.rm instead of fs.rmdir for Node.js 16+ compatibility
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Performance testing utilities
export function measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  return (async () => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  })();
}

// Assert helpers for common test patterns
export function assertValidCommandResult(result: any) {
  expect(result).toHaveProperty('exitCode');
  expect(result).toHaveProperty('stdout');
  expect(result).toHaveProperty('stderr');
  expect(result).toHaveProperty('executionTime');
  expect(result).toHaveProperty('timedOut');
  expect(result).toHaveProperty('killed');
  expect(typeof result.executionTime).toBe('number');
  expect(result.executionTime).toBeGreaterThanOrEqual(0);
}

export function assertSecurityError(error: any, expectedReason?: string) {
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('SecurityError');
  if (expectedReason) {
    expect(error.reason).toContain(expectedReason);
  }
}

// Mock MCP request/response utilities
export function createMockMCPRequest(toolName: string, args: any) {
  return {
    params: {
      name: toolName,
      arguments: args
    }
  };
}

export function extractMCPResponseText(response: any): string {
  if (response?.content?.[0]?.text) {
    return response.content[0].text;
  }
  throw new Error('Invalid MCP response format');
}

export function parseMCPResponseJSON(response: any): any {
  const text = extractMCPResponseText(response);
  return JSON.parse(text);
}
