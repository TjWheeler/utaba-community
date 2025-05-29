import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QuotaManager, QuotaError } from '../../quota.js';
import { createTestConfig, MINIMAL_QUOTA_CONFIG } from '../../test-utils/testHelpers.js';
import { useTempSandbox, createTestContent } from '../../test-utils/tempSandbox.js';
import { createMockLogger } from '../../test-utils/mockLogger.js';
import * as fs from 'fs';
import * as path from 'path';

describe('QuotaManager', () => {
  let sandbox = useTempSandbox('quota-test');
  let mockLogger = createMockLogger();
  let quotaManager: QuotaManager;


  beforeEach(async () => {
    mockLogger.clear();
    
    const config = createTestConfig({
      sandboxRoot: sandbox.path,
      quotaBytes: 5 * 1024, // 5KB for testing
      maxFileSizeBytes: 2 * 1024 // 2KB max file size
    });

    quotaManager = new QuotaManager(config);
    await quotaManager.initialize();
  });

  describe('Initialization', () => {
    it('should initialize with empty sandbox', async () => {
      const info = quotaManager.getQuotaInfo();
      
      expect(info.usedBytes).toBe(0);
      expect(info.availableBytes).toBe(5 * 1024);
      expect(info.totalQuotaBytes).toBe(5 * 1024);
      expect(info.percentUsed).toBe(0);
    });

    it('should create quota file on initialization', async () => {
      expect(await sandbox.exists('.mcp-quota.json')).toBe(true);
      
      const quotaData = JSON.parse(await sandbox.readFile('.mcp-quota.json'));
      expect(Array.isArray(quotaData)).toBe(true);
      expect(quotaData).toHaveLength(0);
    });

    it('should load existing quota data', async () => {
      // Create some test files first
      await sandbox.createFile('file1.txt', createTestContent(1000));
      await sandbox.createFile('file2.txt', createTestContent(500));
      
      // Rebuild quota data to include files
      await quotaManager.rebuildQuotaData();
      
      // Create a new quota manager that should load existing data
      const newQuotaManager = new QuotaManager(createTestConfig({
        sandboxRoot: sandbox.path,
        quotaBytes: 5 * 1024,
        maxFileSizeBytes: 2 * 1024
      }));
      
      await newQuotaManager.initialize();
      
      const info = newQuotaManager.getQuotaInfo();
      expect(info.usedBytes).toBeGreaterThan(1400); // Should include files
    });

    it('should rebuild quota data when file is corrupted', async () => {
      // Create some files
      await sandbox.createFile('test1.txt', createTestContent(500));
      await sandbox.createFile('test2.txt', createTestContent(300));
      
      // Corrupt the quota file
      await sandbox.createFile('.mcp-quota.json', 'invalid json content');
      
      // Should rebuild on initialization
      const newQuotaManager = new QuotaManager(createTestConfig({
        sandboxRoot: sandbox.path,
        quotaBytes: 5 * 1024,
        maxFileSizeBytes: 2 * 1024
      }));
      
      await newQuotaManager.initialize();
      
      const info = newQuotaManager.getQuotaInfo();
      expect(info.usedBytes).toBeGreaterThan(700); // Should have rebuilt data
    });
  });

  describe('Quota Checking', () => {
    it('should allow operations within quota', () => {
      const content = createTestContent(1000); // 1KB
      
      expect(() => quotaManager.checkQuota(content.length)).not.toThrow();
    });

    it('should reject operations that would exceed quota', async () => {
      // Fill most of the quota first
      await sandbox.createFile('large.txt', createTestContent(4500)); // 4.5KB out of 5KB quota
      await quotaManager.rebuildQuotaData();
      
      // Try to add another 1KB file (should exceed quota)
      const additionalContent = createTestContent(1000);
      
      expect(() => quotaManager.checkQuota(additionalContent.length))
        .toThrow(QuotaError);
      expect(() => quotaManager.checkQuota(additionalContent.length))
        .toThrow(/would exceed quota/);
    });

    it('should reject files exceeding max file size', () => {
      const oversizedContent = createTestContent(3000); // 3KB - exceeds 2KB limit
      
      expect(() => quotaManager.checkQuota(oversizedContent.length))
        .toThrow(QuotaError);
      expect(() => quotaManager.checkQuota(oversizedContent.length))
        .toThrow(/exceeds maximum allowed/);
    });

    it('should handle file replacements correctly', async () => {
      // Create initial file
      const initialContent = createTestContent(1000); // 1KB
      await sandbox.createFile('replace.txt', initialContent);
      await quotaManager.updateQuota(path.join(sandbox.path, 'replace.txt'), initialContent.length);
      
      // Replace with larger content (should check difference, not total)
      const newContent = createTestContent(1500); // 1.5KB
      const filePath = path.join(sandbox.path, 'replace.txt');
      
      expect(() => quotaManager.checkQuota(newContent.length, filePath)).not.toThrow();
    });

    it('should handle zero-size operations', () => {
      expect(() => quotaManager.checkQuota(0)).not.toThrow();
    });

    it('should handle edge case at exact quota limit', async () => {
      const info = quotaManager.getQuotaInfo();
      const exactQuotaContent = createTestContent(info.availableBytes);
      
      expect(() => quotaManager.checkQuota(exactQuotaContent.length)).not.toThrow();
    });
  });

  describe('Quota Updates', () => {
    it('should update quota after file creation', async () => {
      const initialInfo = quotaManager.getQuotaInfo();
      expect(initialInfo.usedBytes).toBe(0);
      
      const content = createTestContent(1500);
      const filePath = path.join(sandbox.path, 'new.txt');
      await sandbox.createFile('new.txt', content);
      await quotaManager.updateQuota(filePath, content.length);
      
      const updatedInfo = quotaManager.getQuotaInfo();
      expect(updatedInfo.usedBytes).toBe(content.length);
      expect(updatedInfo.availableBytes).toBe(initialInfo.totalQuotaBytes - content.length);
    });

    it('should update quota after file modification', async () => {
      // Create initial file
      const initialContent = createTestContent(1000);
      const filePath = path.join(sandbox.path, 'modify.txt');
      await sandbox.createFile('modify.txt', initialContent);
      await quotaManager.updateQuota(filePath, initialContent.length);
      
      const afterCreation = quotaManager.getQuotaInfo();
      expect(afterCreation.usedBytes).toBe(1000);
      
      // Modify file
      const newContent = createTestContent(1500);
      await quotaManager.updateQuota(filePath, newContent.length);
      
      const afterModification = quotaManager.getQuotaInfo();
      expect(afterModification.usedBytes).toBe(1500);
    });

    it('should update quota after file deletion', async () => {
      // Create file
      const content = createTestContent(1200);
      const filePath = path.join(sandbox.path, 'delete.txt');
      await sandbox.createFile('delete.txt', content);
      await quotaManager.updateQuota(filePath, content.length);
      
      const beforeDeletion = quotaManager.getQuotaInfo();
      expect(beforeDeletion.usedBytes).toBe(1200);
      
      // Delete file (size = 0)
      await quotaManager.updateQuota(filePath, 0);
      
      const afterDeletion = quotaManager.getQuotaInfo();
      expect(afterDeletion.usedBytes).toBe(0);
    });

    it('should persist quota data to disk', async () => {
      const content = createTestContent(800);
      const filePath = path.join(sandbox.path, 'persist.txt');
      await sandbox.createFile('persist.txt', content);
      await quotaManager.updateQuota(filePath, content.length);
      
      // Verify quota file was updated
      const quotaData = JSON.parse(await sandbox.readFile('.mcp-quota.json'));
      expect(quotaData).toHaveLength(1);
      expect(quotaData[0].path).toBe('persist.txt');
      expect(quotaData[0].size).toBe(800);
      expect(quotaData[0].timestamp).toBeDefined();
    });
  });

  describe('Current Usage Tracking', () => {
    it('should accurately track current usage', async () => {
      expect(quotaManager.getCurrentUsage()).toBe(0);
      
      // Add multiple files
      const file1Content = createTestContent(500);
      const file2Content = createTestContent(300);
      const file3Content = createTestContent(700);
      
      await quotaManager.updateQuota(path.join(sandbox.path, 'file1.txt'), file1Content.length);
      await quotaManager.updateQuota(path.join(sandbox.path, 'file2.txt'), file2Content.length);
      await quotaManager.updateQuota(path.join(sandbox.path, 'file3.txt'), file3Content.length);
      
      expect(quotaManager.getCurrentUsage()).toBe(1500);
    });

    it('should handle file replacements in usage tracking', async () => {
      const filePath = path.join(sandbox.path, 'track.txt');
      
      // Initial file
      await quotaManager.updateQuota(filePath, 1000);
      expect(quotaManager.getCurrentUsage()).toBe(1000);
      
      // Replace with different size
      await quotaManager.updateQuota(filePath, 1500);
      expect(quotaManager.getCurrentUsage()).toBe(1500);
      
      // Replace with smaller size
      await quotaManager.updateQuota(filePath, 800);
      expect(quotaManager.getCurrentUsage()).toBe(800);
    });
  });

  describe('Quota Information', () => {
    it('should provide accurate quota information', async () => {
      // Add some files
      await quotaManager.updateQuota(path.join(sandbox.path, 'info1.txt'), 1000);
      await quotaManager.updateQuota(path.join(sandbox.path, 'info2.txt'), 500);
      
      const info = quotaManager.getQuotaInfo();
      
      expect(info.usedBytes).toBe(1500);
      expect(info.totalQuotaBytes).toBe(5 * 1024);
      expect(info.availableBytes).toBe(5 * 1024 - 1500);
      expect(info.percentUsed).toBeCloseTo((1500 / (5 * 1024)) * 100, 1);
    });

    it('should handle full quota correctly', async () => {
      const fullQuotaSize = 5 * 1024;
      await quotaManager.updateQuota(path.join(sandbox.path, 'full.txt'), fullQuotaSize);
      
      const info = quotaManager.getQuotaInfo();
      
      expect(info.usedBytes).toBe(fullQuotaSize);
      expect(info.availableBytes).toBe(0);
      expect(info.percentUsed).toBe(100);
    });

    it('should handle empty quota correctly', () => {
      const info = quotaManager.getQuotaInfo();
      
      expect(info.usedBytes).toBe(0);
      expect(info.availableBytes).toBe(5 * 1024);
      expect(info.percentUsed).toBe(0);
    });
  });

  describe('Quota Cleanup', () => {
    it('should clean up entries for deleted files', async () => {
      // Create files and update quota
      await sandbox.createFile('cleanup1.txt', createTestContent(500));
      await sandbox.createFile('cleanup2.txt', createTestContent(300));
      await quotaManager.updateQuota(path.join(sandbox.path, 'cleanup1.txt'), 500);
      await quotaManager.updateQuota(path.join(sandbox.path, 'cleanup2.txt'), 300);
      
      expect(quotaManager.getCurrentUsage()).toBe(800);
      
      // Delete one file from filesystem (but not from quota)
      await fs.promises.unlink(path.join(sandbox.path, 'cleanup1.txt'));
      
      // Cleanup should remove the deleted file from quota tracking
      await quotaManager.cleanupQuota();
      
      expect(quotaManager.getCurrentUsage()).toBe(300);
    });

    it('should update quota file after cleanup', async () => {
      // Create files
      await sandbox.createFile('cleanup.txt', createTestContent(400));
      await quotaManager.updateQuota(path.join(sandbox.path, 'cleanup.txt'), 400);
      
      // Delete file from filesystem
      await fs.promises.unlink(path.join(sandbox.path, 'cleanup.txt'));
      
      // Cleanup and verify quota file is updated
      await quotaManager.cleanupQuota();
      
      const quotaData = JSON.parse(await sandbox.readFile('.mcp-quota.json'));
      expect(quotaData).toHaveLength(0);
    });

    it('should handle cleanup when no files need removal', async () => {
      await sandbox.createFile('keep.txt', createTestContent(200));
      await quotaManager.updateQuota(path.join(sandbox.path, 'keep.txt'), 200);
      
      const beforeCleanup = quotaManager.getCurrentUsage();
      
      await quotaManager.cleanupQuota();
      
      const afterCleanup = quotaManager.getCurrentUsage();
      expect(afterCleanup).toBe(beforeCleanup);
    });
  });

  describe('Quota Rebuilding', () => {
    it('should rebuild quota data from filesystem', async () => {
      // Create files directly in filesystem
      await sandbox.createFile('rebuild1.txt', createTestContent(600));
      await sandbox.createFile('rebuild2.txt', createTestContent(400));
      await sandbox.createDirectory('subdir');
      await sandbox.createFile('subdir/rebuild3.txt', createTestContent(300));
      
      // Rebuild quota data
      await quotaManager.rebuildQuotaData();
      
      const usage = quotaManager.getCurrentUsage();
      expect(usage).toBe(1300); // 600 + 400 + 300
      
      // Verify quota file was created with correct data
      const quotaData = JSON.parse(await sandbox.readFile('.mcp-quota.json'));
      expect(quotaData).toHaveLength(3);
      
      const paths = quotaData.map((entry: any) => entry.path).sort();
      expect(paths).toEqual(['rebuild1.txt', 'rebuild2.txt', 'subdir/rebuild3.txt']);
    });

    it('should exclude quota file from rebuilding', async () => {
      await sandbox.createFile('normal.txt', createTestContent(500));
      
      // Quota file should already exist
      expect(await sandbox.exists('.mcp-quota.json')).toBe(true);
      
      await quotaManager.rebuildQuotaData();
      
      // Should only track the normal file, not the quota file itself
      const quotaData = JSON.parse(await sandbox.readFile('.mcp-quota.json'));
      const paths = quotaData.map((entry: any) => entry.path);
      expect(paths).toEqual(['normal.txt']);
      expect(paths).not.toContain('.mcp-quota.json');
    });

    it('should handle nested directory structures', async () => {
      await sandbox.createDirectory('level1/level2/level3');
      await sandbox.createFile('level1/file1.txt', createTestContent(200));
      await sandbox.createFile('level1/level2/file2.txt', createTestContent(300));
      await sandbox.createFile('level1/level2/level3/file3.txt', createTestContent(400));
      
      await quotaManager.rebuildQuotaData();
      
      const usage = quotaManager.getCurrentUsage();
      expect(usage).toBe(900);
      
      const quotaData = JSON.parse(await sandbox.readFile('.mcp-quota.json'));
      expect(quotaData).toHaveLength(3);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle minimal quota configuration', async () => {
      const minimalManager = new QuotaManager(MINIMAL_QUOTA_CONFIG);
      await minimalManager.initialize();
      
      // Should reject almost any file due to tiny quota
      expect(() => minimalManager.checkQuota(100))
        .toThrow(QuotaError);
    });

    it('should handle zero quota edge case', async () => {
      const zeroQuotaConfig = createTestConfig({
        sandboxRoot: sandbox.path,
        quotaBytes: 0,
        maxFileSizeBytes: 0
      });
      
      const zeroQuotaManager = new QuotaManager(zeroQuotaConfig);
      await zeroQuotaManager.initialize();
      
      // Should reject any file operations
      expect(() => zeroQuotaManager.checkQuota(1))
        .toThrow(QuotaError);
      
      const info = zeroQuotaManager.getQuotaInfo();
      expect(info.totalQuotaBytes).toBe(0);
      expect(info.availableBytes).toBe(0);
    });

    it('should handle large file sizes correctly', async () => {
      const largeFileSize = 2 * 1024; // Exactly at the limit
      
      expect(() => quotaManager.checkQuota(largeFileSize)).not.toThrow();
      
      const tooLargeFileSize = 2 * 1024 + 1; // Just over the limit
      expect(() => quotaManager.checkQuota(tooLargeFileSize)).toThrow(QuotaError);
    });

    it('should handle concurrent quota operations', async () => {
      const promises: Promise<void>[] = [];
      
      // Simulate multiple concurrent quota updates
      for (let i = 0; i < 5; i++) {
        const filePath = path.join(sandbox.path, `concurrent-${i}.txt`);
        promises.push(quotaManager.updateQuota(filePath, 100));
      }
      
      await Promise.all(promises);
      
      expect(quotaManager.getCurrentUsage()).toBe(500);
    });

    it('should provide accurate percentage calculations', async () => {
      const halfQuotaSize = Math.floor((5 * 1024) / 2); // Half of quota
      await quotaManager.updateQuota(path.join(sandbox.path, 'half.txt'), halfQuotaSize);
      
      const info = quotaManager.getQuotaInfo();
      expect(info.percentUsed).toBeCloseTo(50, 1);
    });
  });
});
