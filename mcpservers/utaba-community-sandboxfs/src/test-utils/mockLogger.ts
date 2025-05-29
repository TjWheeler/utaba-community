import { vi } from 'vitest';
import { Logger, LogLevel, LogEntry } from '../logger.js';

/**
 * Mock logger for testing that captures log entries
 */
export class MockLogger {
  private _entries: LogEntry[] = [];
  private _level: LogLevel = LogLevel.INFO;

  // Mock the logger methods
  debug = vi.fn((component: string, message: string, operation?: string, metadata?: Record<string, any>) => {
    this._addEntry(LogLevel.DEBUG, component, message, operation, metadata);
  });

  info = vi.fn((component: string, message: string, operation?: string, metadata?: Record<string, any>) => {
    this._addEntry(LogLevel.INFO, component, message, operation, metadata);
  });

  warn = vi.fn((component: string, message: string, operation?: string, metadata?: Record<string, any>) => {
    this._addEntry(LogLevel.WARN, component, message, operation, metadata);
  });

  error = vi.fn((component: string, message: string, operation?: string, metadata?: Record<string, any>) => {
    this._addEntry(LogLevel.ERROR, component, message, operation, metadata);
  });

  logOperation = vi.fn((component: string, operation: string, startTime: number, success: boolean, metadata?: Record<string, any>) => {
    const duration = Date.now() - startTime;
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = success ? 'Operation completed' : 'Operation failed';
    
    this._addEntry(level, component, message, operation, { 
      ...metadata, 
      performance: { duration }
    });
  });

  logSecurity = vi.fn((component: string, operation: string, path: string, blocked: boolean, reason?: string) => {
    this._addEntry(LogLevel.WARN, component, blocked ? 'Security violation detected' : 'Security check passed', operation, {
      security: { path, blocked, reason }
    });
  });

  logPerformance = vi.fn((component: string, operation: string, fileSize: number, duration: number, quotaUsed?: number) => {
    this._addEntry(LogLevel.DEBUG, component, 'Performance metrics', operation, {
      performance: { duration, fileSize, quotaUsed }
    });
  });

  setLevel = vi.fn((level: LogLevel) => {
    this._level = level;
  });

  initialize = vi.fn();
  shutdown = vi.fn();
  clearHistory = vi.fn(() => {
    this._entries = [];
  });

  getRecentLogs = vi.fn((count: number = 50) => {
    return this._entries.slice(-count);
  });

  getFilteredLogs = vi.fn((filters: any) => {
    return this._entries.filter(entry => {
      if (filters.component && entry.component !== filters.component) return false;
      if (filters.level !== undefined && entry.level < filters.level) return false;
      if (filters.operation && entry.operation !== filters.operation) return false;
      return true;
    });
  });

  private _addEntry(level: LogLevel, component: string, message: string, operation?: string, metadata?: Record<string, any>) {
    if (level >= this._level) {
      this._entries.push({
        timestamp: new Date().toISOString(),
        level,
        component,
        operation,
        message,
        metadata
      });
    }
  }

  // Test helpers
  getEntries(): LogEntry[] {
    return [...this._entries];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this._entries.filter(entry => entry.level === level);
  }

  getEntriesByComponent(component: string): LogEntry[] {
    return this._entries.filter(entry => entry.component === component);
  }

  hasEntry(predicate: (entry: LogEntry) => boolean): boolean {
    return this._entries.some(predicate);
  }

  clear(): void {
    this._entries = [];
    vi.clearAllMocks();
  }
}

/**
 * Creates a mock logger and replaces the singleton instance
 */
export function createMockLogger(): MockLogger {
  const mockLogger = new MockLogger();
  
  // Mock the logger module's getInstance method
  vi.doMock('../logger.js', () => ({
    Logger: {
      getInstance: () => mockLogger
    },
    LogLevel,
    logger: mockLogger,
    PerformanceTimer: class MockPerformanceTimer {
      constructor(public component: string, public operation: string) {}
      end(success = true, metadata?: any) {
        mockLogger.logOperation(this.component, this.operation, Date.now() - 100, success, metadata);
      }
      endWithFileSize(fileSize: number, success = true, quotaUsed?: number) {
        mockLogger.logPerformance(this.component, this.operation, fileSize, 100, quotaUsed);
      }
    }
  }));
  
  return mockLogger;
}
