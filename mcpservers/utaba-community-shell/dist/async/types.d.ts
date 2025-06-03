/**
 * Async Job Queue Types and Interfaces
 *
 * Comprehensive type system for asynchronous command execution with conversation context
 */
/**
 * Job Status Enum - Complete lifecycle of async jobs
 */
export type JobStatus = "pending_approval" | "approved" | "executing" | "completed" | "rejected" | "approval_timeout" | "execution_timeout" | "execution_failed" | "cancelled" | "expired";
/**
 * Operation Type Classification for adaptive polling
 */
export type OperationType = "package_install" | "build_compile" | "docker_build" | "test_suite" | "code_generation" | "deployment" | "database" | "other";
/**
 * Core Job Record - Complete job information
 */
export interface JobRecord {
    id: string;
    conversationId?: string;
    sessionId?: string;
    command: string;
    args: string[];
    workingDirectory: string;
    requestedTimeout: number;
    estimatedDuration?: number;
    operationType: OperationType;
    userDescription?: string;
    submittedAt: number;
    lastUpdated: number;
    approvedAt?: number;
    startedAt?: number;
    completedAt?: number;
    lastPolledAt?: number;
    expiresAt?: number;
    status: JobStatus;
    progressMessage?: string;
    progressPercentage?: number;
    currentPhase?: string;
    executionToken?: string;
    decidedBy?: string;
    approvalUrl?: string;
    exitCode?: number;
    executionTime?: number;
    timedOut?: boolean;
    killed?: boolean;
    pid?: number;
    hasLargeOutput?: boolean;
    resultPath?: string;
    riskScore?: number;
    riskFactors?: string[];
    nextPollingInterval?: number;
    maxPollingDuration?: number;
    pollCount?: number;
    lastPollDuration?: number;
    error?: string;
    errorCode?: string;
    retryCount?: number;
    canRetry?: boolean;
}
/**
 * Job Summary - Lightweight version for listing and status checks
 */
export interface JobSummary {
    id: string;
    status: JobStatus;
    command: string;
    operationType: OperationType;
    submittedAt: number;
    lastUpdated: number;
    progressMessage?: string;
    progressPercentage?: number;
    estimatedTimeRemaining?: number;
    userDescription?: string;
    executionToken?: string;
    error?: string;
}
/**
 * Conversation Context - Track jobs within conversation sessions
 */
export interface ConversationContext {
    sessionId: string;
    activeJobs: string[];
    lastJobCheck: number;
    lastActivity: number;
    userExpectations: UserExpectation[];
    pausedPolling: string[];
    notificationsSent: string[];
    preferences: ConversationPreferences;
}
/**
 * User Expectation - What the user is waiting for
 */
export interface UserExpectation {
    jobId: string;
    description: string;
    estimatedCompletion?: number;
    notifyOnCompletion: boolean;
    priority: "high" | "medium" | "low";
    lastMentioned?: number;
}
/**
 * Conversation Preferences - User-specific polling behavior
 */
export interface ConversationPreferences {
    maxConcurrentJobs: number;
    defaultPollingStrategy: "aggressive" | "balanced" | "minimal";
    notificationStyle: "immediate" | "batched" | "manual";
    longRunningThreshold: number;
    autoResumePolling: boolean;
}
/**
 * Job Creation Request - Input for async job submission
 */
export interface JobSubmissionRequest {
    command: string;
    args: string[];
    workingDirectory?: string;
    timeout?: number;
    operationType?: OperationType;
    userDescription?: string;
    conversationId?: string;
    sessionId?: string;
    estimatedDuration?: number;
    requiresConfirmation?: boolean;
}
/**
 * Job Status Response - Output for status checks
 */
export interface JobStatusResponse {
    jobId: string;
    status: JobStatus;
    submittedAt: number;
    lastUpdated: number;
    timeElapsed: number;
    estimatedTimeRemaining?: number;
    progressMessage?: string;
    progressPercentage?: number;
    executionToken?: string;
    error?: string;
    approvalUrl?: string;
    canCancel?: boolean;
    canRetry?: boolean;
    nextPollRecommendation?: number;
}
/**
 * Job Result Response - Complete execution results
 */
export interface JobResultResponse {
    success: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    executionTime: number;
    timedOut: boolean;
    killed: boolean;
    pid?: number;
    completedAt: number;
    hasMoreOutput?: boolean;
    outputFiles?: string[];
}
/**
 * Job Queue Statistics - System-wide metrics
 */
export interface JobQueueStats {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    queuedJobs: number;
    averageExecutionTime: number;
    averageApprovalTime: number;
    oldestActiveJob?: number;
    systemLoad: "low" | "medium" | "high";
    processingCapacity: number;
}
/**
 * Polling Strategy Configuration
 */
export interface PollingStrategy {
    operationType: OperationType;
    phases: {
        approval: PollingPhase;
        execution: PollingPhase;
        completed: PollingPhase;
    };
}
/**
 * Polling Phase Configuration
 */
export interface PollingPhase {
    initialInterval: number;
    maxInterval: number;
    backoffMultiplier: number;
    maxDuration: number;
    conditions?: PollingCondition[];
}
/**
 * Polling Condition - Dynamic polling adjustments
 */
export interface PollingCondition {
    trigger: "time_elapsed" | "status_change" | "user_activity" | "system_load";
    threshold: number;
    action: "increase_interval" | "decrease_interval" | "pause_polling" | "resume_polling";
    value: number;
}
/**
 * Error Classification
 */
export interface JobError {
    code: string;
    message: string;
    category: "approval" | "execution" | "system" | "user";
    recoverable: boolean;
    suggestedAction?: string;
    technicalDetails?: string;
}
/**
 * Job Archive Record - Compressed historical data
 */
export interface JobArchive {
    id: string;
    status: JobStatus;
    command: string;
    submittedAt: number;
    completedAt?: number;
    executionTime?: number;
    exitCode?: number;
    error?: string;
    conversationId?: string;
    compressedAt: number;
}
/**
 * System Health Status
 */
export interface SystemHealth {
    queueProcessor: "healthy" | "degraded" | "failed";
    fileSystem: "healthy" | "degraded" | "failed";
    approvalServer: "healthy" | "degraded" | "failed";
    conversationManager: "healthy" | "degraded" | "failed";
    lastHealthCheck: number;
    issues: string[];
    recommendations: string[];
}
/**
 * Background Processor Configuration
 */
export interface ProcessorConfig {
    maxConcurrentJobs: number;
    processingInterval: number;
    shutdownTimeout: number;
    progressUpdateInterval: number;
    resultFileThreshold: number;
}
/**
 * Job Result Data - Internal execution tracking
 */
export interface JobResultData {
    stdout: string;
    stderr: string;
    startTime: number;
    endTime: number;
    exitCode: number | null;
    timedOut: boolean;
    killed: boolean;
    pid?: number;
}
export declare function isJobStatus(value: string): value is JobStatus;
export declare function isOperationType(value: string): value is OperationType;
export type JobUpdate = Partial<Pick<JobRecord, "status" | "progressMessage" | "progressPercentage" | "currentPhase" | "lastUpdated" | "error" | "errorCode" | "nextPollingInterval" | "startedAt" | "completedAt" | "exitCode" | "executionTime" | "timedOut" | "killed" | "pid" | "executionToken">>;
export declare const DEFAULT_POLLING_INTERVALS: {
    readonly approval: {
        readonly initial: 10000;
        readonly max: 30000;
        readonly backoff: 1.5;
    };
    readonly execution: {
        readonly initial: 120000;
        readonly max: 900000;
        readonly backoff: 2;
    };
};
export declare const JOB_EXPIRATION: {
    readonly results: number;
    readonly archive: number;
    readonly cleanup: number;
};
export declare const MAX_OUTPUT_SIZE: {
    readonly inline: number;
    readonly file: number;
};
export declare const DEFAULT_PROCESSOR_CONFIG: ProcessorConfig;
//# sourceMappingURL=types.d.ts.map