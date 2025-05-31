/**
 * Async Job Queue Types and Interfaces
 * 
 * Comprehensive type system for asynchronous command execution with conversation context
 */

/**
 * Job Status Enum - Complete lifecycle of async jobs
 */
export type JobStatus = 
  | "pending_approval"    // Waiting for human decision in browser
  | "approved"           // Human approved, queued for execution
  | "executing"          // Command currently running
  | "completed"          // Execution finished, results available
  | "rejected"           // Human rejected the command
  | "approval_timeout"   // Approval decision timed out
  | "execution_timeout"  // Command execution timed out
  | "execution_failed"   // Command failed to execute
  | "cancelled"          // Job was manually cancelled
  | "expired";           // Job results expired (after 24h)

/**
 * Operation Type Classification for adaptive polling
 */
export type OperationType = 
  | "package_install"    // npm install, yarn add
  | "build_compile"      // npm run build, tsc
  | "docker_build"       // docker build
  | "test_suite"         // npm test, jest
  | "code_generation"    // npx create-react-app
  | "deployment"         // deploy scripts
  | "database"           // migrations, seeds
  | "other";             // fallback category

/**
 * Core Job Record - Complete job information
 */
export interface JobRecord {
  // Identity & Context
  id: string;                      // UUID v4
  conversationId?: string;         // Link to conversation context
  sessionId?: string;              // MCP session identifier
  
  // Request Details
  command: string;                 // Command being executed
  args: string[];                  // Command arguments
  workingDirectory: string;        // Execution context
  requestedTimeout: number;        // Original timeout request
  estimatedDuration?: number;      // Expected execution time (ms)
  operationType: OperationType;    // Classification for polling strategy
  userDescription?: string;        // What user was trying to accomplish
  
  // Timestamps (all Unix timestamps)
  submittedAt: number;             // When job was created
  lastUpdated: number;             // Last status change
  approvedAt?: number;             // When human approved
  startedAt?: number;              // When execution began
  completedAt?: number;            // When execution finished
  lastPolledAt?: number;           // When Claude last checked
  expiresAt?: number;              // When results expire
  
  // Status & Progress
  status: JobStatus;               // Current job state
  progressMessage?: string;        // Human-readable status
  progressPercentage?: number;     // 0-100 if determinable
  currentPhase?: string;           // "approval", "execution", "cleanup"
  
  // Security & Access
  executionToken?: string;         // Generated after completion (64-char hex)
  decidedBy?: string;              // Who approved/rejected
  approvalUrl?: string;            // Browser URL for pending approvals
  
  // Results Storage
  exitCode?: number;               // Process exit code
  executionTime?: number;          // Actual execution time (ms)
  timedOut?: boolean;              // Whether execution timed out
  killed?: boolean;                // Whether process was killed
  pid?: number;                    // Process ID during execution
  hasLargeOutput?: boolean;        // Whether output was stored in files
  resultPath?: string;             // Path to result files
  
  // Risk Assessment (from approval system)
  riskScore?: number;              // 1-10 risk assessment
  riskFactors?: string[];          // Specific risk indicators
  
  // Polling & Performance
  nextPollingInterval?: number;    // Dynamic polling adjustment (ms)
  maxPollingDuration?: number;     // When to stop auto-polling (ms)
  pollCount?: number;              // Number of times polled
  lastPollDuration?: number;       // Time taken for last status check
  
  // Error Handling
  error?: string;                  // Error message if failed
  errorCode?: string;              // Categorized error code
  retryCount?: number;             // Number of retry attempts
  canRetry?: boolean;              // Whether retry is possible
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
  executionToken?: string;        // Only present when completed
  error?: string;                 // Only present when failed
}

/**
 * Conversation Context - Track jobs within conversation sessions
 */
export interface ConversationContext {
  sessionId: string;               // Unique conversation identifier
  activeJobs: string[];           // Job IDs submitted in this chat
  lastJobCheck: number;           // When we last checked all jobs
  lastActivity: number;           // Last conversation activity
  userExpectations: UserExpectation[]; // What user is waiting for
  pausedPolling: string[];        // Jobs we stopped checking
  notificationsSent: string[];    // Jobs we already notified about
  preferences: ConversationPreferences; // User polling preferences
}

/**
 * User Expectation - What the user is waiting for
 */
export interface UserExpectation {
  jobId: string;
  description: string;            // "waiting for build to complete"
  estimatedCompletion?: number;   // Expected timestamp
  notifyOnCompletion: boolean;    // Should we announce when done
  priority: "high" | "medium" | "low"; // User attention priority
  lastMentioned?: number;         // When user last asked about it
}

/**
 * Conversation Preferences - User-specific polling behavior
 */
export interface ConversationPreferences {
  maxConcurrentJobs: number;      // How many async jobs at once
  defaultPollingStrategy: "aggressive" | "balanced" | "minimal";
  notificationStyle: "immediate" | "batched" | "manual";
  longRunningThreshold: number;   // When to switch to long-polling (ms)
  autoResumePolling: boolean;     // Resume polling in new conversations
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
  executionToken?: string;         // Only present when status = "completed"
  error?: string;                  // Only present when status indicates failure
  approvalUrl?: string;           // Browser URL for pending approvals
  canCancel?: boolean;            // Whether job can be cancelled
  canRetry?: boolean;             // Whether job can be retried
  nextPollRecommendation?: number; // Suggested next poll interval (ms)
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
  hasMoreOutput?: boolean;        // Whether output was truncated
  outputFiles?: string[];         // Paths to additional output files
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
  oldestActiveJob?: number;       // Age of oldest active job (ms)
  systemLoad: "low" | "medium" | "high";
  processingCapacity: number;     // Max concurrent jobs
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
  initialInterval: number;        // Starting poll interval (ms)
  maxInterval: number;           // Maximum poll interval (ms)
  backoffMultiplier: number;     // Interval increase factor
  maxDuration: number;           // Stop polling after this time (ms)
  conditions?: PollingCondition[]; // Special conditions
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
  code: string;                   // ERROR_APPROVAL_TIMEOUT, ERROR_EXECUTION_FAILED
  message: string;                // Human-readable description
  category: "approval" | "execution" | "system" | "user";
  recoverable: boolean;           // Whether retry is possible
  suggestedAction?: string;       // What user should do
  technicalDetails?: string;      // Additional debug info
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

// Type Guards for runtime validation
export function isJobStatus(value: string): value is JobStatus {
  const validStatuses: JobStatus[] = [
    "pending_approval", "approved", "executing", "completed", 
    "rejected", "approval_timeout", "execution_timeout", 
    "execution_failed", "cancelled", "expired"
  ];
  return validStatuses.includes(value as JobStatus);
}

export function isOperationType(value: string): value is OperationType {
  const validTypes: OperationType[] = [
    "package_install", "build_compile", "docker_build", 
    "test_suite", "code_generation", "deployment", 
    "database", "other"
  ];
  return validTypes.includes(value as OperationType);
}

// Utility type for partial job updates
export type JobUpdate = Partial<Pick<JobRecord, 
  | "status" 
  | "progressMessage" 
  | "progressPercentage" 
  | "currentPhase"
  | "lastUpdated"
  | "error"
  | "errorCode"
  | "nextPollingInterval"
>>;

// Constants for configuration
export const DEFAULT_POLLING_INTERVALS = {
  approval: {
    initial: 10000,      // 10 seconds
    max: 30000,          // 30 seconds
    backoff: 1.5
  },
  execution: {
    initial: 120000,     // 2 minutes
    max: 900000,         // 15 minutes
    backoff: 2.0
  }
} as const;

export const JOB_EXPIRATION = {
  results: 24 * 60 * 60 * 1000,    // 24 hours
  archive: 7 * 24 * 60 * 60 * 1000, // 7 days
  cleanup: 30 * 24 * 60 * 60 * 1000 // 30 days
} as const;

export const MAX_OUTPUT_SIZE = {
  inline: 10 * 1024,               // 10KB inline in job record
  file: 100 * 1024 * 1024          // 100MB in separate files
} as const;
