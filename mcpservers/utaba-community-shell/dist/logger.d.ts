export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    component: string;
    operation?: string;
    message: string;
    metadata?: Record<string, any>;
    performance?: {
        duration?: number;
        success?: boolean;
        [key: string]: any;
    };
    security?: {
        command?: string;
        blocked?: boolean;
        reason?: string;
        [key: string]: any;
    };
}
export interface LoggerConfig {
    logFile?: string;
    maxSizeMB?: number;
    rotationStrategy?: "truncate" | "rotate";
    keepFiles?: number;
    format?: "text" | "json";
    asyncWrite?: boolean;
    level?: LogLevel;
}
export declare class Logger {
    private static instance;
    private currentLevel;
    private logHistory;
    private maxHistorySize;
    private config;
    private writeBuffer;
    private flushTimer?;
    private logFileHandle?;
    private constructor();
    static getInstance(): Logger;
    initialize(config?: LoggerConfig): Promise<void>;
    private initializeLogFile;
    private checkLogRotation;
    private rotateLogFile;
    private truncateLogFile;
    private startAsyncFlush;
    private flushBuffer;
    private writeToFile;
    setLevel(level: LogLevel): void;
    private shouldLog;
    private createLogEntry;
    private addToHistory;
    private formatLogOutput;
    private logToFile;
    private log;
    debug(component: string, message: string, operation?: string, metadata?: Record<string, any>): void;
    info(component: string, message: string, operation?: string, metadata?: Record<string, any>): void;
    warn(component: string, message: string, operation?: string, metadata?: Record<string, any>): void;
    error(component: string, message: string, operation?: string, metadata?: Record<string, any>): void;
    logOperation(component: string, operation: string, startTime: number, success: boolean, metadata?: Record<string, any>): void;
    logSecurity(component: string, operation: string, command: string, blocked: boolean, reason?: string): void;
    logPerformance(component: string, operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void;
    getRecentLogs(count?: number): LogEntry[];
    getFilteredLogs(filters: {
        component?: string;
        level?: LogLevel;
        operation?: string;
        since?: Date;
    }): LogEntry[];
    clearHistory(): void;
    getConfig(): LoggerConfig;
    shutdown(): Promise<void>;
}
export declare const logger: Logger;
export declare class PerformanceTimer {
    private startTime;
    private component;
    private operation;
    constructor(component: string, operation: string);
    end(success?: boolean, metadata?: Record<string, any>): void;
    endWithPerformance(success?: boolean, additionalMetrics?: Record<string, any>): void;
}
//# sourceMappingURL=logger.d.ts.map