/**
 * Approval Bridge Service
 *
 * Monitors async job queue for pending approvals and integrates them
 * with the existing approval system
 */
import { EventEmitter } from 'events';
import { Logger } from '../logger.js';
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
export declare class ApprovalBridge extends EventEmitter {
    private config;
    private logger;
    private isRunning;
    private monitoringTimer?;
    private bridgedJobs;
    constructor(config: ApprovalBridgeConfig, logger: Logger);
    /**
     * Start monitoring async job queue for pending approvals
     */
    start(): Promise<void>;
    /**
     * Stop monitoring
     */
    stop(): Promise<void>;
    /**
     * 🔥 NEW: Trigger immediate scan for new pending jobs (called when new async job submitted)
     */
    triggerImmediateScan(): Promise<void>;
    /**
     * Get bridge status
     */
    getStatus(): {
        isRunning: boolean;
        bridgedJobCount: number;
        lastScanTime?: number;
        config: ApprovalBridgeConfig;
    };
    /**
     * Get list of pending job IDs from bridged async jobs
     */
    getPendingJobs(): string[];
    /**
     * Get bridged job info
     */
    getBridgedJob(asyncJobId: string): BridgedJob | undefined;
    /**
     * Get all bridged jobs (for stats aggregation)
     */
    getAllBridgedJobs(): BridgedJob[];
    /**
     * Remove completed bridge (cleanup)
     */
    removeBridgedJob(asyncJobId: string): boolean;
    /**
     * Main monitoring function - scans async queue for pending jobs
     */
    private scanForPendingJobs;
    /**
     * Create approval request for async job (tracks in memory, doesn't write files)
     */
    private createApprovalRequest;
    /**
     * Handle approval decision and update async job
     */
    handleApprovalDecision(approvalRequestId: string, decision: 'approve' | 'reject', decidedBy: string, reason?: string): Promise<void>;
    /**
     * Update async job status in the queue
     */
    private updateAsyncJobStatus;
}
/**
 * Default configuration for approval bridge
 */
export declare const DEFAULT_APPROVAL_BRIDGE_CONFIG: ApprovalBridgeConfig;
//# sourceMappingURL=bridge.d.ts.map