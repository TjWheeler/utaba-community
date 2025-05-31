import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { ApprovalQueue } from './queue.js';
import { ApprovalServer } from './server.js';
import { ApprovalBridge, ApprovalBridgeConfig, DEFAULT_APPROVAL_BRIDGE_CONFIG, BridgedJob } from './bridge.js';
import {
  ApprovalRequest,
  ApprovalDecision,
  ApprovalServerConfig,
  ApprovalError,
  ApprovalTimeoutError
} from './types.js';
import { Logger } from '../logger.js';

/**
 * Main approval manager that coordinates queue, server, and async bridge
 * 
 * Provides the high-level interface for command approval workflow
 */
export class ApprovalManager extends EventEmitter {
  private queue: ApprovalQueue;
  private server: ApprovalServer | null = null;
  private bridge: ApprovalBridge | null = null;
  private isInitialized = false;

  constructor(
    private baseDir: string,
    private logger: Logger,
    private bridgeConfig?: Partial<ApprovalBridgeConfig>
  ) {
    super();
    this.queue = new ApprovalQueue(baseDir, logger);
    
    // Initialize bridge if enabled
    if (bridgeConfig?.enabled !== false) {
      const fullBridgeConfig: ApprovalBridgeConfig = {
        ...DEFAULT_APPROVAL_BRIDGE_CONFIG,
        ...bridgeConfig,
        asyncQueueBaseDir: bridgeConfig?.asyncQueueBaseDir || baseDir,
        approvalQueueBaseDir: bridgeConfig?.approvalQueueBaseDir || baseDir
      };
      
      this.bridge = new ApprovalBridge(fullBridgeConfig, logger);
      
      // Set up bridge event handlers
      this.setupBridgeEventHandlers();
    }
  }

  /**
   * Initialize the approval system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.queue.initialize();
      
      // Start the approval bridge if enabled
      if (this.bridge) {
        await this.bridge.start();
        this.logger.info('ApprovalManager', 'Approval bridge started', 'initialize');
      }
      
      this.isInitialized = true;

      this.logger.info('ApprovalManager', 'Approval system initialized', 'initialize', {
        baseDir: this.baseDir,
        bridgeEnabled: this.bridge !== null
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to initialize approval system', 'initialize', {
        error: errorMsg
      });
      throw new ApprovalError(`Failed to initialize approval system: ${errorMsg}`, 'INIT_ERROR');
    }
  }

  /**
   * Request approval for a command and wait for decision
   */
  async requestApproval(
    command: string,
    args: string[],
    workingDirectory: string,
    timeout: number = 300000
  ): Promise<ApprovalDecision> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Extract package name for npx commands
      const packageName = command === 'npx' && args.length > 0 ? args[0] : undefined;

      // Create approval request
      const request = await this.queue.createRequest(
        command,
        args,
        workingDirectory,
        packageName,
        timeout
      );

      this.logger.info('ApprovalManager', 'Approval request created', 'requestApproval', {
        requestId: request.id,
        command,
        args,
        packageName,
        riskScore: request.riskScore
      });

      // Start approval server if not already running
      await this.ensureServerRunning();

      // Emit event for new request (for real-time UI updates)
      this.emit('requestCreated', {
        requestId: request.id,
        command,
        args,
        workingDirectory,
        riskScore: request.riskScore,
        timestamp: Date.now()
      });

      // Wait for decision
      const decision = await this.queue.waitForDecision(request.id, timeout);

      this.logger.info('ApprovalManager', 'Approval decision received', 'requestApproval', {
        requestId: request.id,
        decision: decision.decision,
        decidedBy: decision.decidedBy
      });

      // Emit event for decision (for real-time UI updates)
      this.emit('requestDecided', {
        requestId: request.id,
        decision: decision.decision,
        decidedBy: decision.decidedBy,
        timestamp: Date.now()
      });

      return decision;

    } catch (error) {
      if (error instanceof ApprovalTimeoutError) {
        this.logger.warn('ApprovalManager', 'Approval request timed out', 'requestApproval', {
          error: error.message,
          requestId: error.requestId
        });
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to process approval request', 'requestApproval', {
        error: errorMsg,
        command,
        args
      });
      throw new ApprovalError(`Approval request failed: ${errorMsg}`, 'REQUEST_ERROR');
    }
  }

  /**
   * Get pending approval requests (merges traditional queue + bridged async jobs)
   */
  async getPendingRequests(): Promise<ApprovalRequest[]> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Get traditional approval requests from queue
      const queueRequests = await this.queue.getPendingRequests();
      
      // Get bridged async jobs from bridge
      const bridgedRequests: ApprovalRequest[] = [];
      if (this.bridge) {
        const pendingJobIds = this.bridge.getPendingJobs();
        
        for (const jobId of pendingJobIds) {
          const bridgedJob = this.bridge.getBridgedJob(jobId);
          if (bridgedJob) {
            // Transform bridged job to ApprovalRequest format
            const approvalRequest: ApprovalRequest = {
              id: bridgedJob.approvalRequestId,
              command: bridgedJob.command,
              args: bridgedJob.args,
              workingDirectory: bridgedJob.workingDirectory,
              timestamp: new Date(bridgedJob.timestamp).toISOString(), // Convert to ISO string
              status: 'pending',
              riskScore: bridgedJob.riskScore || 2,
              riskFactors: [`Async job: ${bridgedJob.operationType || 'other'}`],
              requestedBy: 'async_bridge',
              timeout: 300000, // Default timeout
              createdAt: bridgedJob.timestamp,
              packageName: bridgedJob.command === 'npx' && bridgedJob.args.length > 0 ? bridgedJob.args[0] : undefined
            };
            
            bridgedRequests.push(approvalRequest);
          }
        }
      }
      
      // Merge both sources
      const allRequests = [...queueRequests, ...bridgedRequests];
      
      this.logger.debug('ApprovalManager', 'Retrieved pending requests', 'getPendingRequests', {
        queueRequests: queueRequests.length,
        bridgedRequests: bridgedRequests.length,
        totalRequests: allRequests.length
      });
      
      return allRequests;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to get pending requests', 'getPendingRequests', {
        error: errorMsg
      });
      throw new ApprovalError(`Failed to get pending requests: ${errorMsg}`, 'REQUEST_ERROR');
    }
  }

  /**
   * Get approval queue statistics (FIXED: Now combines traditional + bridged counts)
   */
  async getStats() {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Get traditional queue stats
      const queueStats = await this.queue.getStats();
      const bridgeStatus = this.bridge?.getStatus();

      // Count bridged async jobs by status
      let bridgedPending = 0;
      let bridgedApproved = 0;
      let bridgedRejected = 0;
      let bridgedTotal = 0;

      if (this.bridge) {
        const allBridgedJobs = this.bridge.getAllBridgedJobs();
        bridgedTotal = allBridgedJobs.length;
        
        for (const job of allBridgedJobs) {
          switch (job.status) {
            case 'pending_approval':
              bridgedPending++;
              break;
            case 'approved':
              bridgedApproved++;
              break;
            case 'rejected':
              bridgedRejected++;
              break;
          }
        }
      }

      // Combine stats from both sources
      const combinedStats = {
        pending: queueStats.pending + bridgedPending,
        approved: queueStats.approved + bridgedApproved,
        rejected: queueStats.rejected + bridgedRejected,
        total: queueStats.total + bridgedTotal,
        bridge: bridgeStatus || { isRunning: false, bridgedJobCount: 0 },
        // Include breakdown for debugging
        breakdown: {
          queue: {
            pending: queueStats.pending,
            approved: queueStats.approved,
            rejected: queueStats.rejected,
            total: queueStats.total
          },
          bridge: {
            pending: bridgedPending,
            approved: bridgedApproved,
            rejected: bridgedRejected,
            total: bridgedTotal
          }
        }
      };

      this.logger.debug('ApprovalManager', 'Retrieved combined stats', 'getStats', {
        combinedStats
      });

      return combinedStats;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to get stats', 'getStats', {
        error: errorMsg
      });
      throw new ApprovalError(`Failed to get stats: ${errorMsg}`, 'STATS_ERROR');
    }
  }

  /**
   * Manually approve a request (for CLI or other interfaces)
   */
  async approveRequest(requestId: string, decidedBy: string = 'manual'): Promise<void> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    // Handle bridge if this was a bridged request
    if (this.bridge && requestId.startsWith('async_')) {
      await this.bridge.handleApprovalDecision(requestId, 'approve', decidedBy);
    } else {
      await this.queue.approveRequest(requestId, decidedBy);
    }

    // Emit event for manual approval (for real-time UI updates)
    this.emit('requestDecided', {
      requestId,
      decision: 'approve',
      decidedBy,
      timestamp: Date.now()
    });
  }

  /**
   * Manually reject a request (for CLI or other interfaces)
   */
  async rejectRequest(requestId: string, decidedBy: string = 'manual', reason?: string): Promise<void> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    // Handle bridge if this was a bridged request
    if (this.bridge && requestId.startsWith('async_')) {
      await this.bridge.handleApprovalDecision(requestId, 'reject', decidedBy, reason);
    } else {
      await this.queue.rejectRequest(requestId, decidedBy);
    }

    // Emit event for manual rejection (for real-time UI updates)
    this.emit('requestDecided', {
      requestId,
      decision: 'reject',
      decidedBy,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Get server status
   */
  getServerStatus(): { isRunning: boolean; port?: number; url?: string } {
    if (!this.server) {
      return { isRunning: false };
    }

    const status = this.server.getStatus();
    return {
      isRunning: status.isRunning,
      port: status.port ?? undefined,
      url: status.isRunning && status.port && status.authToken 
        ? `http://localhost:${status.port}?token=${status.authToken}`
        : undefined
    };
  }

  /**
   * Get bridge status
   */
  getBridgeStatus() {
    return this.bridge?.getStatus() || { 
      isRunning: false, 
      bridgedJobCount: 0,
      config: { enabled: false }
    };
  }

  /**
   * 🔥 NEW: Trigger immediate scan for new async jobs requiring approval
   */
  async triggerAsyncJobScan(): Promise<void> {
    if (this.bridge) {
      await this.bridge.triggerImmediateScan();
      this.logger.debug('ApprovalManager', 'Triggered immediate async job scan', 'triggerAsyncJobScan');
    }
  }

  /**
   * Launch the approval center server (public method for MCP interface)
   */
  async launchApprovalCenter(forceRestart: boolean = false): Promise<{
    launched: boolean;
    url?: string;
    port?: number;
    alreadyRunning: boolean;
  }> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Get current server status
      const currentStatus = this.getServerStatus();
      
      // If force restart requested and server is running, stop it first
      if (forceRestart && currentStatus.isRunning && this.server) {
        this.logger.info('ApprovalManager', 'Force restarting approval server', 'launchApprovalCenter');
        await this.server.stop();
        this.server = null;
      }
      
      // Start server if not running
      if (!currentStatus.isRunning) {
        await this.ensureServerRunning();
      }
      
      // Get updated status
      const newStatus = this.getServerStatus();
      
      if (newStatus.isRunning && newStatus.url) {
        this.logger.info('ApprovalManager', 'Approval center launched successfully', 'launchApprovalCenter', {
          url: newStatus.url,
          port: newStatus.port,
          wasAlreadyRunning: currentStatus.isRunning && !forceRestart,
          bridgeActive: this.bridge?.getStatus().isRunning || false
        });

        return {
          launched: true,
          url: newStatus.url,
          port: newStatus.port,
          alreadyRunning: currentStatus.isRunning && !forceRestart
        };
      } else {
        throw new ApprovalError('Server started but no URL available', 'SERVER_NO_URL');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to launch approval center', 'launchApprovalCenter', {
        error: errorMsg,
        forceRestart
      });
      
      throw new ApprovalError(`Failed to launch approval center: ${errorMsg}`, 'LAUNCH_ERROR');
    }
  }

  /**
   * Clean up old approval records
   */
  async cleanup(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    return this.queue.cleanup(olderThanMs);
  }

  /**
   * Shutdown the approval system
   */
  async shutdown(): Promise<void> {
    this.logger.info('ApprovalManager', 'Shutting down approval system', 'shutdown');

    try {
      // Stop bridge first
      if (this.bridge) {
        await this.bridge.stop();
        this.bridge = null;
      }

      // Stop server
      if (this.server) {
        await this.server.stop();
        this.server = null;
      }

      // Stop queue
      if (this.isInitialized) {
        await this.queue.shutdown();
      }

      this.isInitialized = false;

      this.logger.info('ApprovalManager', 'Approval system shutdown complete', 'shutdown');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Error during shutdown', 'shutdown', {
        error: errorMsg
      });
      throw error;
    }
  }

  // Private helper methods

  private async ensureServerRunning(): Promise<void> {
    if (this.server && this.server.getStatus().isRunning) {
      return;
    }

    try {
      // Generate server configuration
      const serverConfig: ApprovalServerConfig = {
        port: 0, // Auto-assign port
        autoLaunch: true,
        timeout: 300000, // 5 minutes default
        authToken: this.generateSecureToken(),
        logLevel: 'info',
        riskThreshold: 8
      };

      // Pass manager (this) to server for event listening
      this.server = new ApprovalServer(this, serverConfig, this.logger);
      const { port, authToken, url } = await this.server.start();

      this.logger.info('ApprovalManager', 'Approval server started', 'ensureServerRunning', {
        port,
        url,
        authRequired: true
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to start approval server', 'ensureServerRunning', {
        error: errorMsg
      });
      throw new ApprovalError(`Failed to start approval server: ${errorMsg}`, 'SERVER_START_ERROR');
    }
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Set up event handlers for the approval bridge
   */
  private setupBridgeEventHandlers(): void {
    if (!this.bridge) return;

    this.bridge.on('jobBridged', (bridgedJob) => {
      this.logger.info('ApprovalManager', 'Async job bridged to approval system', 'bridgeEvent', {
        asyncJobId: bridgedJob.asyncJobId,
        approvalRequestId: bridgedJob.approvalRequestId,
        command: bridgedJob.command
      });

      // Emit event for new bridged request (for real-time UI updates)
      this.emit('requestCreated', {
        requestId: bridgedJob.approvalRequestId,
        command: bridgedJob.command,
        args: bridgedJob.args,
        workingDirectory: bridgedJob.workingDirectory,
        riskScore: bridgedJob.riskScore || 2,
        timestamp: bridgedJob.timestamp,
        source: 'async_bridge'
      });
    });

    // 🔥 THE KEY FIX: Handle approval processed events and notify UI immediately
    this.bridge.on('approvalProcessed', (result) => {
      this.logger.info('ApprovalManager', 'Bridge processed approval decision', 'bridgeEvent', {
        asyncJobId: result.asyncJobId,
        decision: result.decision,
        decidedBy: result.decidedBy
      });

      // 🔥 CRITICAL: Emit immediate UI update event to eliminate race condition
      this.emit('requestDecided', {
        requestId: result.approvalRequestId || result.asyncJobId,
        decision: result.decision,
        decidedBy: result.decidedBy,
        timestamp: Date.now(),
        source: 'async_bridge'
      });

      this.logger.debug('ApprovalManager', 'Emitted requestDecided event for UI refresh', 'bridgeEvent', {
        requestId: result.approvalRequestId || result.asyncJobId,
        decision: result.decision
      });
    });

    this.bridge.on('started', () => {
      this.logger.info('ApprovalManager', 'Approval bridge started monitoring', 'bridgeEvent');
    });

    this.bridge.on('stopped', () => {
      this.logger.info('ApprovalManager', 'Approval bridge stopped monitoring', 'bridgeEvent');
    });
  }
}

// Export everything from the approvals module
export * from './types.js';
export { ApprovalQueue } from './queue.js';
export { ApprovalServer } from './server.js';
export { ApprovalBridge } from './bridge.js';
