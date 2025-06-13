/**
 * Approval Server - Web UI for Command Approvals
 *
 * Provides a secure web interface for approving/rejecting command executions
 */
import { Logger } from '../logger.js';
import { ApprovalQueue } from './queue.js';
import { ApprovalServerConfig } from './types.js';
export declare class ApprovalServer {
    private approvalQueue;
    private config;
    private logger;
    private app;
    private server;
    private authToken;
    private isRunning;
    private port;
    constructor(approvalQueue: ApprovalQueue, config: ApprovalServerConfig, logger: Logger);
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
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandling;
    private generateApprovalUI;
    private generateAuthToken;
    private launchBrowser;
}
//# sourceMappingURL=server-original.d.ts.map