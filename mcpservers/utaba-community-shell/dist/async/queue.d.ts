/**
 * File-Based Job Queue Manager
 *
 * Handles persistent storage and retrieval of async jobs using filesystem
 */
import { EventEmitter } from 'events';
import { JobRecord, JobStatus, JobSummary, JobSubmissionRequest, JobQueueStats, JobUpdate, OperationType } from './types.js';
import { Logger } from '../logger.js';
/**
 * Configuration options for AsyncJobQueue
 */
export interface AsyncJobQueueConfig {
    baseDir?: string;
    queueSubdir?: string;
    processingCapacity?: number;
    cleanupInterval?: number;
    jobRetention?: number;
}
/**
 * Main job queue manager with file-based persistence
 */
export declare class AsyncJobQueue extends EventEmitter {
    private logger;
    private baseDir;
    private config;
    private isInitialized;
    private watchdog?;
    private stats;
    constructor(config: AsyncJobQueueConfig | undefined, logger: Logger);
    /**
     * Get the current configuration
     */
    getConfig(): Required<AsyncJobQueueConfig>;
    /**
     * Get the resolved base directory path
     */
    getBaseDirectory(): string;
    /**
     * Initialize the queue system
     */
    initialize(): Promise<void>;
    /**
     * Submit a new job for processing
     */
    submitJob(request: JobSubmissionRequest): Promise<JobRecord>;
    /**
     * Get job by ID
     */
    getJob(jobId: string): Promise<JobRecord | null>;
    /**
     * Update job status and properties
     */
    updateJob(jobId: string, update: JobUpdate): Promise<JobRecord | null>;
    /**
     * List jobs with optional filtering
     */
    listJobs(options?: {
        status?: JobStatus;
        operationType?: OperationType;
        conversationId?: string;
        limit?: number;
        offset?: number;
    }): Promise<JobSummary[]>;
    /**
     * Get queue statistics
     */
    getStats(): Promise<JobQueueStats>;
    /**
     * Clean up expired jobs
     */
    cleanup(options?: {
        maxAge?: number;
        dryRun?: boolean;
    }): Promise<{
        removed: number;
        archived: number;
    }>;
    /**
     * Shutdown the queue system
     */
    shutdown(): Promise<void>;
    private ensureDirectoryStructure;
    private saveJob;
    private moveJobToStatus;
    private removeJob;
    private archiveJob;
    private initializeStats;
    private loadStats;
    private saveStats;
    private refreshStats;
    private updateStatsForStatusChange;
    private startWatchdog;
}
//# sourceMappingURL=queue.d.ts.map