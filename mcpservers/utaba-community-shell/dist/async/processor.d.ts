/**
 * Async Job Processor
 *
 * Background processor that executes queued jobs and manages their lifecycle
 */
import { EventEmitter } from 'events';
import { JobRecord, ProcessorConfig } from './types.js';
import { AsyncJobQueue } from './queue.js';
import { Logger } from '../logger.js';
/**
 * Background job processor that handles command execution
 */
export declare class AsyncJobProcessor extends EventEmitter {
    private queue;
    private config;
    private logger;
    private isRunning;
    private activeProcesses;
    private processingLoop?;
    constructor(queue: AsyncJobQueue, config: ProcessorConfig, logger: Logger);
    /**
     * Start the background processor
     */
    start(): Promise<void>;
    /**
     * Stop the background processor
     */
    stop(): Promise<void>;
    /**
     * Get processor status
     */
    getStatus(): {
        isRunning: boolean;
        activeJobs: number;
        maxConcurrent: number;
        capacity: number;
    };
    /**
     * Main processing loop - checks for approved jobs and executes them
     */
    private processQueuedJobs;
    /**
     * Execute a single job
     */
    private executeJob;
    /**
     * Kill a running job
     */
    private killJob;
    /**
     * Update job progress based on output
     */
    private updateJobProgress;
    /**
     * Save job execution results to files
     */
    private saveJobResults;
    /**
     * Wait for all active processes to complete
     */
    private waitForProcessesToComplete;
}
/**
 * Load execution results from files
 */
export declare function loadJobResults(baseDir: string, job: JobRecord): Promise<{
    stdout: string;
    stderr: string;
    metadata?: any;
} | null>;
//# sourceMappingURL=processor.d.ts.map