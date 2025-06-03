#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, getEnvironmentOverrides, startDirectory } from './config.js';
import { CommandExecutor } from './commandExecutor.js';
import { SecurityError } from './security.js';
import { LogLevel, PerformanceTimer, logger } from './logger.js';
// Define MCP tools (now includes async tools!)
const TOOLS = [
    {
        name: 'mcp_shell_execute_command',
        description: 'Execute a whitelisted development command in a trusted environment. WARNING: This provides system access through npm and other tools.',
        inputSchema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Command to execute (must be in whitelist)'
                },
                args: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Command arguments',
                    default: []
                },
                workingDirectory: {
                    type: 'string',
                    description: 'Working directory for command execution (defaults to current directory)'
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds (optional, uses command default)',
                    minimum: 1000,
                    maximum: 300000
                }
            },
            required: ['command']
        }
    },
    {
        name: 'mcp_shell_execute_command_streaming',
        description: 'Execute a command with real-time output streaming for long-running operations',
        inputSchema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Command to execute (must be in whitelist)'
                },
                args: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Command arguments',
                    default: []
                },
                workingDirectory: {
                    type: 'string',
                    description: 'Working directory for command execution'
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds',
                    minimum: 1000,
                    maximum: 300000
                }
            },
            required: ['command']
        }
    },
    // NEW ASYNC TOOLS
    {
        name: 'mcp_shell_execute_command_async',
        description: 'Submit command for async execution - returns immediately with job ID. No MCP timeout limits, supports long-running commands.',
        inputSchema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Command to execute (must be in whitelist)'
                },
                args: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Command arguments',
                    default: []
                },
                workingDirectory: {
                    type: 'string',
                    description: 'Working directory for command execution'
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds (optional, uses command default)',
                    minimum: 1000,
                    maximum: 14400000 // 4 hours max for async
                },
                conversationId: {
                    type: 'string',
                    description: 'Optional conversation ID for tracking jobs across sessions'
                },
                userDescription: {
                    type: 'string',
                    description: 'Optional description of what you\'re trying to accomplish'
                }
            },
            required: ['command']
        }
    },
    {
        name: 'mcp_shell_check_job_status',
        description: 'Check status and progress of an async job by job ID',
        inputSchema: {
            type: 'object',
            properties: {
                jobId: {
                    type: 'string',
                    description: 'Job ID returned from execute_command_async'
                }
            },
            required: ['jobId']
        }
    },
    {
        name: 'mcp_shell_get_job_result',
        description: 'Retrieve execution results for completed job using secure token',
        inputSchema: {
            type: 'object',
            properties: {
                jobId: {
                    type: 'string',
                    description: 'Job ID of completed job'
                },
                executionToken: {
                    type: 'string',
                    description: 'Execution token provided when job completed'
                }
            },
            required: ['jobId', 'executionToken']
        }
    },
    {
        name: 'mcp_shell_list_jobs',
        description: 'List recent async jobs with optional filtering',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of jobs to return',
                    default: 10,
                    minimum: 1,
                    maximum: 50
                },
                conversationId: {
                    type: 'string',
                    description: 'Filter by conversation ID'
                },
                status: {
                    type: 'string',
                    description: 'Filter by job status',
                    enum: ['pending_approval', 'approved', 'executing', 'completed', 'rejected', 'failed']
                }
            },
            required: []
        }
    },
    {
        name: 'mcp_shell_check_conversation_jobs',
        description: 'Check status of all jobs in current conversation session',
        inputSchema: {
            type: 'object',
            properties: {
                conversationId: {
                    type: 'string',
                    description: 'Optional conversation ID (uses current session if not provided)'
                },
                includeCompleted: {
                    type: 'boolean',
                    description: 'Include recently completed jobs',
                    default: true
                }
            },
            required: []
        }
    },
    // EXISTING TOOLS
    {
        name: 'mcp_shell_list_allowed_commands',
        description: 'List all whitelisted commands and their configurations',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'mcp_shell_get_command_status',
        description: 'Get status of running commands and execution statistics',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'mcp_shell_kill_command',
        description: 'Kill a running command by process ID. Accepts both system PID (e.g., "1234") and internal process ID (e.g., "proc_1") from mcp_shell_get_command_status.',
        inputSchema: {
            type: 'object',
            properties: {
                processId: {
                    type: 'string',
                    description: 'Process ID to kill - can be system PID (numeric) or internal process ID from get_command_status'
                },
                signal: {
                    type: 'string',
                    description: 'Signal to send (SIGTERM, SIGKILL, etc.)',
                    default: 'SIGTERM'
                }
            },
            required: ['processId']
        }
    },
    {
        name: 'mcp_shell_get_logs',
        description: 'Retrieve recent log entries for debugging and monitoring',
        inputSchema: {
            type: 'object',
            properties: {
                level: {
                    type: 'string',
                    description: 'Minimum log level (DEBUG, INFO, WARN, ERROR)',
                    enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
                    default: 'INFO'
                },
                component: {
                    type: 'string',
                    description: 'Filter by component name'
                },
                operation: {
                    type: 'string',
                    description: 'Filter by operation name'
                },
                count: {
                    type: 'number',
                    description: 'Number of recent entries to return',
                    default: 20,
                    minimum: 1,
                    maximum: 100
                }
            },
            required: []
        }
    },
    {
        name: 'mcp_shell_get_approval_status',
        description: 'Get status of the approval system for commands requiring confirmation',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'mcp_shell_launch_approval_center',
        description: 'Launch the approval center in the browser for command confirmations. Returns the URL if successful.',
        inputSchema: {
            type: 'object',
            properties: {
                forceRestart: {
                    type: 'boolean',
                    description: 'Force restart the approval server even if already running',
                    default: false
                }
            },
            required: []
        }
    }
];
/**
 * MCP Shell Server - Controlled command execution for development workflows
 */
class MCPShellServer {
    server;
    commandExecutor = null;
    config = null;
    constructor() {
        this.server = new Server({
            name: 'utaba-mcp-shell',
            version: '1.3.0' // Bumped for async support
        }, {
            capabilities: {
                tools: {}
            }
        });
        this.server.onerror = (error) => {
            logger.error('MCP-Server', 'Server error occurred', undefined, {
                error: error.message
            });
        };
        this.setupHandlers();
    }
    setupHandlers() {
        // Handler for listing available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            logger.debug('MCP-Server', 'Tools list requested');
            return { tools: TOOLS };
        });
        // Handler for calling tools
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!this.commandExecutor || !this.config) {
                logger.error('MCP-Server', 'Server not properly initialized');
                throw new McpError(ErrorCode.InternalError, 'Server not properly initialized');
            }
            const { name, arguments: args } = request.params;
            const timer = new PerformanceTimer('MCP-Server', name);
            logger.info('MCP-Server', `Tool called: ${name}`, name, { args });
            try {
                let result;
                switch (name) {
                    // SYNC COMMANDS
                    case 'mcp_shell_execute_command':
                        result = await this.handleExecuteCommand(args);
                        break;
                    case 'mcp_shell_execute_command_streaming':
                        result = await this.handleExecuteCommandStreaming(args);
                        break;
                    // ASYNC COMMANDS
                    case 'mcp_shell_execute_command_async':
                        result = await this.handleExecuteCommandAsync(args);
                        break;
                    case 'mcp_shell_check_job_status':
                        result = await this.handleCheckJobStatus(args);
                        break;
                    case 'mcp_shell_get_job_result':
                        result = await this.handleGetJobResult(args);
                        break;
                    case 'mcp_shell_list_jobs':
                        result = await this.handleListJobs(args);
                        break;
                    case 'mcp_shell_check_conversation_jobs':
                        result = await this.handleCheckConversationJobs(args);
                        break;
                    // UTILITY COMMANDS
                    case 'mcp_shell_list_allowed_commands':
                        result = await this.handleListAllowedCommands();
                        break;
                    case 'mcp_shell_get_command_status':
                        result = await this.handleGetCommandStatus();
                        break;
                    case 'mcp_shell_kill_command':
                        result = await this.handleKillCommand(args);
                        break;
                    case 'mcp_shell_get_logs':
                        result = await this.handleGetLogs(args);
                        break;
                    case 'mcp_shell_get_approval_status':
                        result = await this.handleGetApprovalStatus();
                        break;
                    case 'mcp_shell_launch_approval_center':
                        result = await this.handleLaunchApprovalCenter(args);
                        break;
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
                timer.end(true, { tool: name });
                logger.info('MCP-Server', `Tool completed successfully: ${name}`, name);
                return result;
            }
            catch (error) {
                timer.end(false, { tool: name, error: error instanceof Error ? error.message : 'Unknown error' });
                if (error instanceof SecurityError) {
                    const commandStr = args?.command ?
                        `${args.command} ${Array.isArray(args.args) ? args.args.join(' ') : ''}`.trim() :
                        'unknown command';
                    logger.logSecurity('MCP-Server', name, commandStr, true, error.reason);
                    throw new McpError(ErrorCode.InvalidRequest, error.message);
                }
                if (error instanceof Error) {
                    logger.error('MCP-Server', `Tool failed: ${name}`, name, { error: error.message, args });
                    throw new McpError(ErrorCode.InternalError, error.message);
                }
                logger.error('MCP-Server', `Tool failed with unknown error: ${name}`, name, { error, args });
                throw error;
            }
        });
    }
    // ASYNC TOOL HANDLERS
    async handleExecuteCommandAsync(args) {
        const request = {
            command: args.command,
            args: args.args || [],
            workingDirectory: args.workingDirectory,
            timeout: args.timeout,
            startDirectory: this.config?.startDirectory || process.cwd()
        };
        const options = {
            conversationId: args.conversationId,
            userDescription: args.userDescription
        };
        const result = await this.commandExecutor.executeCommandAsync(request, options);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        jobId: result.jobId,
                        status: result.status,
                        submittedAt: result.submittedAt,
                        estimatedApprovalTime: result.estimatedApprovalTime,
                        approvalUrl: result.approvalUrl,
                        message: result.status === 'pending_approval'
                            ? `Job submitted for approval. Use approval center: ${result.approvalUrl}`
                            : `Job submitted successfully with ID: ${result.jobId}`,
                        nextAction: result.status === 'pending_approval'
                            ? 'Approve the command in the browser, then check job status'
                            : 'Check job status periodically with mcp_shell_check_job_status'
                    }, null, 2)
                }
            ]
        };
    }
    async handleCheckJobStatus(args) {
        const { jobId } = args;
        if (!jobId) {
            throw new McpError(ErrorCode.InvalidRequest, 'Job ID is required');
        }
        const result = await this.commandExecutor.checkJobStatus(jobId);
        if (!result) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: 'Job not found',
                            jobId
                        }, null, 2)
                    }
                ]
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        ...result,
                        message: result.progressMessage,
                        timeElapsedFormatted: this.formatDuration(result.timeElapsed),
                        estimatedTimeRemainingFormatted: result.estimatedTimeRemaining
                            ? this.formatDuration(result.estimatedTimeRemaining)
                            : undefined
                    }, null, 2)
                }
            ]
        };
    }
    async handleGetJobResult(args) {
        const { jobId, executionToken } = args;
        if (!jobId || !executionToken) {
            throw new McpError(ErrorCode.InvalidRequest, 'Job ID and execution token are required');
        }
        const result = await this.commandExecutor.getJobResult(jobId, executionToken);
        if (!result) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: 'Job not found or results not available',
                            jobId
                        }, null, 2)
                    }
                ]
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        jobId,
                        ...result,
                        executionTimeFormatted: this.formatDuration(result.executionTime)
                    }, null, 2)
                }
            ]
        };
    }
    async handleListJobs(args) {
        const options = {
            limit: args.limit,
            conversationId: args.conversationId,
            status: args.status
        };
        const jobs = await this.commandExecutor.listJobs(options);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        totalJobs: jobs.length,
                        jobs: jobs.map(job => ({
                            ...job,
                            timeElapsedFormatted: this.formatDuration(Date.now() - job.submittedAt),
                            estimatedTimeRemainingFormatted: job.estimatedTimeRemaining
                                ? this.formatDuration(job.estimatedTimeRemaining)
                                : undefined
                        }))
                    }, null, 2)
                }
            ]
        };
    }
    async handleCheckConversationJobs(args) {
        const options = {
            conversationId: args.conversationId
        };
        const result = await this.commandExecutor.checkConversationJobs(options.conversationId);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        summary: {
                            activeJobs: result.activeJobs.length,
                            recentlyCompleted: result.recentlyCompleted.length,
                            pendingResults: result.pendingResults.length
                        },
                        activeJobs: result.activeJobs,
                        recentlyCompleted: result.recentlyCompleted,
                        pendingResults: result.pendingResults.map(job => ({
                            ...job,
                            hasExecutionToken: !!job.executionToken
                        }))
                    }, null, 2)
                }
            ]
        };
    }
    // EXISTING TOOL HANDLERS
    async handleExecuteCommand(args) {
        const request = {
            command: args.command,
            args: args.args || [],
            workingDirectory: args.workingDirectory,
            timeout: args.timeout,
            startDirectory: this.config?.startDirectory || process.cwd()
        };
        const result = await this.commandExecutor.executeCommand(request);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: result.exitCode === 0,
                        exitCode: result.exitCode,
                        executionTime: result.executionTime,
                        timedOut: result.timedOut,
                        killed: result.killed,
                        pid: result.pid,
                        stdout: result.stdout,
                        stderr: result.stderr
                    }, null, 2)
                }
            ]
        };
    }
    async handleExecuteCommandStreaming(args) {
        const request = {
            command: args.command,
            args: args.args || [],
            workingDirectory: args.workingDirectory,
            timeout: args.timeout,
            startDirectory: this.config?.startDirectory || process.cwd()
        };
        let streamOutput = '';
        const result = await this.commandExecutor.executeCommandStreaming(request, (chunk, stream) => {
            streamOutput += `[${stream.toUpperCase()}] ${chunk}`;
        });
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: result.exitCode === 0,
                        exitCode: result.exitCode,
                        executionTime: result.executionTime,
                        timedOut: result.timedOut,
                        killed: result.killed,
                        pid: result.pid,
                        streamedOutput: streamOutput,
                        finalStdout: result.stdout,
                        finalStderr: result.stderr
                    }, null, 2)
                }
            ]
        };
    }
    async handleListAllowedCommands() {
        const commands = this.config.allowedCommands.map(cmd => ({
            command: cmd.command,
            description: cmd.description || 'No description',
            allowedArgs: cmd.allowedArgs,
            argPatterns: cmd.argPatterns,
            timeout: cmd.timeout || this.config.defaultTimeout,
            workingDirRestriction: cmd.workingDirRestriction || 'project-only',
            requiresConfirmation: cmd.requiresConfirmation || false
        }));
        const approvalStatus = this.commandExecutor.getApprovalStatus();
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        totalCommands: commands.length,
                        projectRoots: this.config.projectRoots,
                        trustedEnvironment: this.config.trustedEnvironment,
                        defaultTimeout: this.config.defaultTimeout,
                        maxConcurrentCommands: this.config.maxConcurrentCommands,
                        allowedCommands: commands,
                        approvalSystem: approvalStatus,
                        asyncSupport: {
                            enabled: true,
                            maxAsyncTimeout: 14400000, // 4 hours
                            queueDirectory: 'async-queue'
                        },
                        securityWarning: 'Commands execute with full system privileges in trusted environment'
                    }, null, 2)
                }
            ]
        };
    }
    async handleGetCommandStatus() {
        const stats = this.commandExecutor.getStats();
        const activeProcesses = this.commandExecutor.getActiveProcesses();
        const approvalStatus = this.commandExecutor.getApprovalStatus();
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        statistics: stats,
                        activeProcesses: activeProcesses.map(proc => ({
                            id: proc.id,
                            pid: proc.pid,
                            command: proc.command,
                            startTime: proc.startTime,
                            runningFor: Date.now() - proc.startTime
                        })),
                        approvalSystem: approvalStatus,
                        asyncJobQueue: {
                            enabled: true,
                            version: '1.3.0'
                        }
                    }, null, 2)
                }
            ]
        };
    }
    async handleGetApprovalStatus() {
        const approvalStatus = this.commandExecutor.getApprovalStatus();
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        approvalSystem: approvalStatus,
                        message: approvalStatus.enabled
                            ? 'Approval system is active for commands requiring confirmation'
                            : 'No commands require approval confirmation'
                    }, null, 2)
                }
            ]
        };
    }
    async handleLaunchApprovalCenter(args) {
        if (!this.commandExecutor) {
            throw new McpError(ErrorCode.InternalError, 'Command executor not initialized');
        }
        const forceRestart = args?.forceRestart || false;
        try {
            const result = await this.commandExecutor.launchApprovalCenter(forceRestart);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            launched: result.launched,
                            url: result.url,
                            port: result.port,
                            alreadyRunning: result.alreadyRunning,
                            message: result.launched
                                ? `Approval center launched successfully at ${result.url}`
                                : result.alreadyRunning
                                    ? `Approval center already running at ${result.url}`
                                    : 'Approval system not available - no commands require approval'
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: errorMessage,
                            message: 'Failed to launch approval center'
                        }, null, 2)
                    }
                ]
            };
        }
    }
    async handleKillCommand(args) {
        const processId = args.processId;
        const signal = args.signal || 'SIGTERM';
        const killed = this.commandExecutor.killProcess(processId, signal);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: killed,
                        processId,
                        signal,
                        message: killed ? 'Process killed successfully' : 'Process not found or could not be killed'
                    }, null, 2)
                }
            ]
        };
    }
    async handleGetLogs(args) {
        const { level = 'INFO', component, operation, count = 20 } = args;
        // Convert string level to LogLevel enum
        const logLevel = LogLevel[level];
        if (logLevel === undefined) {
            throw new McpError(ErrorCode.InvalidRequest, `Invalid log level: ${level}`);
        }
        const filters = { level: logLevel };
        if (component)
            filters.component = component;
        if (operation)
            filters.operation = operation;
        const logs = logger.getFilteredLogs(filters).slice(-count);
        const loggerConfig = logger.getConfig();
        // Create simple stats from what we have
        const logStats = {
            totalLogEntries: logs.length,
            isFileLoggingEnabled: !!loggerConfig.logFile,
            logFilePath: loggerConfig.logFile,
            logLevel: loggerConfig.level !== undefined ? LogLevel[loggerConfig.level] : 'INFO',
            rotationStrategy: loggerConfig.rotationStrategy,
            maxSizeMB: loggerConfig.maxSizeMB
        };
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        summary: {
                            totalEntries: logs.length,
                            requestedLevel: level,
                            filters: { level, component, operation },
                            stats: logStats
                        },
                        logs: logs.map(entry => ({
                            timestamp: entry.timestamp,
                            level: LogLevel[entry.level],
                            component: entry.component,
                            operation: entry.operation,
                            message: entry.message,
                            metadata: entry.metadata,
                            performance: entry.performance,
                            security: entry.security
                        }))
                    }, null, 2)
                }
            ]
        };
    }
    // UTILITY METHODS
    formatDuration(ms) {
        if (ms < 1000)
            return `${ms}ms`;
        if (ms < 60000)
            return `${Math.round(ms / 1000)}s`;
        if (ms < 3600000)
            return `${Math.round(ms / 60000)}m`;
        return `${Math.round(ms / 3600000)}h`;
    }
    async run() {
        try {
            // Load and validate configuration
            const baseConfig = await loadConfig();
            const envOverrides = getEnvironmentOverrides();
            this.config = { ...baseConfig, ...envOverrides };
            this.config.startDirectory = await startDirectory();
            this.config.projectRoots = this.config.projectRoots.concat([this.config.startDirectory]);
            // Initialize logger (it will read LOG_LEVEL and other LOG_* env vars directly)
            await logger.initialize();
            // Log startup information
            logger.info('MCP-Shell', 'Starting Utaba MCP Shell Server v1.3.0 with Async Job Queue');
            logger.info('MCP-Shell', `Project roots: ${this.config.projectRoots.join(', ')}`);
            logger.info('MCP-Shell', `Trusted environment: ${this.config.trustedEnvironment}`);
            logger.info('MCP-Shell', `Max concurrent commands: ${this.config.maxConcurrentCommands}`);
            logger.info('MCP-Shell', `Default timeout: ${this.config.defaultTimeout}ms`);
            logger.info('MCP-Shell', `Allowed commands: ${this.config.allowedCommands.length}`);
            // Log approval system status
            const commandsRequiringApproval = this.config.allowedCommands.filter(cmd => cmd.requiresConfirmation);
            if (commandsRequiringApproval.length > 0) {
                logger.info('MCP-Shell', `Commands requiring approval: ${commandsRequiringApproval.map(cmd => cmd.command).join(', ')}`);
                logger.info('MCP-Shell', 'Approval system will be initialized for browser-based confirmations');
            }
            else {
                logger.info('MCP-Shell', 'No commands require approval - approval system disabled');
            }
            // Log async job queue info
            logger.info('MCP-Shell', 'Async job queue system enabled - supports long-running commands');
            // Security warning
            if (this.config.trustedEnvironment) {
                logger.warn('MCP-Shell', 'SECURITY WARNING: Running in trusted environment mode');
                logger.warn('MCP-Shell', 'Commands can execute with full system privileges');
                logger.warn('MCP-Shell', 'Use only in development environments you trust');
            }
            // Initialize command executor
            this.commandExecutor = new CommandExecutor(this.config, logger);
            // Initialize the command executor (this will set up approval system and async queue)
            await this.commandExecutor.initialize();
            // Set up graceful shutdown
            process.on('SIGTERM', this.shutdown.bind(this));
            process.on('SIGINT', this.shutdown.bind(this));
            process.on('SIGHUP', this.shutdown.bind(this));
            // Start the server
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            logger.info('MCP-Shell', 'Server running on stdio transport with async job queue support');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('MCP-Shell', 'Failed to start server', undefined, { error: errorMessage });
            console.error('Failed to start MCP Shell Server:', errorMessage);
            process.exit(1);
        }
    }
    async shutdown() {
        logger.info('MCP-Shell', 'Shutting down server gracefully');
        try {
            if (this.commandExecutor) {
                await this.commandExecutor.shutdown(true);
            }
            await logger.shutdown();
        }
        catch (error) {
            console.error('Error during shutdown:', error);
        }
        process.exit(0);
    }
}
const server = new MCPShellServer();
server.run().catch((error) => {
    console.error('Server crashed:', error);
    process.exit(1);
});
export { MCPShellServer };
//# sourceMappingURL=index.js.map