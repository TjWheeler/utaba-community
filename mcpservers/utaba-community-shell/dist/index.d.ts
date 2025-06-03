#!/usr/bin/env node
/**
 * MCP Shell Server - Controlled command execution for development workflows
 */
declare class MCPShellServer {
    private server;
    private commandExecutor;
    private config;
    constructor();
    private setupHandlers;
    private handleExecuteCommandAsync;
    private handleCheckJobStatus;
    private handleGetJobResult;
    private handleListJobs;
    private handleCheckConversationJobs;
    private handleExecuteCommand;
    private handleExecuteCommandStreaming;
    private handleListAllowedCommands;
    private handleGetCommandStatus;
    private handleGetApprovalStatus;
    private handleLaunchApprovalCenter;
    private handleKillCommand;
    private handleGetLogs;
    private formatDuration;
    run(): Promise<void>;
    private shutdown;
}
export { MCPShellServer };
//# sourceMappingURL=index.d.ts.map