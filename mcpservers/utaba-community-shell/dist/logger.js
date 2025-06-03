import * as fs from "fs";
import * as path from "path";
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (LogLevel = {}));
export class Logger {
    static instance;
    currentLevel = LogLevel.INFO;
    logHistory = [];
    maxHistorySize = 1000;
    config = {};
    writeBuffer = [];
    flushTimer;
    logFileHandle;
    constructor() { }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    async initialize(config) {
        this.config = {
            maxSizeMB: 10,
            rotationStrategy: "rotate",
            keepFiles: 3,
            format: "text",
            asyncWrite: true,
            level: LogLevel.INFO,
            ...config,
        };
        if (this.config.level !== undefined) {
            this.currentLevel = this.config.level;
        }
        // Load from environment variables
        if (process.env.LOG_FILE) {
            this.config.logFile = process.env.LOG_FILE;
        }
        if (process.env.LOG_MAX_SIZE_MB) {
            this.config.maxSizeMB = parseInt(process.env.LOG_MAX_SIZE_MB, 10);
        }
        if (process.env.LOG_ROTATION_STRATEGY) {
            this.config.rotationStrategy = process.env.LOG_ROTATION_STRATEGY;
        }
        if (process.env.LOG_KEEP_FILES) {
            this.config.keepFiles = parseInt(process.env.LOG_KEEP_FILES, 10);
        }
        if (process.env.LOG_FORMAT) {
            this.config.format = process.env.LOG_FORMAT;
        }
        if (process.env.LOG_LEVEL) {
            const envLevel = LogLevel[process.env.LOG_LEVEL.toUpperCase()];
            if (envLevel !== undefined) {
                this.currentLevel = envLevel;
            }
        }
        if (this.config.logFile) {
            try {
                await this.initializeLogFile();
                if (this.config.asyncWrite) {
                    this.startAsyncFlush();
                }
            }
            catch (error) {
                console.error("Failed to initialize log file:", error);
                // Continue without file logging
                this.config.logFile = undefined;
            }
        }
    }
    async initializeLogFile() {
        if (!this.config.logFile)
            return;
        try {
            // Ensure directory exists
            const logDir = path.dirname(this.config.logFile);
            await fs.promises.mkdir(logDir, { recursive: true });
            // Check if log rotation is needed
            await this.checkLogRotation();
            // Keep file handle open for better performance
            this.logFileHandle = await fs.promises.open(this.config.logFile, "a");
            // Log initialization
            const initMessage = this.config.format === "json"
                ? JSON.stringify({
                    timestamp: new Date().toISOString(),
                    level: "INFO",
                    component: "Logger",
                    message: "File logging initialized",
                    config: this.config,
                }) + "\n"
                : `${new Date().toISOString()} INFO  [Logger] File logging initialized\n`;
            await this.writeToFile(initMessage);
        }
        catch (error) {
            console.error("Failed to initialize log file:", error);
            throw error;
        }
    }
    async checkLogRotation() {
        if (!this.config.logFile || !this.config.maxSizeMB)
            return;
        try {
            const stats = await fs.promises.stat(this.config.logFile);
            const maxBytes = this.config.maxSizeMB * 1024 * 1024;
            if (stats.size >= maxBytes) {
                if (this.config.rotationStrategy === "rotate") {
                    await this.rotateLogFile();
                }
                else {
                    await this.truncateLogFile();
                }
            }
        }
        catch (error) {
            // File doesn't exist yet, which is fine
            if (error.code !== "ENOENT") {
                console.error("Error checking log file size:", error);
            }
        }
    }
    async rotateLogFile() {
        if (!this.config.logFile)
            return;
        try {
            // Close current file handle
            if (this.logFileHandle) {
                await this.logFileHandle.close();
                this.logFileHandle = undefined;
            }
            const logFile = this.config.logFile;
            const keepFiles = this.config.keepFiles || 3;
            // Rotate existing files (logfile.2 -> logfile.3, logfile.1 -> logfile.2, etc.)
            for (let i = keepFiles - 1; i >= 1; i--) {
                const oldFile = `${logFile}.${i}`;
                const newFile = `${logFile}.${i + 1}`;
                try {
                    await fs.promises.access(oldFile);
                    if (i === keepFiles - 1) {
                        // Delete the oldest file
                        await fs.promises.unlink(oldFile);
                    }
                    else {
                        await fs.promises.rename(oldFile, newFile);
                    }
                }
                catch {
                    // File doesn't exist, continue
                }
            }
            // Move current log to .1
            try {
                await fs.promises.rename(logFile, `${logFile}.1`);
            }
            catch (error) {
                console.error("Error rotating log file:", error);
            }
            // Reopen the new log file
            this.logFileHandle = await fs.promises.open(logFile, "a");
        }
        catch (error) {
            console.error("Error during log rotation:", error);
        }
    }
    async truncateLogFile() {
        if (!this.config.logFile || !this.config.maxSizeMB)
            return;
        try {
            // Close current file handle
            if (this.logFileHandle) {
                await this.logFileHandle.close();
                this.logFileHandle = undefined;
            }
            const truncateBytes = 1024 * 1024; // 1MB
            const content = await fs.promises.readFile(this.config.logFile, "utf8");
            if (content.length > truncateBytes) {
                const truncatedContent = content.substring(truncateBytes);
                await fs.promises.writeFile(this.config.logFile, truncatedContent);
            }
            // Reopen the file
            this.logFileHandle = await fs.promises.open(this.config.logFile, "a");
        }
        catch (error) {
            console.error("Error truncating log file:", error);
        }
    }
    startAsyncFlush() {
        this.flushTimer = setInterval(async () => {
            await this.flushBuffer();
        }, 1000); // Flush every second
    }
    async flushBuffer() {
        if (this.writeBuffer.length === 0)
            return;
        const toWrite = this.writeBuffer.splice(0);
        const content = toWrite.join("");
        try {
            await this.writeToFile(content);
        }
        catch (error) {
            console.error("Error flushing log buffer:", error);
            // Put the content back if write failed
            this.writeBuffer.unshift(...toWrite);
        }
    }
    async writeToFile(content) {
        if (!this.logFileHandle)
            return;
        try {
            await this.logFileHandle.write(content);
            await this.logFileHandle.sync(); // Ensure data is written to disk
        }
        catch (error) {
            console.error("Error writing to log file:", error);
        }
    }
    setLevel(level) {
        this.currentLevel = level;
    }
    shouldLog(level) {
        return level >= this.currentLevel;
    }
    createLogEntry(level, component, message, operation, metadata) {
        return {
            timestamp: new Date().toISOString(),
            level,
            component,
            operation,
            message,
            metadata,
        };
    }
    addToHistory(entry) {
        this.logHistory.push(entry);
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift();
        }
    }
    formatLogOutput(entry) {
        if (this.config.format === "json") {
            return JSON.stringify({
                timestamp: entry.timestamp,
                level: LogLevel[entry.level],
                component: entry.component,
                operation: entry.operation,
                message: entry.message,
                performance: entry.performance,
                security: entry.security,
                metadata: entry.metadata,
            });
        }
        // Text format
        const levelStr = LogLevel[entry.level].padEnd(5);
        const timestamp = entry.timestamp.substring(11, 23); // HH:MM:SS.sss
        const operation = entry.operation ? ` [${entry.operation}]` : "";
        let output = `${timestamp} ${levelStr} [${entry.component}]${operation} ${entry.message}`;
        if (entry.performance) {
            const perf = entry.performance;
            const perfStr = [
                perf.duration ? `${perf.duration}ms` : null,
                perf.success !== undefined ? `success: ${perf.success}` : null,
            ]
                .filter(Boolean)
                .join(", ");
            if (perfStr)
                output += ` (${perfStr})`;
        }
        if (entry.security) {
            const sec = entry.security;
            output += ` [SECURITY:${sec.blocked ? "BLOCKED" : "ALLOWED"}]`;
            if (sec.reason)
                output += ` ${sec.reason}`;
        }
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            output += ` ${JSON.stringify(entry.metadata)}`;
        }
        return output;
    }
    async logToFile(entry) {
        if (!this.config.logFile)
            return;
        const logLine = this.formatLogOutput(entry) + "\n";
        if (this.config.asyncWrite) {
            this.writeBuffer.push(logLine);
        }
        else {
            await this.writeToFile(logLine);
        }
        // Check if rotation is needed (async to not block logging)
        setImmediate(() => this.checkLogRotation());
    }
    async log(level, component, message, operation, metadata) {
        if (!this.shouldLog(level))
            return;
        const entry = this.createLogEntry(level, component, message, operation, metadata);
        this.addToHistory(entry);
        const output = this.formatLogOutput(entry);
        // Output to stderr so it doesn't interfere with MCP protocol on stdout
        console.error(output);
        // Write to file if configured
        await this.logToFile(entry);
    }
    debug(component, message, operation, metadata) {
        this.log(LogLevel.DEBUG, component, message, operation, metadata);
    }
    info(component, message, operation, metadata) {
        this.log(LogLevel.INFO, component, message, operation, metadata);
    }
    warn(component, message, operation, metadata) {
        this.log(LogLevel.WARN, component, message, operation, metadata);
    }
    error(component, message, operation, metadata) {
        this.log(LogLevel.ERROR, component, message, operation, metadata);
    }
    // Specialized logging methods for command execution
    logOperation(component, operation, startTime, success, metadata) {
        const duration = Date.now() - startTime;
        const level = success ? LogLevel.INFO : LogLevel.ERROR;
        const message = success ? `Operation completed` : `Operation failed`;
        const entry = this.createLogEntry(level, component, message, operation, metadata);
        entry.performance = { duration, success, ...entry.performance };
        if (this.shouldLog(level)) {
            this.addToHistory(entry);
            console.error(this.formatLogOutput(entry));
            this.logToFile(entry);
        }
    }
    logSecurity(component, operation, command, blocked, reason) {
        const message = blocked
            ? `Security violation detected`
            : `Security check passed`;
        const entry = this.createLogEntry(LogLevel.WARN, component, message, operation);
        entry.security = { command, blocked, reason };
        if (this.shouldLog(LogLevel.WARN)) {
            this.addToHistory(entry);
            console.error(this.formatLogOutput(entry));
            this.logToFile(entry);
        }
    }
    logPerformance(component, operation, duration, success, metadata) {
        const message = `Performance metrics`;
        const entry = this.createLogEntry(LogLevel.DEBUG, component, message, operation);
        entry.performance = { duration, success, ...metadata };
        if (this.shouldLog(LogLevel.DEBUG)) {
            this.addToHistory(entry);
            console.error(this.formatLogOutput(entry));
            this.logToFile(entry);
        }
    }
    // Get recent log entries for debugging
    getRecentLogs(count = 50) {
        return this.logHistory.slice(-count);
    }
    // Get logs filtered by component or level
    getFilteredLogs(filters) {
        return this.logHistory.filter((entry) => {
            if (filters.component && entry.component !== filters.component)
                return false;
            if (filters.level !== undefined && entry.level < filters.level)
                return false;
            if (filters.operation && entry.operation !== filters.operation)
                return false;
            if (filters.since && new Date(entry.timestamp) < filters.since)
                return false;
            return true;
        });
    }
    // Clear log history
    clearHistory() {
        this.logHistory = [];
    }
    // Get current configuration
    getConfig() {
        return { ...this.config };
    }
    // Graceful shutdown
    async shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        // Flush any remaining buffer
        await this.flushBuffer();
        // Close file handle
        if (this.logFileHandle) {
            await this.logFileHandle.close();
        }
    }
}
// Create singleton instance
export const logger = Logger.getInstance();
// Performance timing utility
export class PerformanceTimer {
    startTime;
    component;
    operation;
    constructor(component, operation) {
        this.component = component;
        this.operation = operation;
        this.startTime = Date.now();
        logger.debug(component, `Starting operation`, operation);
    }
    end(success = true, metadata) {
        logger.logOperation(this.component, this.operation, this.startTime, success, metadata);
    }
    endWithPerformance(success = true, additionalMetrics) {
        const duration = Date.now() - this.startTime;
        logger.logPerformance(this.component, this.operation, duration, success, additionalMetrics);
    }
}
//# sourceMappingURL=logger.js.map