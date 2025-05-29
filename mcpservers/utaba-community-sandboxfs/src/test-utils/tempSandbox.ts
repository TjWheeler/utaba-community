import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { afterEach } from 'vitest';

/**
 * Creates a temporary sandbox directory for testing
 */
export class TempSandbox {
  public readonly path: string;
  private _cleanup: (() => Promise<void>)[] = [];

  constructor(prefix: string = 'test-sandbox') {
    this.path = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  }

  /**
   * Create a file in the sandbox
   */
  async createFile(relativePath: string, content: string | Buffer): Promise<string> {
    const fullPath = path.join(this.path, relativePath);
    const dir = path.dirname(fullPath);
    
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullPath, content);
    
    return fullPath;
  }

  /**
   * Create a directory in the sandbox
   */
  async createDirectory(relativePath: string): Promise<string> {
    const fullPath = path.join(this.path, relativePath);
    await fs.promises.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  /**
   * Check if a file exists in the sandbox
   */
  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.promises.access(path.join(this.path, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(relativePath: string): Promise<string> {
    return fs.promises.readFile(path.join(this.path, relativePath), 'utf8');
  }

  /**
   * Get file stats
   */
  async stat(relativePath: string): Promise<fs.Stats> {
    return fs.promises.stat(path.join(this.path, relativePath));
  }

  /**
   * Clean up the sandbox directory
   */
  async cleanup(): Promise<void> {
    // Run any registered cleanup functions
    for (const cleanup of this._cleanup) {
      await cleanup();
    }
    
    try {
      await fs.promises.rm(this.path, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test sandbox ${this.path}:`, error);
    }
  }

  /**
   * Register a cleanup function to run when cleanup() is called
   */
  onCleanup(fn: () => Promise<void>): void {
    this._cleanup.push(fn);
  }
}

/**
 * Creates a temporary sandbox and automatically cleans it up after the test
 */
export function useTempSandbox(prefix?: string): TempSandbox {
  const sandbox = new TempSandbox(prefix);
  
  afterEach(async () => {
    await sandbox.cleanup();
  });
  
  return sandbox;
}

/**
 * Helper to create test files with specific sizes
 */
export function createTestContent(sizeInBytes: number, pattern: string = 'A'): string {
  const patternLength = pattern.length;
  const repeatCount = Math.ceil(sizeInBytes / patternLength);
  return pattern.repeat(repeatCount).substring(0, sizeInBytes);
}

/**
 * Helper to create binary test data
 */
export function createBinaryTestData(sizeInBytes: number): Buffer {
  const buffer = Buffer.alloc(sizeInBytes);
  for (let i = 0; i < sizeInBytes; i++) {
    buffer[i] = i % 256;
  }
  return buffer;
}
