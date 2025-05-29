import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceTimer } from '../../logger.js';
import { createMockLogger } from '../../test-utils/mockLogger.js';

describe('PerformanceTimer', () => {
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockLogger.clear();
  });

  describe('Basic Timing', () => {
    it('should measure operation duration', async () => {
      const timer = new PerformanceTimer('TestComponent', 'testOperation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      timer.end(true);
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'TestComponent',
        'testOperation',
        expect.any(Number),
        true,
        undefined
      );
      
      // Check that duration was recorded (should be at least 50ms)
      const calls = mockLogger.logOperation.mock.calls;
      const [, , startTime, success] = calls[0];
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThan(40); // Allow some variance
      expect(success).toBe(true);
    });

    it('should log debug message on start', () => {
      new PerformanceTimer('TestComponent', 'startTest');
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'TestComponent',
        'Starting operation',
        'startTest'
      );
    });

    it('should handle failed operations', () => {
      const timer = new PerformanceTimer('TestComponent', 'failedOperation');
      
      timer.end(false, { error: 'Something went wrong' });
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'TestComponent',
        'failedOperation',
        expect.any(Number),
        false,
        { error: 'Something went wrong' }
      );
    });

    it('should include metadata when provided', () => {
      const timer = new PerformanceTimer('TestComponent', 'metadataTest');
      const metadata = { fileSize: 1024, path: '/test/file.txt' };
      
      timer.end(true, metadata);
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'TestComponent',
        'metadataTest',
        expect.any(Number),
        true,
        metadata
      );
    });
  });

  describe('File Size Timing', () => {
    it('should log performance metrics with file size', () => {
      const timer = new PerformanceTimer('FileOps', 'readFile');
      const fileSize = 2048;
      const quotaUsed = 75;
      
      timer.endWithFileSize(fileSize, true, quotaUsed);
      
      expect(mockLogger.logPerformance).toHaveBeenCalledWith(
        'FileOps',
        'readFile',
        fileSize,
        expect.any(Number),
        quotaUsed
      );
    });

    it('should handle file operations without quota info', () => {
      const timer = new PerformanceTimer('FileOps', 'writeFile');
      const fileSize = 1024;
      
      timer.endWithFileSize(fileSize, false);
      
      expect(mockLogger.logPerformance).toHaveBeenCalledWith(
        'FileOps',
        'writeFile',
        fileSize,
        expect.any(Number),
        undefined
      );
    });

    it('should handle zero-size files', () => {
      const timer = new PerformanceTimer('FileOps', 'createEmptyFile');
      
      timer.endWithFileSize(0, true, 50);
      
      expect(mockLogger.logPerformance).toHaveBeenCalledWith(
        'FileOps',
        'createEmptyFile',
        0,
        expect.any(Number),
        50
      );
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle typical file read scenario', async () => {
      const timer = new PerformanceTimer('FileOps', 'readFile');
      
      // Simulate file reading with delay
      await new Promise(resolve => setTimeout(resolve, 25));
      
      timer.endWithFileSize(4096, true, 45);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'FileOps',
        'Starting operation',
        'readFile'
      );
      
      expect(mockLogger.logPerformance).toHaveBeenCalledWith(
        'FileOps',
        'readFile',
        4096,
        expect.any(Number),
        45
      );
    });

    it('should handle failed file write scenario', () => {
      const timer = new PerformanceTimer('FileOps', 'writeFile');
      
      timer.end(false, { 
        error: 'Disk full',
        attemptedSize: 10240,
        availableSpace: 1024
      });
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'FileOps',
        'writeFile',
        expect.any(Number),
        false,
        {
          error: 'Disk full',
          attemptedSize: 10240,
          availableSpace: 1024
        }
      );
    });

    it('should handle quota check operations', () => {
      const timer = new PerformanceTimer('QuotaManager', 'updateQuotaUsage');
      
      timer.end(true, {
        filesScanned: 150,
        totalSize: 52428800, // 50MB
        quotaPercentage: 85.5
      });
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'QuotaManager',
        'updateQuotaUsage',
        expect.any(Number),
        true,
        {
          filesScanned: 150,
          totalSize: 52428800,
          quotaPercentage: 85.5
        }
      );
    });

    it('should handle security validation timing', () => {
      const timer = new PerformanceTimer('Security', 'pathValidation');
      
      timer.end(true, {
        path: 'safe/path/to/file.txt',
        checks: ['traversal', 'extension', 'filename'],
        blocked: false
      });
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'Security',
        'pathValidation',
        expect.any(Number),
        true,
        {
          path: 'safe/path/to/file.txt',
          checks: ['traversal', 'extension', 'filename'],
          blocked: false
        }
      );
    });
  });

  describe('Performance Considerations', () => {
    it('should have minimal overhead', () => {
      const iterations = 1000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const timer = new PerformanceTimer('Benchmark', 'minimalOp');
        timer.end(true);
      }
      
      const duration = Date.now() - start;
      const averagePerOp = duration / iterations;
      
      // Should be very fast - less than 1ms per operation on average
      expect(averagePerOp).toBeLessThan(1);
      expect(mockLogger.debug).toHaveBeenCalledTimes(iterations);
      expect(mockLogger.logOperation).toHaveBeenCalledTimes(iterations);
    });

    it('should handle concurrent timers', () => {
      const timers: Array<any> = [];
      
      // Create multiple timers
      for (let i = 0; i < 10; i++) {
        timers.push(new PerformanceTimer('Concurrent', `operation-${i}`));
      }
      
      // End them in random order
      const shuffled = [...timers].sort(() => Math.random() - 0.5);
      shuffled.forEach((timer, index) => {
        timer.end(true, { order: index });
      });
      
      expect(mockLogger.debug).toHaveBeenCalledTimes(10);
      expect(mockLogger.logOperation).toHaveBeenCalledTimes(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very fast operations', () => {
      const timer = new PerformanceTimer('FastOp', 'instantaneous');
      timer.end(true);
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'FastOp',
        'instantaneous',
        expect.any(Number),
        true,
        undefined
      );
      
      // Duration should be very small but still recorded
      const calls = mockLogger.logOperation.mock.calls;
      const [, , startTime] = calls[0];
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle large file sizes', () => {
      const timer = new PerformanceTimer('FileOps', 'hugefile');
      const largeFileSize = 1024 * 1024 * 1024; // 1GB
      
      timer.endWithFileSize(largeFileSize, true, 95);
      
      expect(mockLogger.logPerformance).toHaveBeenCalledWith(
        'FileOps',
        'hugefile',
        largeFileSize,
        expect.any(Number),
        95
      );
    });

    it('should handle operations with special characters', () => {
      const timer = new PerformanceTimer('FileOps', 'unicode-file-读写操作');
      
      timer.end(true, {
        filename: '特殊字符文件.txt',
        encoding: 'utf-8',
        specialChars: '🚀📁💾'
      });
      
      expect(mockLogger.logOperation).toHaveBeenCalledWith(
        'FileOps',
        'unicode-file-读写操作',
        expect.any(Number),
        true,
        {
          filename: '特殊字符文件.txt',
          encoding: 'utf-8',
          specialChars: '🚀📁💾'
        }
      );
    });
  });
});
