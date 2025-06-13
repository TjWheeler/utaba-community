/**
 * Async Job Queue System - Main Exports
 *
 * Provides asynchronous job processing capabilities for MCP Shell
 */
// Core types
export * from './types.js';
// Utilities
export * from './utils.js';
// Main queue implementation
export { AsyncJobQueue } from './queue.js';
// Background processor
export { AsyncJobProcessor, loadJobResults } from './processor.js';
// Convenience factory function for creating queue with default configuration
import { AsyncJobQueue } from './queue.js';
import { AsyncJobProcessor } from './processor.js';
import { DEFAULT_PROCESSOR_CONFIG } from './types.js';
/**
 * Create a new AsyncJobQueue instance with sensible defaults
 */
export function createAsyncJobQueue(config = {}, logger) {
    // Apply environment-based defaults
    const envConfig = {
        baseDir: config.baseDir || process.env.ASYNC_QUEUE_BASE_DIR || process.cwd(),
        queueSubdir: config.queueSubdir || process.env.ASYNC_QUEUE_SUBDIR || 'async-queue',
        processingCapacity: config.processingCapacity ||
            (process.env.ASYNC_QUEUE_CAPACITY ? parseInt(process.env.ASYNC_QUEUE_CAPACITY) : 5),
        cleanupInterval: config.cleanupInterval ||
            (process.env.ASYNC_QUEUE_CLEANUP_INTERVAL ? parseInt(process.env.ASYNC_QUEUE_CLEANUP_INTERVAL) : 5 * 60 * 1000),
        jobRetention: config.jobRetention ||
            (process.env.ASYNC_QUEUE_RETENTION ? parseInt(process.env.ASYNC_QUEUE_RETENTION) : 7 * 24 * 60 * 60 * 1000)
    };
    return new AsyncJobQueue(envConfig, logger);
}
/**
 * Create a new AsyncJobProcessor instance with sensible defaults
 */
export function createAsyncJobProcessor(queue, config = {}, logger) {
    const processorConfig = {
        ...DEFAULT_PROCESSOR_CONFIG,
        ...config
    };
    return new AsyncJobProcessor(queue, processorConfig, logger);
}
/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    baseDir: process.cwd(),
    queueSubdir: 'async-queue',
    processingCapacity: 5,
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
    jobRetention: 7 * 24 * 60 * 60 * 1000 // 7 days
};
/**
 * Environment variable names for configuration
 */
export const ENV_VARS = {
    BASE_DIR: 'ASYNC_QUEUE_BASE_DIR',
    SUBDIR: 'ASYNC_QUEUE_SUBDIR',
    CAPACITY: 'ASYNC_QUEUE_CAPACITY',
    CLEANUP_INTERVAL: 'ASYNC_QUEUE_CLEANUP_INTERVAL',
    RETENTION: 'ASYNC_QUEUE_RETENTION'
};
//# sourceMappingURL=index.js.map