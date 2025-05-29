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
    private handleExecuteCommand;
    private handleExecuteCommandStreaming;
    private handleListAllowedCommands;
    private handleGetCommandStatus;
    private handleKillCommand;
    private handleGetLogs;
    run(): Promise<void>;
    private shutdown;
}
export { MCPShellServer };
//# sourceMappingURL=index.d.ts.map