/**
 * Approval Bridge Service
 * 
 * Monitors async job queue for pending approvals and integrates them 
 * with the existing approval system
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { Logger } from '../logger.js';
import { JobRecord } from '../async/types.js';

export interface ApprovalBridgeConfig {
  asyncQueueBaseDir: string;
  approvalQueueBaseDir: string;
  monitoringInterval: number;
  enabled: boolean;
}

export interface BridgedJob {
  asyncJobId: string;
  approvalRequestId: string;
  command: string;
  args: string[];
  workingDirectory: string;
  userDescription?: string;
  bridgedAt: number;
  // Additional fields for ApprovalRequest compatibility
  timestamp: number;
  operationType?: string;
  estimatedDuration?: number;
  riskScore?: number;
  status: 'pending_approval' | 'approved' | 'rejected';
}

/**
 * Bridges async job queue with approval system
 * Monitors pending async jobs and creates approval requests automatically
 */
export class ApprovalBridge extends EventEmitter {
  private isRunning = false;
  private monitoringTimer?: NodeJS.Timeout;
  private bridgedJobs = new Map<string, BridgedJob>();
  
  constructor(
    private config: ApprovalBridgeConfig,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Start monitoring async job queue for pending approvals
   */
  async start(): Promise<void> {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.logger.info('ApprovalBridge', 'Starting approval bridge monitoring', 'start', {
      asyncQueueDir: this.config.asyncQueueBaseDir,
      approvalQueueDir: this.config.approvalQueueBaseDir,
      interval: this.config.monitoringInterval
    });

    this.isRunning = true;

    // Start monitoring loop
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.scanForPendingJobs();
      } catch (error) {
        this.logger.error('ApprovalBridge', 'Error in monitoring loop', 'scanForPendingJobs', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.config.monitoringInterval);

    // Initial scan
    await this.scanForPendingJobs();
    
    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('ApprovalBridge', 'Stopping approval bridge monitoring', 'stop');

    this.isRunning = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    this.bridgedJobs.clear();
    this.removeAllListeners();
    
    this.emit('stopped');
  }

  /**
   * 🔥 NEW: Trigger immediate scan for new pending jobs (called when new async job submitted)
   */
  async triggerImmediateScan(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.debug('ApprovalBridge', 'Triggering immediate scan for new pending jobs', 'triggerImmediateScan');
    
    try {
      await this.scanForPendingJobs();
    } catch (error) {
      this.logger.error('ApprovalBridge', 'Error in immediate scan', 'triggerImmediateScan', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get bridge status
   */
  getStatus(): {
    isRunning: boolean;
    bridgedJobCount: number;
    lastScanTime?: number;
    config: ApprovalBridgeConfig;
  } {
    return {
      isRunning: this.isRunning,
      bridgedJobCount: this.bridgedJobs.size,
      config: this.config
    };
  }

  /**
   * Get list of pending job IDs from bridged async jobs
   */
  getPendingJobs(): string[] {
    return Array.from(this.bridgedJobs.keys());
  }

  /**
   * Get bridged job info
   */
  getBridgedJob(asyncJobId: string): BridgedJob | undefined {
    return this.bridgedJobs.get(asyncJobId);
  }

  /**
   * Get all bridged jobs (for stats aggregation)
   */
  getAllBridgedJobs(): BridgedJob[] {
    return Array.from(this.bridgedJobs.values());
  }

  /**
   * Remove completed bridge (cleanup)
   */
  removeBridgedJob(asyncJobId: string): boolean {
    const removed = this.bridgedJobs.delete(asyncJobId);
    if (removed) {
      this.logger.debug('ApprovalBridge', 'Removed completed bridge', 'removeBridgedJob', {
        asyncJobId
      });
    }
    return removed;
  }

  /**
   * Main monitoring function - scans async queue for pending jobs
   */
  private async scanForPendingJobs(): Promise<void> {
    try {
      const pendingJobsDir = path.join(this.config.asyncQueueBaseDir, 'async-queue', 'jobs', 'pending_approval');
      
      // Check if directory exists
      try {
        await fs.access(pendingJobsDir);
      } catch {
        // Directory doesn't exist yet - nothing to scan
        return;
      }

      const jobDirs = await fs.readdir(pendingJobsDir);
      
      for (const jobDir of jobDirs) {
        const jobPath = path.join(pendingJobsDir, jobDir);
        const jobFilePath = path.join(jobPath, 'job.json');

        try {
          // Check if this job is already bridged
          if (this.bridgedJobs.has(jobDir)) {
            continue;
          }

          // Read job file
          const jobData = await fs.readFile(jobFilePath, 'utf8');
          const job: JobRecord = JSON.parse(jobData);

          // Validate job requires approval
          if (job.status !== 'pending_approval') {
            continue;
          }

          // Create approval request for this job
          await this.createApprovalRequest(job);

        } catch (error) {
          this.logger.warn('ApprovalBridge', 'Failed to process async job for approval', 'scanForPendingJobs', {
            jobDir,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

    } catch (error) {
      this.logger.error('ApprovalBridge', 'Failed to scan pending jobs directory', 'scanForPendingJobs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create approval request for async job (tracks in memory, doesn't write files)
   */
  private async createApprovalRequest(job: JobRecord): Promise<void> {
    try {
      // Generate approval request ID
      const approvalRequestId = `async_${job.id}_${Date.now()}`;
      
      // Calculate risk score (simple heuristic)
      let riskScore = 1;
      if (job.command === 'rm' || job.command === 'del') riskScore = 8;
      else if (job.command === 'npm' && job.args.includes('install')) riskScore = 3;
      else if (job.command === 'docker') riskScore = 5;

      // Track the bridge in memory (no file writes - let the manager handle UI)
      const bridgedJob: BridgedJob = {
        asyncJobId: job.id,
        approvalRequestId,
        command: job.command,
        args: job.args,
        workingDirectory: job.workingDirectory,
        userDescription: job.userDescription,
        bridgedAt: Date.now(),
        timestamp: job.submittedAt,
        operationType: job.operationType,
        estimatedDuration: job.estimatedDuration,
        riskScore,
        status: 'pending_approval'
      };

      this.bridgedJobs.set(job.id, bridgedJob);

      this.logger.info('ApprovalBridge', 'Created approval request for async job', 'createApprovalRequest', {
        asyncJobId: job.id,
        approvalRequestId,
        command: job.command,
        operationType: job.operationType,
        riskScore
      });

      this.emit('jobBridged', bridgedJob);

    } catch (error) {
      this.logger.error('ApprovalBridge', 'Failed to create approval request', 'createApprovalRequest', {
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle approval decision and update async job
   */
  async handleApprovalDecision(
    approvalRequestId: string, 
    decision: 'approve' | 'reject',
    decidedBy: string,
    reason?: string
  ): Promise<void> {
    try {
      // Find the bridged job
      let bridgedJob: BridgedJob | undefined;
      for (const [asyncJobId, job] of this.bridgedJobs) {
        if (job.approvalRequestId === approvalRequestId) {
          bridgedJob = job;
          break;
        }
      }

      if (!bridgedJob) {
        this.logger.warn('ApprovalBridge', 'Approval decision for unknown bridge', 'handleApprovalDecision', {
          approvalRequestId,
          decision
        });
        return;
      }

      this.logger.info('ApprovalBridge', 'Processing approval decision for async job', 'handleApprovalDecision', {
        asyncJobId: bridgedJob.asyncJobId,
        approvalRequestId,
        decision,
        decidedBy
      });

      // Update async job status based on decision
      if (decision === 'approve') {
        await this.updateAsyncJobStatus(bridgedJob.asyncJobId, 'approved', {
          approvedBy: decidedBy,
          approvedAt: Date.now(),
          approvalRequestId
        });
        // Update bridge status
        bridgedJob.status = 'approved';
      } else {
        await this.updateAsyncJobStatus(bridgedJob.asyncJobId, 'rejected', {
          rejectedBy: decidedBy,
          rejectedAt: Date.now(),
          rejectionReason: reason,
          approvalRequestId
        });
        // Update bridge status
        bridgedJob.status = 'rejected';
      }

      // Clean up bridge after a delay to allow stats to be read
      setTimeout(() => {
        this.removeBridgedJob(bridgedJob!.asyncJobId);
      }, 10000); // Keep for 10 seconds for stats

      this.emit('approvalProcessed', {
        asyncJobId: bridgedJob.asyncJobId,
        approvalRequestId: bridgedJob.approvalRequestId, // 🔥 FIX: Add this for UI updates
        decision,
        decidedBy,
        reason
      });

    } catch (error) {
      this.logger.error('ApprovalBridge', 'Failed to handle approval decision', 'handleApprovalDecision', {
        approvalRequestId,
        decision,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update async job status in the queue
   */
  private async updateAsyncJobStatus(
    asyncJobId: string, 
    newStatus: 'approved' | 'rejected',
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const currentJobPath = path.join(this.config.asyncQueueBaseDir, 'async-queue', 'jobs', 'pending_approval', asyncJobId);
      const newJobPath = path.join(this.config.asyncQueueBaseDir, 'async-queue', 'jobs', newStatus, asyncJobId);
      const jobFilePath = path.join(currentJobPath, 'job.json');

      // Read current job
      const jobData = await fs.readFile(jobFilePath, 'utf8');
      const job: JobRecord = JSON.parse(jobData);

      // Update job with new status and metadata
      const updatedJob: JobRecord = {
        ...job,
        status: newStatus,
        lastUpdated: Date.now(),
        ...metadata
      };

      // Create new status directory
      await fs.mkdir(path.dirname(newJobPath), { recursive: true });

      // Write updated job to new location
      await fs.mkdir(newJobPath, { recursive: true });
      await fs.writeFile(
        path.join(newJobPath, 'job.json'), 
        JSON.stringify(updatedJob, null, 2), 
        'utf8'
      );

      // Remove from old location
      await fs.rm(currentJobPath, { recursive: true, force: true });

      this.logger.info('ApprovalBridge', 'Updated async job status', 'updateAsyncJobStatus', {
        asyncJobId,
        oldStatus: 'pending_approval',
        newStatus,
        ...metadata
      });

    } catch (error) {
      this.logger.error('ApprovalBridge', 'Failed to update async job status', 'updateAsyncJobStatus', {
        asyncJobId,
        newStatus,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

/**
 * Default configuration for approval bridge
 */
export const DEFAULT_APPROVAL_BRIDGE_CONFIG: ApprovalBridgeConfig = {
  asyncQueueBaseDir: process.cwd(),
  approvalQueueBaseDir: process.cwd(),
  monitoringInterval: 5000, // 5 seconds
  enabled: true
};
