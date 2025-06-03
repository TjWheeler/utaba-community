/**
 * Async Job Queue System - Main Exports
 *
 * Provides asynchronous job processing capabilities for MCP Shell
 */
export * from './types.js';
export * from './utils.js';
export { AsyncJobQueue, type AsyncJobQueueConfig } from './queue.js';
export { AsyncJobProcessor, loadJobResults } from './processor.js';
import { AsyncJobQueue, AsyncJobQueueConfig } from './queue.js';
import { AsyncJobProcessor } from './processor.js';
import { ProcessorConfig } from './types.js';
import { Logger } from '../logger.js';
/**
 * Create a new AsyncJobQueue instance with sensible defaults
 */
export declare function createAsyncJobQueue(config: AsyncJobQueueConfig | undefined, logger: Logger): AsyncJobQueue;
/**
 * Create a new AsyncJobProcessor instance with sensible defaults
 */
export declare function createAsyncJobProcessor(queue: AsyncJobQueue, config: Partial<ProcessorConfig> | undefined, logger: Logger): AsyncJobProcessor;
/**
 * Default configuration values
 */
export declare const DEFAULT_CONFIG: Required<AsyncJobQueueConfig>;
/**
 * Environment variable names for configuration
 */
export declare const ENV_VARS: {
    readonly BASE_DIR: "ASYNC_QUEUE_BASE_DIR";
    readonly SUBDIR: "ASYNC_QUEUE_SUBDIR";
    readonly CAPACITY: "ASYNC_QUEUE_CAPACITY";
    readonly CLEANUP_INTERVAL: "ASYNC_QUEUE_CLEANUP_INTERVAL";
    readonly RETENTION: "ASYNC_QUEUE_RETENTION";
};
//# sourceMappingURL=index.d.ts.map