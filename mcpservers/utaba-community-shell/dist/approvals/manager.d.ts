import { EventEmitter } from 'events';
import { ApprovalBridgeConfig } from './bridge.js';
import { ApprovalRequest, ApprovalDecision } from './types.js';
import { Logger } from '../logger.js';
/**
 * Main approval manager that coordinates queue, server, and async bridge
 *
 * Provides the high-level interface for command approval workflow
 */
export declare class ApprovalManager extends EventEmitter {
    private baseDir;
    private logger;
    private bridgeConfig?;
    private queue;
    private server;
    private bridge;
    private isInitialized;
    constructor(baseDir: string, logger: Logger, bridgeConfig?: Partial<ApprovalBridgeConfig> | undefined);
    /**
     * Initialize the approval system
     */
    initialize(): Promise<void>;
    /**
     * Request approval for a command and wait for decision
     */
    requestApproval(command: string, args: string[], workingDirectory: string, timeout?: number): Promise<ApprovalDecision>;
    /**
     * Get pending approval requests (merges traditional queue + bridged async jobs)
     */
    getPendingRequests(): Promise<ApprovalRequest[]>;
    /**
     * Get approval queue statistics (FIXED: Now combines traditional + bridged counts)
     */
    getStats(): Promise<{
        pending: number;
        approved: number;
        rejected: number;
        total: number;
        bridge: {
            isRunning: boolean;
            bridgedJobCount: number;
            lastScanTime?: number;
            config: ApprovalBridgeConfig;
        } | {
            isRunning: false;
            bridgedJobCount: number;
        };
        breakdown: {
            queue: {
                pending: number;
                approved: number;
                rejected: number;
                total: number;
            };
            bridge: {
                pending: number;
                approved: number;
                rejected: number;
                total: number;
            };
        };
    }>;
    /**
     * Manually approve a request (for CLI or other interfaces)
     */
    approveRequest(requestId: string, decidedBy?: string): Promise<void>;
    /**
     * Manually reject a request (for CLI or other interfaces)
     */
    rejectRequest(requestId: string, decidedBy?: string, reason?: string): Promise<void>;
    /**
     * Get server status
     */
    getServerStatus(): {
        isRunning: boolean;
        port?: number;
        url?: string;
    };
    /**
     * Get bridge status
     */
    getBridgeStatus(): {
        isRunning: boolean;
        bridgedJobCount: number;
        lastScanTime?: number;
        config: ApprovalBridgeConfig;
    } | {
        isRunning: false;
        bridgedJobCount: number;
        config: {
            enabled: false;
        };
    };
    /**
     * 🔥 NEW: Trigger immediate scan for new async jobs requiring approval
     */
    triggerAsyncJobScan(): Promise<void>;
    /**
     * Launch the approval center server (public method for MCP interface)
     */
    launchApprovalCenter(forceRestart?: boolean): Promise<{
        launched: boolean;
        url?: string;
        port?: number;
        alreadyRunning: boolean;
    }>;
    /**
     * Clean up old approval records
     */
    cleanup(olderThanMs?: number): Promise<number>;
    /**
     * Shutdown the approval system
     */
    shutdown(): Promise<void>;
    private ensureServerRunning;
    private generateSecureToken;
    /**
     * Set up event handlers for the approval bridge
     */
    private setupBridgeEventHandlers;
}
export * from './types.js';
export { ApprovalQueue } from './queue.js';
export { ApprovalServer } from './server.js';
export { ApprovalBridge } from './bridge.js';
//# sourceMappingURL=manager.d.ts.map