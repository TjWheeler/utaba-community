/**
 * Approval Server - Web UI for Command Approvals
 *
 * FIXED: Now uses ApprovalManager instead of ApprovalQueue directly
 * This ensures bridged async jobs are visible in the approval center
 */
import { Logger } from '../logger.js';
import { ApprovalManager } from './manager.js';
import { ApprovalServerConfig } from './types.js';
export declare class ApprovalServer {
    private approvalManager;
    private config;
    private logger;
    private app;
    private server;
    private authToken;
    private isRunning;
    private port;
    private connectedClients;
    constructor(approvalManager: ApprovalManager, // 🔥 CHANGED: Use manager instead of queue
    config: ApprovalServerConfig, logger: Logger);
    /**
     * Start the approval server
     */
    start(): Promise<{
        port: number;
        url: string;
        authToken: string;
    }>;
    /**
     * Stop the approval server
     */
    stop(): Promise<void>;
    /**
     * Get server status
     */
    getStatus(): {
        isRunning: boolean;
        port: number | null;
        url: string | null;
        authToken: string;
    };
    /**
     * 🔥 NEW: Set up event listeners for manager events to push real-time updates
     */
    private setupManagerEventListeners;
    /**
     * 🔥 NEW: Broadcast events to all connected SSE clients
     * 🔥 FIXED: Use actual newlines instead of escaped backslashes
     */
    private broadcastToClients;
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandling;
    private generateApprovalUI;
    private generateAuthToken;
    private launchBrowser;
}
//# sourceMappingURL=server.d.ts.map