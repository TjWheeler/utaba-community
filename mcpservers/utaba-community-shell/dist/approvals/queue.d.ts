import { EventEmitter } from 'events';
import { ApprovalRequest, ApprovalDecision, ApprovalQueueStats } from './types.js';
import { Logger } from '../logger.js';
/**
 * File-based approval queue manager
 *
 * Provides atomic operations for approval requests using file system
 * as the communication mechanism between MCP shell and browser UI.
 */
export declare class ApprovalQueue extends EventEmitter {
    private baseDir;
    private logger;
    private queueDir;
    private pendingDir;
    private approvedDir;
    private rejectedDir;
    private configDir;
    private manifestPath;
    private watchInterval;
    private isWatching;
    constructor(baseDir: string, logger: Logger);
    /**
     * Initialize the approval queue directory structure
     */
    initialize(): Promise<void>;
    /**
     * Create a new approval request
     */
    createRequest(command: string, args: string[], workingDirectory: string, packageName?: string, timeout?: number): Promise<ApprovalRequest>;
    /**
     * Wait for approval decision on a request
     */
    waitForDecision(requestId: string, timeoutMs?: number): Promise<ApprovalDecision>;
    /**
     * Approve a request
     */
    approveRequest(requestId: string, decidedBy?: string): Promise<void>;
    /**
     * Reject a request
     */
    rejectRequest(requestId: string, decidedBy?: string): Promise<void>;
    /**
     * Get a specific request
     */
    getRequest(requestId: string): Promise<ApprovalRequest | null>;
    /**
     * Get all pending requests
     */
    getPendingRequests(): Promise<ApprovalRequest[]>;
    /**
     * Get queue statistics
     */
    getStats(): Promise<ApprovalQueueStats>;
    /**
     * Clean up old completed requests
     */
    cleanup(olderThanMs?: number): Promise<number>;
    /**
     * Shutdown the approval queue
     */
    shutdown(): Promise<void>;
    private generateRequestId;
    private calculateRisk;
    private processDecision;
    private handleTimeout;
    private initializeManifest;
    private updateManifest;
    private startWatching;
    private stopWatching;
}
//# sourceMappingURL=queue.d.ts.map