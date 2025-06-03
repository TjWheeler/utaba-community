/**
 * Async Job Queue Utilities
 *
 * Core utility functions for job management, security, and file operations
 */
import { JobRecord, OperationType, JobError } from './types.js';
/**
 * Generate cryptographically secure job ID
 */
export declare function generateJobId(): string;
/**
 * Generate secure execution token for result retrieval
 */
export declare function generateExecutionToken(): string;
/**
 * Generate conversation session ID
 */
export declare function generateSessionId(): string;
/**
 * Classify command into operation type for polling strategy
 */
export declare function classifyOperation(command: string, args: string[]): OperationType;
/**
 * Estimate execution duration based on operation type and command
 */
export declare function estimateExecutionDuration(operationType: OperationType, command: string, args: string[]): number;
/**
 * Calculate next polling interval based on job state and elapsed time
 */
export declare function calculatePollingInterval(job: JobRecord): number;
/**
 * Determine if polling should continue based on job state and elapsed time
 */
export declare function shouldContinuePolling(job: JobRecord): boolean;
/**
 * Create human-readable progress message
 */
export declare function createProgressMessage(job: JobRecord): string;
/**
 * Validate job record structure
 */
export declare function validateJobRecord(job: Partial<JobRecord>): JobError[];
/**
 * Create file-safe job directory name
 */
export declare function getJobDirectoryName(job: JobRecord): string;
/**
 * Get file paths for job storage
 */
export declare function getJobFilePaths(baseDir: string, job: JobRecord): {
    jobDir: string;
    jobFile: string;
    metadataFile: string;
    resultDir: string;
    stdoutFile: string;
    stderrFile: string;
    logFile: string;
};
/**
 * Format time duration for human reading
 */
export declare function formatDuration(ms: number): string;
/**
 * Check if job results have expired
 */
export declare function isJobExpired(job: JobRecord): boolean;
/**
 * Calculate job priority for processing queue
 */
export declare function calculateJobPriority(job: JobRecord): number;
/**
 * Sanitize job data for logging
 */
export declare function sanitizeJobForLogging(job: JobRecord): Partial<JobRecord>;
//# sourceMappingURL=utils.d.ts.map