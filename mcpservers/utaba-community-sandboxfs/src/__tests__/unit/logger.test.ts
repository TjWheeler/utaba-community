import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LogLevel, LoggerConfig } from '../../logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { useTempSandbox } from '../../test-utils/tempSandbox.js';

describe('Logger', () => {
  let logger: Logger;
  let sandbox = useTempSandbox('logger-test');

  beforeEach(async () => {
    // Get a fresh logger instance for each test
    logger = Logger.getInstance();
    
    // Clear any existing history
    logger.clearHistory();
    
    // Reset console.error mock
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await logger.shutdown();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      await logger.initialize();
      
      const config = logger.getConfig();
      expect(config.maxSizeMB).toBe(10);
      expect(config.rotationStrategy).toBe('rotate');
      expect(config.format).toBe('text');
      expect(config.asyncWrite).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const customConfig: LoggerConfig = {
        maxSizeMB: 5,
        rotationStrategy: 'truncate',
        format: 'json',
        asyncWrite: false,
        level: LogLevel.DEBUG
      };

      await logger.initialize(customConfig);
      
      const config = logger.getConfig();
      expect(config.maxSizeMB).toBe(5);
      expect(config.rotationStrategy).toBe('truncate');
      expect(config.format).toBe('json');
      expect(config.asyncWrite).toBe(false);
    });

    it('should set log level from configuration', async () => {
      await logger.initialize({ level: LogLevel.WARN });
      
      // Test that DEBUG and INFO are filtered out
      logger.debug('Test', 'Debug message');
      logger.info('Test', 'Info message');
      logger.warn('Test', 'Warn message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[0].message).toBe('Warn message');
    });

    it('should override level with environment variable', async () => {
      process.env.LOG_LEVEL = 'ERROR';
      
      await logger.initialize({ level: LogLevel.DEBUG });
      
      // Test that only ERROR level messages pass through
      logger.debug('Test', 'Debug message');
      logger.info('Test', 'Info message');
      logger.warn('Test', 'Warn message');
      logger.error('Test', 'Error message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.ERROR);
      expect(logs[0].message).toBe('Error message');
    });

    it('should handle invalid environment log level gracefully', async () => {
      process.env.LOG_LEVEL = 'INVALID';
      
      await logger.initialize({ level: LogLevel.INFO });
      
      // Should fall back to config level
      logger.debug('Test', 'Debug message');
      logger.info('Test', 'Info message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.INFO);
    });
  });

  describe('File Logging', () => {
    it('should initialize file logging when logFile is provided', async () => {
      const logFile = path.join(sandbox.path, 'test.log');
      
      await logger.initialize({ logFile });
      
      logger.info('Test', 'Test message');
      
      // Give async write time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      await logger.shutdown();
      
      expect(await sandbox.exists('test.log')).toBe(true);
      const content = await sandbox.readFile('test.log');
      expect(content).toContain('Test message');
      expect(content).toContain('File logging initialized');
    });

    it('should create log directory if it does not exist', async () => {
      const logFile = path.join(sandbox.path, 'logs', 'deep', 'test.log');
      
      await logger.initialize({ logFile });
      
      logger.info('Test', 'Test message');
      await new Promise(resolve => setTimeout(resolve, 100));
      await logger.shutdown();
      
      expect(await sandbox.exists('logs/deep/test.log')).toBe(true);
    });

    it('should use JSON format when configured', async () => {
      const logFile = path.join(sandbox.path, 'test.log');
      
      await logger.initialize({ 
        logFile, 
        format: 'json',
        asyncWrite: false 
      });
      
      logger.info('Test', 'Test message', 'testOp', { key: 'value' });
      await logger.shutdown();
      
      const content = await sandbox.readFile('test.log');
      const lines = content.trim().split('\n');
      
      // Should have init message and test message
      expect(lines.length).toBeGreaterThanOrEqual(2);
      
      // Parse the last line (our test message)
      const lastLine = JSON.parse(lines[lines.length - 1]);
      expect(lastLine.level).toBe('INFO');
      expect(lastLine.component).toBe('Test');
      expect(lastLine.operation).toBe('testOp');
      expect(lastLine.message).toBe('Test message');
      expect(lastLine.metadata).toEqual({ key: 'value' });
    });

    it('should handle file logging errors gracefully', async () => {
      // Try to write to a directory that can't be created
      const invalidPath = '/root/invalid/path/test.log';
      
      // Should not throw
      await expect(logger.initialize({ logFile: invalidPath })).resolves.not.toThrow();
      
      // Should still log to console
      logger.info('Test', 'Test message');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Log Levels', () => {
    beforeEach(async () => {
      await logger.initialize({ level: LogLevel.DEBUG });
    });

    it('should log all levels when set to DEBUG', () => {
      logger.debug('Test', 'Debug message');
      logger.info('Test', 'Info message');
      logger.warn('Test', 'Warn message');
      logger.error('Test', 'Error message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(4);
    });

    it('should filter logs based on current level', () => {
      logger.setLevel(LogLevel.WARN);
      
      logger.debug('Test', 'Debug message');
      logger.info('Test', 'Info message');
      logger.warn('Test', 'Warn message');
      logger.error('Test', 'Error message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(2);
      expect(logs.map(l => l.level)).toEqual([LogLevel.WARN, LogLevel.ERROR]);
    });
  });

  describe('Specialized Logging Methods', () => {
    beforeEach(async () => {
      await logger.initialize({ level: LogLevel.DEBUG });
    });

    it('should log operation with performance data', () => {
      const startTime = Date.now() - 100; // 100ms ago
      logger.logOperation('FileOps', 'writeFile', startTime, true, { size: 1024 });
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.component).toBe('FileOps');
      expect(log.operation).toBe('writeFile');
      expect(log.level).toBe(LogLevel.INFO);
      expect(log.message).toBe('Operation completed');
      expect(log.performance?.duration).toBeGreaterThan(50);
      expect(log.metadata?.size).toBe(1024);
    });

    it('should log failed operation as error', () => {
      const startTime = Date.now() - 50;
      logger.logOperation('FileOps', 'writeFile', startTime, false, { error: 'Disk full' });
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.level).toBe(LogLevel.ERROR);
      expect(log.message).toBe('Operation failed');
    });

    it('should log security events', () => {
      logger.logSecurity('Security', 'pathValidation', '/etc/passwd', true, 'Path traversal attempt');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.component).toBe('Security');
      expect(log.operation).toBe('pathValidation');
      expect(log.level).toBe(LogLevel.WARN);
      expect(log.message).toBe('Security violation detected');
      expect(log.security?.path).toBe('/etc/passwd');
      expect(log.security?.blocked).toBe(true);
      expect(log.security?.reason).toBe('Path traversal attempt');
    });

    it('should log performance metrics', () => {
      logger.logPerformance('FileOps', 'readFile', 2048, 150, 75);
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.component).toBe('FileOps');
      expect(log.operation).toBe('readFile');
      expect(log.level).toBe(LogLevel.DEBUG);
      expect(log.message).toBe('Performance metrics');
      expect(log.performance?.fileSize).toBe(2048);
      expect(log.performance?.duration).toBe(150);
      expect(log.performance?.quotaUsed).toBe(75);
    });
  });

  describe('Log History and Filtering', () => {
    beforeEach(async () => {
      await logger.initialize({ level: LogLevel.DEBUG });
    });

    it('should maintain log history', () => {
      logger.info('Component1', 'Message 1');
      logger.warn('Component2', 'Message 2');
      logger.error('Component1', 'Message 3');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(3);
      expect(logs.map(l => l.message)).toEqual(['Message 1', 'Message 2', 'Message 3']);
    });

    it('should filter logs by component', () => {
      logger.info('Component1', 'Message 1');
      logger.warn('Component2', 'Message 2');
      logger.error('Component1', 'Message 3');
      
      const filtered = logger.getFilteredLogs({ component: 'Component1' });
      expect(filtered).toHaveLength(2);
      expect(filtered.map(l => l.message)).toEqual(['Message 1', 'Message 3']);
    });

    it('should filter logs by level', () => {
      logger.debug('Test', 'Debug message');
      logger.info('Test', 'Info message');
      logger.warn('Test', 'Warn message');
      logger.error('Test', 'Error message');
      
      const filtered = logger.getFilteredLogs({ level: LogLevel.WARN });
      expect(filtered).toHaveLength(2);
      expect(filtered.map(l => l.level)).toEqual([LogLevel.WARN, LogLevel.ERROR]);
    });

    it('should filter logs by operation', () => {
      logger.info('Test', 'Message 1', 'operation1');
      logger.info('Test', 'Message 2', 'operation2');
      logger.info('Test', 'Message 3', 'operation1');
      
      const filtered = logger.getFilteredLogs({ operation: 'operation1' });
      expect(filtered).toHaveLength(2);
      expect(filtered.map(l => l.message)).toEqual(['Message 1', 'Message 3']);
    });

    it('should clear log history', () => {
      logger.info('Test', 'Message 1');
      logger.info('Test', 'Message 2');
      
      expect(logger.getRecentLogs()).toHaveLength(2);
      
      logger.clearHistory();
      expect(logger.getRecentLogs()).toHaveLength(0);
    });

    it('should limit history size', async () => {
      // Initialize with a small history limit for testing
      await logger.initialize({ level: LogLevel.DEBUG });
      
      // Create more logs than the limit (1000 is the default)
      for (let i = 0; i < 1005; i++) {
        logger.info('Test', `Message ${i}`);
      }
      
      const logs = logger.getRecentLogs();
      expect(logs.length).toBeLessThanOrEqual(1000);
      
      // Should keep the most recent ones
      const lastLog = logs[logs.length - 1];
      expect(lastLog.message).toBe('Message 1004');
    });
  });

  describe('Performance Timer', () => {
    it('should be tested in performance timer specific tests', () => {
      // The PerformanceTimer class will have its own test file
      expect(true).toBe(true);
    });
  });
});
