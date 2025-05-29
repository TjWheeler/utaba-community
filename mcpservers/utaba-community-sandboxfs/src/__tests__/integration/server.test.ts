import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateConfig } from '../../config.js';
import { QuotaManager } from '../../quota.js';
import { FileOperations } from '../../fileOperations.js';
import { useTempSandbox, createTestContent, createBinaryTestData } from '../../test-utils/tempSandbox.js';
import { createTestConfig, RESTRICTED_CONFIG } from '../../test-utils/testHelpers.js';
import { createMockLogger } from '../../test-utils/mockLogger.js';

describe('Integration Tests', () => {
  let sandbox = useTempSandbox('integration-test');
  let mockLogger = createMockLogger();
  let fileOps: FileOperations;
  let quotaManager: QuotaManager;

  beforeEach(async () => {
    mockLogger.clear();
    
    const config = createTestConfig({
      sandboxRoot: sandbox.path,
      quotaBytes: 100 * 1024, // 100KB
      maxFileSizeBytes: 50 * 1024 // 50KB
    });
    
    await validateConfig(config);
    
    quotaManager = new QuotaManager(config);
    await quotaManager.initialize();
    
    fileOps = new FileOperations(config, quotaManager);
  });

  afterEach(async () => {
    // QuotaManager cleanup is handled by the temp sandbox
  });

  describe('End-to-End File Operations', () => {
    it('should handle complete file lifecycle', async () => {
      // Create file
      await fileOps.writeFile('lifecycle.txt', 'Initial content');
      expect(await fileOps.exists('lifecycle.txt')).toBe(true);
      
      // Read file
      let content = await fileOps.readFile('lifecycle.txt');
      expect(content).toBe('Initial content');
      
      // Append to file
      await fileOps.appendFile('lifecycle.txt', '\nAppended content');
      content = await fileOps.readFile('lifecycle.txt');
      expect(content).toBe('Initial content\nAppended content');
      
      // Copy file
      await fileOps.copyFile('lifecycle.txt', 'lifecycle-copy.txt');
      expect(await fileOps.exists('lifecycle-copy.txt')).toBe(true);
      
      // Move file
      await fileOps.moveFile('lifecycle-copy.txt', 'lifecycle-moved.txt');
      expect(await fileOps.exists('lifecycle-copy.txt')).toBe(false);
      expect(await fileOps.exists('lifecycle-moved.txt')).toBe(true);
      
      // Get file info
      const info = await fileOps.getFileInfo('lifecycle.txt');
      expect(info.name).toBe('lifecycle.txt');
      expect(info.size).toBeGreaterThan(20);
      expect(info.isDirectory).toBe(false);
      
      // List directory
      const listing = await fileOps.listDirectory('');
      expect(listing.entries.length).toBeGreaterThanOrEqual(2); // Original, moved (quota file is hidden)
      
      // Delete files
      await fileOps.deleteFile('lifecycle.txt');
      await fileOps.deleteFile('lifecycle-moved.txt');
      
      expect(await fileOps.exists('lifecycle.txt')).toBe(false);
      expect(await fileOps.exists('lifecycle-moved.txt')).toBe(false);
    });

    it('should handle directory operations end-to-end', async () => {
      // Create nested directory structure
      await fileOps.createDirectory('project/src/components');
      
      // Create files in directories
      await fileOps.writeFile('project/README.md', '# Test Project');
      await fileOps.writeFile('project/src/main.js', 'console.log("Hello");');
      await fileOps.writeFile('project/src/components/Button.js', 'export const Button = () => {};');
      
      // Verify structure
      expect(await fileOps.exists('project')).toBe(true);
      expect(await fileOps.exists('project/src')).toBe(true);
      expect(await fileOps.exists('project/src/components')).toBe(true);
      
      // List directories
      const projectListing = await fileOps.listDirectory('project');
      expect(projectListing.entries.map(e => e.name)).toContain('README.md');
      expect(projectListing.entries.map(e => e.name)).toContain('src');
      
      const srcListing = await fileOps.listDirectory('project/src');
      expect(srcListing.entries.map(e => e.name)).toContain('main.js');
      expect(srcListing.entries.map(e => e.name)).toContain('components');
      
      // Clean up (must delete files first, then directories in reverse order)
      await fileOps.deleteFile('project/src/components/Button.js');
      await fileOps.deleteFile('project/src/main.js');
      await fileOps.deleteFile('project/README.md');
      
      await fileOps.deleteDirectory('project/src/components');
      await fileOps.deleteDirectory('project/src');
      await fileOps.deleteDirectory('project');
      
      expect(await fileOps.exists('project')).toBe(false);
    });

    it('should handle binary file operations', async () => {
      // Create binary data (simulate image file)
      const binaryData = createBinaryTestData(1000);
      const base64Data = binaryData.toString('base64');
      
      // Write binary file
      await fileOps.writeFile('image.dat', base64Data, 'base64');
      
      // Read as base64
      const readBase64 = await fileOps.readFile('image.dat', 'base64');
      expect(readBase64).toBe(base64Data);
      
      // Use optimized reading
      const metadata = await fileOps.readFileWithMetadata('image.dat');
      expect(metadata.isBinary).toBe(true);
      expect(metadata.encoding).toBe('base64');
      expect(metadata.size).toBe(1000);
      
      // Copy binary file
      await fileOps.copyFile('image.dat', 'image-copy.dat');
      const copyContent = await fileOps.readFile('image-copy.dat', 'base64');
      expect(copyContent).toBe(base64Data);
    });
  });

  describe('Quota Management Integration', () => {
    it('should enforce quota across multiple operations', async () => {
      const quota = await fileOps.getQuotaStatus();
      const availableSpace = quota.availableBytes;
      
      // Fill most of the quota
      const largeFileSize = Math.floor(availableSpace * 0.8);
      const largeContent = createTestContent(largeFileSize);
      await fileOps.writeFile('large1.txt', largeContent);
            
      // Should still have some space
      const afterFirst = await fileOps.getQuotaStatus();
      expect(afterFirst.availableBytes).toBeLessThan(availableSpace);
      expect(afterFirst.availableBytes).toBeGreaterThan(0);
      
      // Try to add another large file (should fail)
      const anotherLargeContent = createTestContent(Math.floor(availableSpace * 0.5));
      await expect(fileOps.writeFile('large2.txt', anotherLargeContent))
        .rejects.toThrow(/quota/);
      
      // But small file should work
      await fileOps.writeFile('small.txt', 'Small content');
      expect(await fileOps.exists('small.txt')).toBe(true);
      
      // Delete large file and quota should be reclaimed
      await fileOps.deleteFile('large1.txt');
      
      const afterDelete = await fileOps.getQuotaStatus();
      expect(afterDelete.availableBytes).toBeGreaterThan(afterFirst.availableBytes);
    });

    it('should handle quota updates across file operations', async () => {
      const initialQuota = await fileOps.getQuotaStatus();
      
      // Create several files
      await fileOps.writeFile('file1.txt', createTestContent(1000));
      await fileOps.writeFile('file2.txt', createTestContent(2000));
      await fileOps.writeFile('file3.txt', createTestContent(1500));
      
      const afterCreation = await fileOps.getQuotaStatus();
      expect(afterCreation.usedBytes).toBeGreaterThan(initialQuota.usedBytes + 4000);
      
      // Copy a file (should increase usage)
      await fileOps.copyFile('file2.txt', 'file2-copy.txt');
      
      const afterCopy = await fileOps.getQuotaStatus();
      expect(afterCopy.usedBytes).toBeGreaterThan(afterCreation.usedBytes + 1800);
      
      // Move a file (should not significantly change usage)
      await fileOps.moveFile('file3.txt', 'file3-moved.txt');
      
      const afterMove = await fileOps.getQuotaStatus();
      expect(Math.abs(afterMove.usedBytes - afterCopy.usedBytes)).toBeLessThan(100);
    });
  });

  describe('Security Integration', () => {
    it('should enforce security across all operations', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config',
        '/etc/shadow',
        'C:\\Windows\\System32\\drivers\\etc\\hosts'
      ];
      
      for (const maliciousPath of maliciousPaths) {
        // All operations should reject malicious paths
        await expect(fileOps.writeFile(maliciousPath, 'evil')).rejects.toThrow();
        await expect(fileOps.readFile(maliciousPath)).rejects.toThrow();
        await expect(fileOps.appendFile(maliciousPath, 'evil')).rejects.toThrow();
        await expect(fileOps.deleteFile(maliciousPath)).rejects.toThrow();
        await expect(fileOps.exists(maliciousPath)).rejects.toThrow();
        await expect(fileOps.getFileInfo(maliciousPath)).rejects.toThrow();
        await expect(fileOps.copyFile('valid.txt', maliciousPath)).rejects.toThrow();
        await expect(fileOps.moveFile('valid.txt', maliciousPath)).rejects.toThrow();
        await expect(fileOps.listDirectory(maliciousPath)).rejects.toThrow();
      }
    });

    it('should handle restricted configuration properly', async () => {
      const restrictedConfig = createTestConfig({
        sandboxRoot: sandbox.path,
        quotaBytes: 100 * 1024,
        maxFileSizeBytes: 50 * 1024,
        allowDelete: false,
        allowDirectoryOps: false,
        allowBinary: false,
        blockedExtensions: ['.exe', '.dll'],
        allowedExtensions: ['.txt', '.json', '.md']
      });
      
      const restrictedQuota = new QuotaManager(restrictedConfig);
      await restrictedQuota.initialize();
      
      const restrictedOps = new FileOperations(restrictedConfig, restrictedQuota);
      
      // Should allow text files
      await restrictedOps.writeFile('allowed.txt', 'This is allowed');
      await restrictedOps.writeFile('data.json', '{"allowed": true}');
      
      // Should block restricted extensions
      await expect(restrictedOps.writeFile('virus.exe', 'malware'))
        .rejects.toThrow();
      
      // Should block non-whitelisted extensions
      await expect(restrictedOps.writeFile('script.js', 'console.log("blocked")'))
        .rejects.toThrow();
      
      // Should block binary operations
      const binaryData = createBinaryTestData(100).toString('base64');
      await expect(restrictedOps.writeFile('image.dat', binaryData, 'base64'))
        .rejects.toThrow();
      
      // Should block delete operations
      await expect(restrictedOps.deleteFile('allowed.txt'))
        .rejects.toThrow();
      
      // Should block directory operations
      await expect(restrictedOps.createDirectory('new-dir'))
        .rejects.toThrow();
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial operation failures gracefully', async () => {
      // Create some initial files
      await fileOps.writeFile('good1.txt', 'Good content 1');
      await fileOps.writeFile('good2.txt', 'Good content 2');
      
      // Try operations that should fail
      await expect(fileOps.writeFile('../evil.txt', 'evil'))
        .rejects.toThrow();
      
      // Verify good files are still intact
      expect(await fileOps.readFile('good1.txt')).toBe('Good content 1');
      expect(await fileOps.readFile('good2.txt')).toBe('Good content 2');
      
      // Quota should still be accurate
      const quota = await fileOps.getQuotaStatus();
      expect(quota.usedBytes).toBeGreaterThan(0);
      expect(quota.percentUsed).toBeGreaterThan(0);
    });

    it('should handle quota file corruption recovery', async () => {
      // Create some files
      await fileOps.writeFile('test1.txt', createTestContent(1000));
      await fileOps.writeFile('test2.txt', createTestContent(2000));
      
      // Corrupt the quota file
      await sandbox.createFile('.mcp-quota.json', 'invalid json');
      
      // Quota manager should recover
      await quotaManager.rebuildQuotaData();
      
      const quota = await fileOps.getQuotaStatus();
      expect(quota.usedBytes).toBeGreaterThan(2800); // Should have recalculated
      
      // Should be able to continue operations
      await fileOps.writeFile('test3.txt', 'New content');
      expect(await fileOps.exists('test3.txt')).toBe(true);
    });

    it('should handle concurrent access safely', async () => {
      const promises: Promise<void>[] = [];
      
      // Simulate multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        promises.push(fileOps.writeFile(`concurrent-${i}.txt`, `Content ${i}`));
      }
      
      // All should complete successfully
      await Promise.all(promises);
      
      // Verify all files exist
      for (let i = 0; i < 10; i++) {
        expect(await fileOps.exists(`concurrent-${i}.txt`)).toBe(true);
        expect(await fileOps.readFile(`concurrent-${i}.txt`)).toBe(`Content ${i}`);
      }
      
      // Quota should be accurate
      const quota = await fileOps.getQuotaStatus();
      expect(quota.usedBytes).toBeGreaterThan(100); // At least 10 files worth
    });
  });

  describe('Configuration Integration', () => {
    it('should respect environment variable configuration', async () => {
      // Test that configuration loading works in integration
      const envConfig = loadConfig();
      
      // Should have reasonable defaults
      expect(envConfig.quotaBytes).toBeGreaterThan(0);
      expect(envConfig.maxFileSizeBytes).toBeGreaterThan(0);
      expect(envConfig.maxFileSizeBytes).toBeLessThan(envConfig.quotaBytes);
      expect(typeof envConfig.allowDelete).toBe('boolean');
      expect(typeof envConfig.allowDirectoryOps).toBe('boolean');
      expect(typeof envConfig.allowBinary).toBe('boolean');
      expect(Array.isArray(envConfig.blockedExtensions)).toBe(true);
      expect(Array.isArray(envConfig.allowedExtensions)).toBe(true);
    });

    it('should validate configuration properly', async () => {
      const validConfig = createTestConfig({
        sandboxRoot: sandbox.path,
        quotaBytes: 1024 * 1024, // 1MB
        maxFileSizeBytes: 512 * 1024, // 512KB
        allowDelete: true,
        allowDirectoryOps: true,
        allowBinary: true,
        blockedExtensions: ['.exe'],
        allowedExtensions: []
      });
      
      // Should validate without throwing
      await expect(validateConfig(validConfig)).resolves.not.toThrow();
      
      // Should create sandbox directory if needed
      const newSandboxPath = `${sandbox.path}/new-validation-test`;
      const configWithNewPath = {
        ...validConfig,
        sandboxRoot: newSandboxPath
      };
      
      await validateConfig(configWithNewPath);
      expect(await sandbox.exists('new-validation-test')).toBe(true);
    });
  });

  describe('Performance Integration', () => {
    it('should handle multiple file operations efficiently', async () => {
      const start = Date.now();
      
      // Create directory structure
      await fileOps.createDirectory('performance/test');
      
      // Create multiple files
      const filePromises: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) {
        filePromises.push(
          fileOps.writeFile(`performance/test/file-${i}.txt`, createTestContent(500))
        );
      }
      
      await Promise.all(filePromises);
      
      // Read all files
      const readPromises: Promise<string | Buffer>[] = [];
      for (let i = 0; i < 20; i++) {
        readPromises.push(fileOps.readFile(`performance/test/file-${i}.txt`));
      }
      
      const contents = await Promise.all(readPromises);
      expect(contents).toHaveLength(20);
      
      // List directory
      const listing = await fileOps.listDirectory('performance/test');
      expect(listing.entries).toHaveLength(20);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should optimize file reading based on content type', async () => {
      // Create different types of files
      await fileOps.writeFile('text.txt', 'Simple text content');
      await fileOps.writeFile('json.json', '{"test": "data"}');
      await fileOps.writeFile('binary.dat', createBinaryTestData(100).toString('base64'), 'base64');
      
      // Test optimized reading
      const textResult = await fileOps.readFileWithMetadata('text.txt');
      expect(textResult.encoding).toBe('utf-8');
      expect(textResult.isBinary).toBe(false);
      
      const jsonResult = await fileOps.readFileWithMetadata('json.json');
      expect(jsonResult.encoding).toBe('utf-8');
      expect(jsonResult.isBinary).toBe(false);
      
      const binaryResult = await fileOps.readFileWithMetadata('binary.dat');
      expect(binaryResult.encoding).toBe('base64');
      expect(binaryResult.isBinary).toBe(true);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical development project workflow', async () => {
      // Initialize project structure
      await fileOps.createDirectory('my-project/src');
      await fileOps.createDirectory('my-project/docs');
      await fileOps.createDirectory('my-project/tests');
      
      // Create project files
      await fileOps.writeFile('my-project/package.json', JSON.stringify({
        name: 'my-project',
        version: '1.0.0',
        dependencies: {}
      }, null, 2));
      
      await fileOps.writeFile('my-project/README.md', '# My Project\n\nThis is a test project.');
      await fileOps.writeFile('my-project/src/index.js', 'console.log("Hello World");');
      await fileOps.writeFile('my-project/tests/index.test.js', 'test("should work", () => {});');
      
      // Verify project structure
      const projectListing = await fileOps.listDirectory('my-project');
      const expectedFiles = ['package.json', 'README.md', 'src', 'docs', 'tests'];
      
      for (const expected of expectedFiles) {
        expect(projectListing.entries.map(e => e.name)).toContain(expected);
      }
      
      // Update a file
      const originalReadme = await fileOps.readFile('my-project/README.md');
      await fileOps.appendFile('my-project/README.md', '\n\n## Installation\n\nnpm install');
      
      const updatedReadme = await fileOps.readFile('my-project/README.md');
      expect(updatedReadme).toBe(originalReadme + '\n\n## Installation\n\nnpm install');
      
      // Copy configuration
      await fileOps.copyFile('my-project/package.json', 'my-project/package.backup.json');
      
      // Check quota usage for the project
      const quota = await fileOps.getQuotaStatus();
      expect(quota.usedBytes).toBeGreaterThan(500); // Project should use some space
      expect(quota.percentUsed).toBeGreaterThan(0);
    });

    it('should handle data processing workflow', async () => {
      // Create data directory
      await fileOps.createDirectory('data/raw');
      await fileOps.createDirectory('data/processed');
      
      // Create sample data files
      const csvData = 'name,age,city\nJohn,30,NYC\nJane,25,LA\nBob,35,Chicago';
      await fileOps.writeFile('data/raw/users.csv', csvData);
      
      const configData = JSON.stringify({
        processing: {
          filters: ['age > 25'],
          output_format: 'json'
        }
      }, null, 2);
      await fileOps.writeFile('data/config.json', configData);
      
      // Simulate processing (read, transform, write)
      const rawData = await fileOps.readFile('data/raw/users.csv');
      const config = JSON.parse(await fileOps.readFile('data/config.json') as string);
      
      // Process data (simplified)
      const lines = (rawData as string).split('\n');
      const headers = lines[0].split(',');
      const processedData = lines.slice(1).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, header, i) => {
          obj[header] = values[i];
          return obj;
        }, {} as Record<string, string>);
      });
      
      // Write processed data
      await fileOps.writeFile('data/processed/users.json', JSON.stringify(processedData, null, 2));
      
      // Verify output
      const outputData = JSON.parse(await fileOps.readFile('data/processed/users.json') as string);
      expect(outputData).toHaveLength(3);
      expect(outputData[0]).toHaveProperty('name', 'John');
      expect(outputData[0]).toHaveProperty('age', '30');
      
      // Create summary report
      const summary = {
        total_records: processedData.length,
        processing_date: new Date().toISOString(),
        config_used: config
      };
      
      await fileOps.writeFile('data/summary.json', JSON.stringify(summary, null, 2));
      
      // List all data files
      const rawListing = await fileOps.listDirectory('data/raw');
      const processedListing = await fileOps.listDirectory('data/processed');
      
      expect(rawListing.entries.map(e => e.name)).toContain('users.csv');
      expect(processedListing.entries.map(e => e.name)).toContain('users.json');
    });
  });

  describe('File Content Type Detection', () => {
    it('should properly detect and handle different file types', async () => {
      // Text file
      await fileOps.writeFile('document.txt', 'This is plain text');
      const textMeta = await fileOps.readFileWithMetadata('document.txt');
      expect(textMeta.isBinary).toBe(false);
      expect(textMeta.encoding).toBe('utf-8');
      
      // JSON file
      await fileOps.writeFile('data.json', '{"key": "value"}');
      const jsonMeta = await fileOps.readFileWithMetadata('data.json');
      expect(jsonMeta.isBinary).toBe(false);
      expect(jsonMeta.encoding).toBe('utf-8');
      
      // Binary file (simulated)
      const binaryData = createBinaryTestData(200);
      await fileOps.writeFile('binary.bin', binaryData.toString('base64'), 'base64');
      const binaryMeta = await fileOps.readFileWithMetadata('binary.bin');
      expect(binaryMeta.isBinary).toBe(true);
      expect(binaryMeta.encoding).toBe('base64');
    });

    it('should handle encoding overrides correctly', async () => {
      await fileOps.writeFile('test.txt', 'Test content');
      
      // Default detection (should be UTF-8)
      const defaultRead = await fileOps.readFileWithMetadata('test.txt');
      expect(defaultRead.encoding).toBe('utf-8');
      
      // Override to base64
      const base64Read = await fileOps.readFileWithMetadata('test.txt', 'base64');
      expect(base64Read.encoding).toBe('base64');
      
      // Verify content is correct in both cases
      const utf8Content = defaultRead.content;
      const base64Content = base64Read.content;
      expect(Buffer.from(base64Content, 'base64').toString('utf-8')).toBe(utf8Content);
    });
  });
});
