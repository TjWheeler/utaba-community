import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileOperations } from '../../fileOperations.js';
import { QuotaManager } from '../../quota.js';
import { SecurityError } from '../../security.js';
import { QuotaError } from '../../quota.js';
import { createTestConfig, RESTRICTED_CONFIG } from '../../test-utils/testHelpers.js';
import { useTempSandbox, createTestContent, createBinaryTestData } from '../../test-utils/tempSandbox.js';
import { createMockLogger } from '../../test-utils/mockLogger.js';
import * as fs from 'fs';
import * as path from 'path';

describe('FileOperations', () => {
  let sandbox = useTempSandbox('fileops-test');
  let mockLogger = createMockLogger();
  let fileOps: FileOperations;
  let quotaManager: QuotaManager;

  beforeEach(async () => {
    mockLogger.clear();
    
    const config = createTestConfig({
      sandboxRoot: sandbox.path,
      quotaBytes: 50 * 1024, // 50KB for testing
      maxFileSizeBytes: 10 * 1024 // 10KB max file size
    });
    
    quotaManager = new QuotaManager(config);
    await quotaManager.initialize();
    
    fileOps = new FileOperations(config, quotaManager);
  });

  afterEach(async () => {
    if (quotaManager) {
      await quotaManager.cleanupQuota();
    }
  });

  describe('File Reading', () => {
    beforeEach(async () => {
      await sandbox.createFile('test.txt', 'Hello, World!');
      await sandbox.createFile('data.json', '{"key": "value", "number": 42}');
      await sandbox.createFile('binary.dat', createBinaryTestData(100));
    });

    it('should read text files', async () => {
      const content = await fileOps.readFile('test.txt');
      expect(content).toBe('Hello, World!');
    });

    it('should read JSON files', async () => {
      const content = await fileOps.readFile('data.json');
      expect(content).toBe('{"key": "value", "number": 42}');
    });

    it('should read binary files as base64 when requested', async () => {
      const content = await fileOps.readFile('binary.dat', 'base64');
      expect(content).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
    });

    it('should use readFileWithMetadata for optimized reading', async () => {
      const result = await fileOps.readFileWithMetadata('test.txt');
      
      expect(result.content).toBe('Hello, World!');
      expect(result.size).toBe(13);
      expect(result.encoding).toBe('utf-8');
      expect(result.isBinary).toBe(false);
      expect(result.contentType).toContain('text');
    });

    it('should auto-detect binary files in readFileWithMetadata', async () => {
      const result = await fileOps.readFileWithMetadata('binary.dat');
      
      expect(result.isBinary).toBe(true);
      expect(result.encoding).toBe('base64');
      expect(result.contentType).toContain('application/octet-stream');
    });

    it('should respect encoding override in readFileWithMetadata', async () => {
      const result = await fileOps.readFileWithMetadata('test.txt', 'base64');
      
      expect(result.encoding).toBe('base64');
      expect(result.content).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should throw for non-existent files', async () => {
      await expect(fileOps.readFile('nonexistent.txt'))
        .rejects.toThrow(/ENOENT/);
    });

    it('should validate file paths', async () => {
      await expect(fileOps.readFile('../../../etc/passwd'))
        .rejects.toThrow(SecurityError);
    });

    it('should handle files in subdirectories', async () => {
      await sandbox.createDirectory('subdir');
      await sandbox.createFile('subdir/nested.txt', 'Nested content');
      
      const content = await fileOps.readFile('subdir/nested.txt');
      expect(content).toBe('Nested content');
    });
  });

  describe('File Writing', () => {
    it('should write text files', async () => {
      await fileOps.writeFile('new.txt', 'New content');
      
      expect(await sandbox.exists('new.txt')).toBe(true);
      expect(await sandbox.readFile('new.txt')).toBe('New content');
    });

    it('should write binary files from base64', async () => {
      const binaryData = createBinaryTestData(50);
      const base64Data = binaryData.toString('base64');
      
      await fileOps.writeFile('binary.dat', base64Data, 'base64');
      
      expect(await sandbox.exists('binary.dat')).toBe(true);
      
      const writtenData = await fs.promises.readFile(path.join(sandbox.path, 'binary.dat'));
      expect(writtenData.equals(binaryData)).toBe(true);
    });

    it('should overwrite existing files', async () => {
      await sandbox.createFile('existing.txt', 'Original content');
      
      await fileOps.writeFile('existing.txt', 'New content');
      
      expect(await sandbox.readFile('existing.txt')).toBe('New content');
    });

    it('should create parent directories when needed', async () => {
      await fileOps.writeFile('deep/nested/file.txt', 'Deep content');
      
      expect(await sandbox.exists('deep/nested/file.txt')).toBe(true);
      expect(await sandbox.readFile('deep/nested/file.txt')).toBe('Deep content');
    });

    it('should validate file paths', async () => {
      await expect(fileOps.writeFile('../../../tmp/evil.txt', 'content'))
        .rejects.toThrow(SecurityError);
    });

    it('should validate file names', async () => {
      await expect(fileOps.writeFile('con.txt', 'content'))
        .rejects.toThrow(SecurityError);
    });

    it('should enforce quota limits', async () => {
      const largeContent = createTestContent(60 * 1024); // 60KB - exceeds 50KB quota
      
      await expect(fileOps.writeFile('large.txt', largeContent))
        .rejects.toThrow(QuotaError);
    });

    it('should enforce file size limits', async () => {
      const oversizedContent = createTestContent(15 * 1024); // 15KB - exceeds 10KB file limit
      
      await expect(fileOps.writeFile('oversized.txt', oversizedContent))
        .rejects.toThrow(QuotaError);
    });

    it('should handle binary restrictions', async () => {
      const restrictedOps = new FileOperations(RESTRICTED_CONFIG, quotaManager);
      const binaryData = createBinaryTestData(100).toString('base64');
      
      await expect(restrictedOps.writeFile('binary.dat', binaryData, 'base64'))
        .rejects.toThrow(SecurityError);
    });
  });

  describe('File Appending', () => {
    beforeEach(async () => {
      await sandbox.createFile('append.txt', 'Initial content');
    });

    it('should append to existing files', async () => {
      await fileOps.appendFile('append.txt', '\nAppended content');
      
      const content = await sandbox.readFile('append.txt');
      expect(content).toBe('Initial content\nAppended content');
    });

    it('should append binary data', async () => {
      const binaryData = createBinaryTestData(20);
      const base64Data = binaryData.toString('base64');
      
      await fileOps.appendFile('append.txt', base64Data, 'base64');
      
      const fileContent = await fs.promises.readFile(path.join(sandbox.path, 'append.txt'));
      expect(fileContent.length).toBeGreaterThan(15); // Original + binary data
    });

    it('should create file if it does not exist', async () => {
      await fileOps.appendFile('new-append.txt', 'First content');
      
      expect(await sandbox.exists('new-append.txt')).toBe(true);
      expect(await sandbox.readFile('new-append.txt')).toBe('First content');
    });

    it('should validate paths and filenames', async () => {
      await expect(fileOps.appendFile('../evil.txt', 'content'))
        .rejects.toThrow(SecurityError);
    });

    it('should enforce quota when appending', async () => {
      const largeAppend = createTestContent(50 * 1024); // Would exceed quota
      
      await expect(fileOps.appendFile('append.txt', largeAppend))
        .rejects.toThrow(QuotaError);
    });
  });

  describe('File Deletion', () => {
    beforeEach(async () => {
      await sandbox.createFile('delete-me.txt', 'To be deleted');
      await sandbox.createFile('keep-me.txt', 'Keep this');
    });

    it('should delete existing files', async () => {
      await fileOps.deleteFile('delete-me.txt');
      
      expect(await sandbox.exists('delete-me.txt')).toBe(false);
      expect(await sandbox.exists('keep-me.txt')).toBe(true);
    });

    it('should throw for non-existent files', async () => {
      await expect(fileOps.deleteFile('nonexistent.txt'))
        .rejects.toThrow(/ENOENT/);
    });

    it('should validate file paths', async () => {
      await expect(fileOps.deleteFile('../../../etc/passwd'))
        .rejects.toThrow(SecurityError);
    });

    it('should respect delete restrictions', async () => {
      const restrictedOps = new FileOperations(RESTRICTED_CONFIG, quotaManager);
      
      await expect(restrictedOps.deleteFile('delete-me.txt'))
        .rejects.toThrow(SecurityError);
    });

    it('should update quota after deletion', async () => {
      const beforeQuota = await quotaManager.getQuotaInfo();
      
      await fileOps.deleteFile('delete-me.txt');
      await quotaManager.updateQuota('delete-me.txt',0);
      
      const afterQuota = await quotaManager.getQuotaInfo();
      expect(afterQuota.usedBytes).toBeLessThan(beforeQuota.usedBytes);
    });
  });

  describe('Directory Operations', () => {
    it('should create directories', async () => {
      await fileOps.createDirectory('new-dir');
      
      expect(await sandbox.exists('new-dir')).toBe(true);
      const stats = await sandbox.stat('new-dir');
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories', async () => {
      await fileOps.createDirectory('deep/nested/structure');
      
      expect(await sandbox.exists('deep/nested/structure')).toBe(true);
    });

    it('should handle existing directories gracefully', async () => {
      await sandbox.createDirectory('existing');
      
      await expect(fileOps.createDirectory('existing')).resolves.not.toThrow();
    });

    it('should delete empty directories', async () => {
      await sandbox.createDirectory('empty-dir');
      
      await fileOps.deleteDirectory('empty-dir');
      
      expect(await sandbox.exists('empty-dir')).toBe(false);
    });

    it('should not delete non-empty directories', async () => {
      await sandbox.createDirectory('non-empty');
      await sandbox.createFile('non-empty/file.txt', 'content');
      
      await expect(fileOps.deleteDirectory('non-empty'))
        .rejects.toThrow(/ENOTEMPTY/);
    });

    it('should validate directory paths', async () => {
      await expect(fileOps.createDirectory('../../../tmp/evil'))
        .rejects.toThrow(SecurityError);
    });

    it('should respect directory operation restrictions', async () => {
      const restrictedOps = new FileOperations(RESTRICTED_CONFIG, quotaManager);
      
      await expect(restrictedOps.createDirectory('new-dir'))
        .rejects.toThrow(SecurityError);
    });
  });

  describe('File Movement and Copying', () => {
    beforeEach(async () => {
      await sandbox.createFile('source.txt', 'Source content');
      await sandbox.createDirectory('target-dir');
    });

    it('should move files', async () => {
      await fileOps.moveFile('source.txt', 'moved.txt');
      
      expect(await sandbox.exists('source.txt')).toBe(false);
      expect(await sandbox.exists('moved.txt')).toBe(true);
      expect(await sandbox.readFile('moved.txt')).toBe('Source content');
    });

    it('should move files to directories', async () => {
      await fileOps.moveFile('source.txt', 'target-dir/moved.txt');
      
      expect(await sandbox.exists('source.txt')).toBe(false);
      expect(await sandbox.exists('target-dir/moved.txt')).toBe(true);
    });

    it('should copy files', async () => {
      await fileOps.copyFile('source.txt', 'copy.txt');
      
      expect(await sandbox.exists('source.txt')).toBe(true);
      expect(await sandbox.exists('copy.txt')).toBe(true);
      expect(await sandbox.readFile('copy.txt')).toBe('Source content');
    });

    it('should validate paths for move operations', async () => {
      await expect(fileOps.moveFile('source.txt', '../../../tmp/evil.txt'))
        .rejects.toThrow(SecurityError);
    });

    it('should validate paths for copy operations', async () => {
      await expect(fileOps.copyFile('../../../etc/passwd', 'copy.txt'))
        .rejects.toThrow(SecurityError);
    });

    it('should handle quota when copying', async () => {
      // Create a large file that when copied would exceed quota
      const largeContent = createTestContent(30 * 1024); // 30KB
      await sandbox.createFile('large.txt', largeContent);
      
      // Should work for the first copy
      await fileOps.copyFile('large.txt', 'copy1.txt');
      
      // But copying again might exceed quota
      await expect(fileOps.copyFile('large.txt', 'copy2.txt'))
        .rejects.toThrow(QuotaError);
    });
  });

  describe('File Information and Listing', () => {
    beforeEach(async () => {
      await sandbox.createFile('file1.txt', 'Content 1');
      await sandbox.createFile('file2.json', '{"key": "value"}');
      await sandbox.createDirectory('subdir');
      await sandbox.createFile('subdir/nested.txt', 'Nested');
    });

    it('should check if files exist', async () => {
      expect(await fileOps.exists('file1.txt')).toBe(true);
      expect(await fileOps.exists('nonexistent.txt')).toBe(false);
      expect(await fileOps.exists('subdir')).toBe(true);
    });

    it('should get file information', async () => {
      const info = await fileOps.getFileInfo('file1.txt');
      
      expect(info.name).toBe('file1.txt');
      expect(info.path).toBe('file1.txt');
      expect(info.size).toBe(9); // 'Content 1'
      expect(info.isDirectory).toBe(false);
      expect(info.createdAt).toBeDefined();
      expect(info.modifiedAt).toBeDefined();
    });

    it('should get directory information', async () => {
      const info = await fileOps.getFileInfo('subdir');
      
      expect(info.name).toBe('subdir');
      expect(info.path).toBe('subdir');
      expect(info.isDirectory).toBe(true);
    });

    it('should list directory contents', async () => {
      const listing = await fileOps.listDirectory('');
      
      expect(listing.path).toBe('');
      expect(listing.entries).toHaveLength(4); // file1.txt, file2.json, subdir, .mcp-quota.json
      
      const fileEntry = listing.entries.find(e => e.name === 'file1.txt');
      expect(fileEntry).toBeDefined();
      expect(fileEntry!.isDirectory).toBe(false);
      
      const dirEntry = listing.entries.find(e => e.name === 'subdir');
      expect(dirEntry).toBeDefined();
      expect(dirEntry!.isDirectory).toBe(true);
    });

    it('should list subdirectory contents', async () => {
      const listing = await fileOps.listDirectory('subdir');
      
      expect(listing.path).toBe('subdir');
      expect(listing.entries).toHaveLength(1);
      expect(listing.entries[0].name).toBe('nested.txt');
    });

    it('should handle empty directories', async () => {
      await sandbox.createDirectory('empty');
      
      const listing = await fileOps.listDirectory('empty');
      
      expect(listing.path).toBe('empty');
      expect(listing.entries).toHaveLength(0);
    });

    it('should validate paths for exists check', async () => {
      await expect(fileOps.exists('../../../etc/passwd'))
        .rejects.toThrow(SecurityError);
    });

    it('should validate paths for file info', async () => {
      await expect(fileOps.getFileInfo('../../../etc/passwd'))
        .rejects.toThrow(SecurityError);
    });

    it('should validate paths for directory listing', async () => {
      await expect(fileOps.listDirectory('../../../etc'))
        .rejects.toThrow(SecurityError);
    });
  });

  describe('Quota Integration', () => {
    it('should get quota status', async () => {
      const status = await fileOps.getQuotaStatus();
      
      expect(status.totalQuotaBytes).toBe(50 * 1024);
      expect(status.usedBytes).toBeGreaterThan(0); // quota file exists
      expect(status.availableBytes).toBeLessThan(50 * 1024);
      expect(status.percentUsed).toBeGreaterThan(0);
    });

    it('should update quota after file operations', async () => {
      const initialStatus = await fileOps.getQuotaStatus();
      
      await fileOps.writeFile('new-file.txt', createTestContent(1000));
      
      const updatedStatus = await fileOps.getQuotaStatus();
      expect(updatedStatus.usedBytes).toBeGreaterThan(initialStatus.usedBytes);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent operations safely', async () => {
      const promises:Promise<void>[] = [];
      
      // Create multiple files concurrently
      for (let i = 0; i < 5; i++) {
        promises.push(fileOps.writeFile(`concurrent-${i}.txt`, `Content ${i}`));
      }
      
      await expect(Promise.all(promises)).resolves.not.toThrow();
      
      // Verify all files were created
      for (let i = 0; i < 5; i++) {
        expect(await sandbox.exists(`concurrent-${i}.txt`)).toBe(true);
      }
    });

    it('should handle very small files', async () => {
      await fileOps.writeFile('tiny.txt', '');
      
      expect(await sandbox.exists('tiny.txt')).toBe(true);
      expect(await sandbox.readFile('tiny.txt')).toBe('');
    });

    it('should handle unicode content', async () => {
      const unicodeContent = '🚀 Unicode test: αβγ δεζ ηθι 中文 🎉';
      
      await fileOps.writeFile('unicode.txt', unicodeContent);
      
      const readContent = await fileOps.readFile('unicode.txt');
      expect(readContent).toBe(unicodeContent);
    });

    it('should handle files with special characters in names', async () => {
      const specialName = 'file-with-special_chars.123.txt';
      
      await fileOps.writeFile(specialName, 'Special file');
      
      expect(await sandbox.exists(specialName)).toBe(true);
      expect(await fileOps.readFile(specialName)).toBe('Special file');
    });

    it('should handle path normalization', async () => {
      await sandbox.createDirectory('subdir');
      
      await fileOps.writeFile('./subdir/../normalize.txt', 'Normalized');
      
      expect(await sandbox.exists('normalize.txt')).toBe(true);
    });

    it('should provide detailed error messages', async () => {
      try {
        await fileOps.readFile('nonexistent.txt');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('ENOENT');
      }
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle large file operations efficiently', async () => {
      const largeContent = createTestContent(8 * 1024); // 8KB - close to limit
      
      const start = Date.now();
      await fileOps.writeFile('large.txt', largeContent);
      const writeTime = Date.now() - start;
      
      const start2 = Date.now();
      const readContent = await fileOps.readFile('large.txt');
      const readTime = Date.now() - start2;
      
      expect(readContent).toBe(largeContent);
      expect(writeTime).toBeLessThan(1000); // Should be fast
      expect(readTime).toBeLessThan(1000);
    });

    it('should use optimized reading for text files', async () => {
      await sandbox.createFile('optimize.txt', 'Optimized content');
      
      const result = await fileOps.readFileWithMetadata('optimize.txt');
      
      // Should detect as text and use UTF-8
      expect(result.encoding).toBe('utf-8');
      expect(result.isBinary).toBe(false);
      expect(result.content).toBe('Optimized content');
    });
  });
});
