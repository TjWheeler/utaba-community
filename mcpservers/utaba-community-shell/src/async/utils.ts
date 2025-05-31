/**
 * Async Job Queue Utilities
 * 
 * Core utility functions for job management, security, and file operations
 */

import crypto from 'crypto';
import path from 'path';
import { JobRecord, JobStatus, OperationType, JobError } from './types.js';

/**
 * Generate cryptographically secure job ID
 */
export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `job_${timestamp}_${random}`;
}

/**
 * Generate secure execution token for result retrieval
 */
export function generateExecutionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate conversation session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString('hex');
  return `session_${timestamp}_${random}`;
}

/**
 * Classify command into operation type for polling strategy
 */
export function classifyOperation(command: string, args: string[]): OperationType {
  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();
  
  // Package installation patterns
  if (command === 'npm' && ['install', 'ci', 'add'].some(cmd => args.includes(cmd))) {
    return 'package_install';
  }
  if (command === 'yarn' && ['install', 'add'].some(cmd => args.includes(cmd))) {
    return 'package_install';
  }
  if (command === 'npx' && args.some(arg => arg.includes('create-'))) {
    return 'code_generation';
  }
  
  // Build and compilation patterns
  if (command === 'npm' && ['run', 'build'].some(cmd => args.includes(cmd))) {
    return 'build_compile';
  }
  if (command === 'tsc' || command === 'webpack' || command === 'rollup') {
    return 'build_compile';
  }
  if (fullCommand.includes('build') && !fullCommand.includes('docker')) {
    return 'build_compile';
  }
  
  // Docker patterns
  if (command === 'docker' && args.includes('build')) {
    return 'docker_build';
  }
  
  // Testing patterns
  if (command === 'npm' && ['test', 'run test'].some(cmd => args.includes(cmd))) {
    return 'test_suite';
  }
  if (['jest', 'vitest', 'mocha', 'cypress'].includes(command)) {
    return 'test_suite';
  }
  if (command === 'npx' && ['jest', 'vitest', 'playwright'].some(tool => args.includes(tool))) {
    return 'test_suite';
  }
  
  // Deployment patterns
  if (fullCommand.includes('deploy') || fullCommand.includes('publish')) {
    return 'deployment';
  }
  
  // Database patterns
  if (fullCommand.includes('migrate') || fullCommand.includes('seed')) {
    return 'database';
  }
  
  return 'other';
}

/**
 * Estimate execution duration based on operation type and command
 */
export function estimateExecutionDuration(
  operationType: OperationType, 
  command: string, 
  args: string[]
): number {
  const fullCommand = `${command} ${args.join(' ')}`;
  
  switch (operationType) {
    case 'package_install':
      // npm install can vary widely
      if (fullCommand.includes('--global') || fullCommand.includes('-g')) {
        return 2 * 60 * 1000; // 2 minutes for global installs
      }
      if (args.length > 3) {
        return 5 * 60 * 1000; // 5 minutes for multiple packages
      }
      return 90 * 1000; // 90 seconds for typical install
      
    case 'code_generation':
      if (fullCommand.includes('create-react-app')) {
        return 3 * 60 * 1000; // 3 minutes for CRA
      }
      if (fullCommand.includes('create-next-app')) {
        return 2 * 60 * 1000; // 2 minutes for Next.js
      }
      return 90 * 1000; // 90 seconds for other generators
      
    case 'build_compile':
      if (fullCommand.includes('webpack') || fullCommand.includes('build:prod')) {
        return 5 * 60 * 1000; // 5 minutes for production builds
      }
      return 2 * 60 * 1000; // 2 minutes for development builds
      
    case 'docker_build':
      return 10 * 60 * 1000; // 10 minutes for Docker builds
      
    case 'test_suite':
      if (fullCommand.includes('e2e') || fullCommand.includes('cypress')) {
        return 10 * 60 * 1000; // 10 minutes for E2E tests
      }
      return 3 * 60 * 1000; // 3 minutes for unit tests
      
    case 'deployment':
      return 5 * 60 * 1000; // 5 minutes for deployments
      
    case 'database':
      return 2 * 60 * 1000; // 2 minutes for DB operations
      
    case 'other':
    default:
      return 60 * 1000; // 1 minute default
  }
}

/**
 * Calculate next polling interval based on job state and elapsed time
 */
export function calculatePollingInterval(job: JobRecord): number {
  const elapsed = Date.now() - job.submittedAt;
  const { status, operationType } = job;
  
  if (status === "pending_approval") {
    // Start frequent, then back off
    if (elapsed < 2 * 60 * 1000) return 10000;      // 10s for first 2 min
    if (elapsed < 5 * 60 * 1000) return 20000;      // 20s for next 3 min
    return 30000;                                    // 30s after that
  }
  
  if (status === "executing") {
    // Adjust based on operation type
    switch (operationType) {
      case 'package_install':
      case 'code_generation':
        if (elapsed < 2 * 60 * 1000) return 15000;   // 15s for first 2 min
        if (elapsed < 5 * 60 * 1000) return 30000;   // 30s for next 3 min
        return 60000;                                 // 1min after that
        
      case 'build_compile':
      case 'test_suite':
        if (elapsed < 5 * 60 * 1000) return 60000;   // 1min for first 5 min
        if (elapsed < 15 * 60 * 1000) return 120000; // 2min for next 10 min
        return 300000;                                // 5min after that
        
      case 'docker_build':
      case 'deployment':
        if (elapsed < 5 * 60 * 1000) return 120000;  // 2min for first 5 min
        if (elapsed < 30 * 60 * 1000) return 300000; // 5min for next 25 min
        return 600000;                                // 10min after that
        
      default:
        return 60000; // 1 minute default
    }
  }
  
  // For completed, failed, etc. - less frequent checking
  return 300000; // 5 minutes
}

/**
 * Determine if polling should continue based on job state and elapsed time
 */
export function shouldContinuePolling(job: JobRecord): boolean {
  const elapsed = Date.now() - job.submittedAt;
  const maxDurations = {
    pending_approval: 10 * 60 * 1000,    // 10 minutes
    approved: 5 * 60 * 1000,             // 5 minutes  
    executing: getMaxExecutionTime(job.operationType),
    completed: 0,                         // No need to poll
    rejected: 0,
    approval_timeout: 0,
    execution_timeout: 0,
    execution_failed: 0,
    cancelled: 0,
    expired: 0
  };
  
  const maxDuration = maxDurations[job.status];
  return elapsed < maxDuration;
}

/**
 * Get maximum execution time based on operation type
 */
function getMaxExecutionTime(operationType: OperationType): number {
  const maxTimes = {
    package_install: 30 * 60 * 1000,     // 30 minutes
    code_generation: 15 * 60 * 1000,     // 15 minutes
    build_compile: 60 * 60 * 1000,       // 1 hour
    docker_build: 4 * 60 * 60 * 1000,    // 4 hours
    test_suite: 30 * 60 * 60 * 1000,     // 30 minutes
    deployment: 60 * 60 * 1000,          // 1 hour
    database: 15 * 60 * 1000,            // 15 minutes
    other: 30 * 60 * 1000                // 30 minutes
  };
  
  return maxTimes[operationType];
}

/**
 * Create human-readable progress message
 */
export function createProgressMessage(job: JobRecord): string {
  const elapsed = Date.now() - job.submittedAt;
  const elapsedMin = Math.floor(elapsed / 60000);
  const elapsedSec = Math.floor((elapsed % 60000) / 1000);
  
  const timeStr = elapsedMin > 0 
    ? `${elapsedMin}m ${elapsedSec}s`
    : `${elapsedSec}s`;
  
  switch (job.status) {
    case 'pending_approval':
      return `Waiting for approval (${timeStr} elapsed)`;
      
    case 'approved':
      return `Approved, queued for execution (${timeStr} since submission)`;
      
    case 'executing':
      const estimated = job.estimatedDuration;
      if (estimated && elapsed < estimated) {
        const remaining = Math.ceil((estimated - elapsed) / 60000);
        return `Executing... (${timeStr} elapsed, ~${remaining}m remaining)`;
      }
      return `Executing... (${timeStr} elapsed)`;
      
    case 'completed':
      return `Completed successfully in ${timeStr}`;
      
    case 'rejected':
      return `Rejected by user after ${timeStr}`;
      
    case 'approval_timeout':
      return `Approval timed out after ${timeStr}`;
      
    case 'execution_timeout':
      return `Execution timed out after ${timeStr}`;
      
    case 'execution_failed':
      return `Execution failed after ${timeStr}`;
      
    case 'cancelled':
      return `Cancelled after ${timeStr}`;
      
    case 'expired':
      return `Results expired`;
      
    default:
      return `Status: ${job.status} (${timeStr} elapsed)`;
  }
}

/**
 * Validate job record structure
 */
export function validateJobRecord(job: Partial<JobRecord>): JobError[] {
  const errors: JobError[] = [];
  
  if (!job.id) {
    errors.push({
      code: 'INVALID_JOB_ID',
      message: 'Job ID is required',
      category: 'system',
      recoverable: false
    });
  }
  
  if (!job.command) {
    errors.push({
      code: 'INVALID_COMMAND',
      message: 'Command is required',
      category: 'user',
      recoverable: false
    });
  }
  
  if (!job.status) {
    errors.push({
      code: 'INVALID_STATUS',
      message: 'Job status is required',
      category: 'system',
      recoverable: false
    });
  }
  
  if (job.status && !['pending_approval', 'approved', 'executing', 'completed', 'rejected', 'approval_timeout', 'execution_timeout', 'execution_failed', 'cancelled', 'expired'].includes(job.status)) {
    errors.push({
      code: 'INVALID_STATUS_VALUE',
      message: `Invalid job status: ${job.status}`,
      category: 'system',
      recoverable: false
    });
  }
  
  return errors;
}

/**
 * Create file-safe job directory name
 */
export function getJobDirectoryName(job: JobRecord): string {
  const timestamp = new Date(job.submittedAt).toISOString().replace(/[:.]/g, '-');
  const safeCommand = job.command.replace(/[^a-zA-Z0-9]/g, '_');
  return `${job.id}_${timestamp}_${safeCommand}`;
}

/**
 * Get file paths for job storage
 */
export function getJobFilePaths(baseDir: string, job: JobRecord) {
  const jobDir = path.join(baseDir, 'jobs', job.status, job.id);
  const resultDir = path.join(baseDir, 'results', job.id);
  
  return {
    jobDir,
    jobFile: path.join(jobDir, 'job.json'),
    metadataFile: path.join(jobDir, 'metadata.json'),
    resultDir,
    stdoutFile: path.join(resultDir, 'stdout.txt'),
    stderrFile: path.join(resultDir, 'stderr.txt'),
    logFile: path.join(resultDir, 'execution.log')
  };
}

/**
 * Format time duration for human reading
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

/**
 * Check if job results have expired
 */
export function isJobExpired(job: JobRecord): boolean {
  if (!job.completedAt) return false;
  
  const age = Date.now() - job.completedAt;
  const EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 hours
  
  return age > EXPIRATION_TIME;
}

/**
 * Calculate job priority for processing queue
 */
export function calculateJobPriority(job: JobRecord): number {
  let priority = 100; // Base priority
  
  // Higher priority for user-interactive operations
  if (job.operationType === 'test_suite') priority += 20;
  if (job.operationType === 'build_compile') priority += 15;
  if (job.operationType === 'package_install') priority += 10;
  
  // Lower priority for long-running operations
  if (job.operationType === 'docker_build') priority -= 10;
  if (job.operationType === 'deployment') priority -= 5;
  
  // Age factor - older jobs get higher priority
  const ageBonus = Math.min(50, Math.floor((Date.now() - job.submittedAt) / 60000));
  priority += ageBonus;
  
  return priority;
}

/**
 * Sanitize job data for logging
 */
export function sanitizeJobForLogging(job: JobRecord): Partial<JobRecord> {
  const { executionToken, ...safeJob } = job;
  return {
    ...safeJob,
    executionToken: executionToken ? '[REDACTED]' : undefined
  };
}
