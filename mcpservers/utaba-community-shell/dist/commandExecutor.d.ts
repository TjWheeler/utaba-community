import { EventEmitter } from 'events';
import { Config } from './config.js';
import { Logger } from './logger.js';
import { JobStatusResponse, JobResultResponse, JobSummary } from './async/index.js';
export interface CommandRequest {
    command: string;
    args: string[];
    startDirectory: string;
    workingDirectory?: string;
    environment?: Record<string, string>;
    timeout?: number;
}
export interface CommandResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    executionTime: number;
    timedOut: boolean;
    killed: boolean;
    pid?: number;
}
export interface StreamingCommandResult extends CommandResult {
    isComplete: boolean;
}
export interface AsyncJobSubmission {
    jobId: string;
    status: string;
    submittedAt: number;
    estimatedApprovalTime?: number;
    approvalUrl?: string;
}
export declare class CommandExecutionError extends Error {
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    constructor(message: string, exitCode: number | null, stdout: string, stderr: string);
}
export declare class ApprovalRequiredError extends Error {
    readonly command: string;
    readonly args: string[];
    readonly workingDirectory: string;
    constructor(message: string, command: string, args: string[], workingDirectory: string);
}
/**
 * Command execution engine with security validation, approval workflow, and process management
 */
export declare class CommandExecutor extends EventEmitter {
    private config;
    private logger;
    private securityValidator;
    private approvalManager;
    private asyncJobQueue;
    private asyncJobProcessor;
    private activeProcesses;
    private processCounter;
    private currentSessionId;
    constructor(config: Config, logger: Logger);
    /**
     * Initialize the command executor (async initialization)
     */
    initialize(): Promise<void>;
    /**
     * Submit command for async execution - returns immediately with job ID
     */
    executeCommandAsync(request: CommandRequest, options?: {
        conversationId?: string;
        userDescription?: string;
    }): Promise<AsyncJobSubmission>;
    /**
     * Check status of async job
     */
    checkJobStatus(jobId: string): Promise<JobStatusResponse | null>;
    /**
     * Get job result with secure token validation
     */
    getJobResult(jobId: string, executionToken: string): Promise<JobResultResponse | null>;
    /**
     * List recent jobs with optional filtering
     */
    listJobs(options?: {
        limit?: number;
        conversationId?: string;
        status?: string;
    }): Promise<JobSummary[]>;
    /**
     * Check all jobs for current conversation
     */
    checkConversationJobs(conversationId?: string): Promise<{
        activeJobs: JobSummary[];
        recentlyCompleted: JobSummary[];
        pendingResults: JobSummary[];
    }>;
    /**
     * Execute a command with full validation and security checks (SYNC - existing method)
     */
    executeCommand(request: CommandRequest): Promise<CommandResult>;
    /**
     * Execute a command with streaming output (SYNC - existing method)
     */
    executeCommandStreaming(request: CommandRequest, onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void): Promise<CommandResult>;
    /**
     * Get approval manager status (for debugging/monitoring)
     */
    getApprovalStatus(): {
        enabled: boolean;
        serverRunning?: boolean;
        serverUrl?: string;
        pendingRequests?: number;
        bridgeStatus?: any;
    };
    /**
     * Launch the approval center and return access information
     */
    launchApprovalCenter(forceRestart?: boolean): Promise<{
        launched: boolean;
        url?: string;
        port?: number;
        alreadyRunning: boolean;
    }>;
    private hasCommandsRequiringApproval;
    private calculateNextPollInterval;
    private handleApprovalWorkflow;
    /**
     * Spawn a process and wait for completion
     */
    private spawnProcess;
    /**
     * Spawn a process with streaming output
     */
    private spawnProcessStreaming;
    /**
     * Kill a running process - accepts both internal process ID and actual PID
     */
    killProcess(identifier: string, signal?: NodeJS.Signals): boolean;
    /**
     * Kill all active processes
     */
    killAllProcesses(signal?: NodeJS.Signals): number;
    /**
     * Get status of active processes
     */
    getActiveProcesses(): Array<{
        id: string;
        pid?: number;
        command: string;
        startTime: number;
    }>;
    /**
     * Get execution statistics
     */
    getStats(): {
        activeProcesses: number;
        maxConcurrent: number;
        totalExecuted: number;
        approvalSystemEnabled: boolean;
    };
    /**
     * Graceful shutdown - kill all processes and cleanup
     */
    shutdown(graceful?: boolean): Promise<void>;
}
/**
 * Utility functions for command execution
 */
export declare class CommandUtils {
    /**
     * Parse command string into command and arguments
     */
    static parseCommandString(commandString: string): {
        command: string;
        args: string[];
    };
    /**
     * Escape shell argument (basic implementation)
     */
    static escapeShellArg(arg: string): string;
    /**
     * Check if command exists on the system
     */
    static commandExists(command: string): Promise<boolean>;
    /**
     * Format command result for display
     */
    static formatCommandResult(result: CommandResult): string;
}
//# sourceMappingURL=commandExecutor.d.ts.map