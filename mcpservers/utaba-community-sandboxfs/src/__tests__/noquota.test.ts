import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateConfig } from '../config.js';
import { QuotaManager } from '../quota.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('No-Quota Mode', () => {
  let tempDir: string;
  let quotaFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcp-noquota-test-'));
    quotaFilePath = path.join(tempDir, '.mcp-quota.json');
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.promises.rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should load no-quota config when MCP_SANDBOX_NOQUOTA=true', () => {
    // Set environment variable
    process.env.MCP_SANDBOX_NOQUOTA = 'true';
    
    try {
      const config = loadConfig();
      expect(config.noQuota).toBe(true);
    } finally {
      // Clean up environment
      delete process.env.MCP_SANDBOX_NOQUOTA;
    }
  });

  it('should default to quota enabled when MCP_SANDBOX_NOQUOTA is not set', () => {
    // Ensure environment variable is not set
    delete process.env.MCP_SANDBOX_NOQUOTA;
    
    const config = loadConfig();
    expect(config.noQuota).toBe(false);
  });

  it('should skip quota validation when no-quota mode is enabled', async () => {
    const config = {
      ...loadConfig(),
      sandboxRoot: tempDir,
      noQuota: true,
      quotaBytes: -1, // Invalid quota that would normally fail validation
      maxFileSizeBytes: -1 // Invalid max file size that would normally fail validation
    };

    // Should not throw an error despite invalid quota values
    await expect(validateConfig(config)).resolves.toBeUndefined();
  });

  it('should delete existing quota file on initialization in no-quota mode', async () => {
    // Create a mock quota file
    const quotaData = [{ path: 'test.txt', size: 100, timestamp: Date.now() }];
    await fs.promises.writeFile(quotaFilePath, JSON.stringify(quotaData));
    
    // Verify file exists
    expect(await fs.promises.access(quotaFilePath).then(() => true).catch(() => false)).toBe(true);

    const config = {
      ...loadConfig(),
      sandboxRoot: tempDir,
      noQuota: true
    };

    const quotaManager = new QuotaManager(config);
    await quotaManager.initialize();

    // Verify file was deleted
    expect(await fs.promises.access(quotaFilePath).then(() => true).catch(() => false)).toBe(false);
  });

  it('should return no-quota mode status when quota is disabled', async () => {
    const config = {
      ...loadConfig(),
      sandboxRoot: tempDir,
      noQuota: true
    };

    const quotaManager = new QuotaManager(config);
    await quotaManager.initialize();

    const quotaInfo = quotaManager.getQuotaInfo();

    expect(quotaInfo.quotaDisabled).toBe(true);
    expect(quotaInfo.message).toBe('Quota system is disabled. File system access is unrestricted.');
    expect(quotaInfo.usedBytes).toBe(0);
    expect(quotaInfo.availableBytes).toBe(Number.MAX_SAFE_INTEGER);
    expect(quotaInfo.totalQuotaBytes).toBe(0);
    expect(quotaInfo.percentUsed).toBe(0);
  });

  it('should bypass quota checks in no-quota mode', async () => {
    const config = {
      ...loadConfig(),
      sandboxRoot: tempDir,
      noQuota: true,
      quotaBytes: 100, // Very small quota
      maxFileSizeBytes: 50 // Very small max file size
    };

    const quotaManager = new QuotaManager(config);
    await quotaManager.initialize();

    // These operations should not throw despite exceeding the configured limits
    expect(() => quotaManager.checkQuota(1000000)).not.toThrow(); // 1MB > 100 bytes quota
    expect(() => quotaManager.checkQuota(100000)).not.toThrow(); // 100KB > 50 bytes max file size
  });

  it('should bypass quota updates in no-quota mode', async () => {
    const config = {
      ...loadConfig(),
      sandboxRoot: tempDir,
      noQuota: true
    };

    const quotaManager = new QuotaManager(config);
    await quotaManager.initialize();

    // Create a test file
    const testFile = path.join(tempDir, 'test.txt');
    await fs.promises.writeFile(testFile, 'test content');

    // Update quota should complete without error and without creating quota file
    await quotaManager.updateQuota(testFile, 12);
    await quotaManager.flushPendingUpdates();

    // Quota file should not be created
    expect(await fs.promises.access(quotaFilePath).then(() => true).catch(() => false)).toBe(false);
  });

  it('should return correct isNoQuotaMode status', async () => {
    const enabledConfig = {
      ...loadConfig(),
      sandboxRoot: tempDir,
      noQuota: true
    };

    const disabledConfig = {
      ...loadConfig(),
      sandboxRoot: tempDir,
      noQuota: false
    };

    const enabledQuotaManager = new QuotaManager(enabledConfig);
    const disabledQuotaManager = new QuotaManager(disabledConfig);

    expect(enabledQuotaManager.isNoQuotaMode()).toBe(true);
    expect(disabledQuotaManager.isNoQuotaMode()).toBe(false);
  });
});
