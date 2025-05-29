#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, validateConfig, getEnvironmentOverrides, Config } from './config.js';
import { CommandExecutor, CommandRequest, CommandUtils } from './commandExecutor.js';
import { SecurityError } from './security.js';
import { Logger, LogLevel, PerformanceTimer, logger } from './logger.js';

// Define MCP tools
const TOOLS: Tool[] = [
  {
    name: 'execute_command',
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
    name: 'execute_command_streaming',
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
  {
    name: 'list_allowed_commands',
    description: 'List all whitelisted commands and their configurations',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_command_status',
    description: 'Get status of running commands and execution statistics',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'kill_command',
    description: 'Kill a running command by process ID',
    inputSchema: {
      type: 'object',
      properties: {
        processId: {
          type: 'string',
          description: 'Process ID to kill'
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
    name: 'get_logs',
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
  }
];

/**
 * MCP Shell Server - Controlled command execution for development workflows
 */
class MCPShellServer {
  private server: Server;
  private commandExecutor: CommandExecutor | null = null;
  private config: Config | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'utaba-mcp-shell',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.server.onerror = (error) => {
      logger.error('MCP-Server', 'Server error occurred', undefined, { 
        error: error.message 
      });
    };

    this.setupHandlers();
  }

  private setupHandlers() {
    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('MCP-Server', 'Tools list requested');
      return { tools: TOOLS };
    });

    // Handler for calling tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.commandExecutor || !this.config) {
        logger.error('MCP-Server', 'Server not properly initialized');
        throw new McpError(
          ErrorCode.InternalError,
          'Server not properly initialized'
        );
      }

      const { name, arguments: args } = request.params;
      const timer = new PerformanceTimer('MCP-Server', name);

      logger.info('MCP-Server', `Tool called: ${name}`, name, { args });

      try {
        let result;
        switch (name) {
          case 'execute_command':
            result = await this.handleExecuteCommand(args);
            break;

          case 'execute_command_streaming':
            result = await this.handleExecuteCommandStreaming(args);
            break;

          case 'list_allowed_commands':
            result = await this.handleListAllowedCommands();
            break;

          case 'get_command_status':
            result = await this.handleGetCommandStatus();
            break;

          case 'kill_command':
            result = await this.handleKillCommand(args);
            break;

          case 'get_logs':
            result = await this.handleGetLogs(args);
            break;

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }

        timer.end(true, { tool: name });
        logger.info('MCP-Server', `Tool completed successfully: ${name}`, name);
        return result;

      } catch (error) {
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

  // Tool handlers
  private async handleExecuteCommand(args: any) {
    const request: CommandRequest = {
      command: args.command,
      args: args.args || [],
      workingDirectory: args.workingDirectory,
      timeout: args.timeout
    };

    const result = await this.commandExecutor!.executeCommand(request);

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
        } as TextContent
      ]
    };
  }

  private async handleExecuteCommandStreaming(args: any) {
    const request: CommandRequest = {
      command: args.command,
      args: args.args || [],
      workingDirectory: args.workingDirectory,
      timeout: args.timeout
    };

    let streamOutput = '';
    
    const result = await this.commandExecutor!.executeCommandStreaming(
      request,
      (chunk: string, stream: 'stdout' | 'stderr') => {
        streamOutput += `[${stream.toUpperCase()}] ${chunk}`;
      }
    );

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
        } as TextContent
      ]
    };
  }

  private async handleListAllowedCommands() {
    const commands = this.config!.allowedCommands.map(cmd => ({
      command: cmd.command,
      description: cmd.description || 'No description',
      allowedArgs: cmd.allowedArgs,
      argPatterns: cmd.argPatterns,
      timeout: cmd.timeout || this.config!.defaultTimeout,
      workingDirRestriction: cmd.workingDirRestriction || 'project-only',
      requiresConfirmation: cmd.requiresConfirmation || false
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalCommands: commands.length,
            projectRoots: this.config!.projectRoots,
            trustedEnvironment: this.config!.trustedEnvironment,
            defaultTimeout: this.config!.defaultTimeout,
            maxConcurrentCommands: this.config!.maxConcurrentCommands,
            allowedCommands: commands,
            securityWarning: 'Commands execute with full system privileges in trusted environment'
          }, null, 2)
        } as TextContent
      ]
    };
  }

  private async handleGetCommandStatus() {
    const stats = this.commandExecutor!.getStats();
    const activeProcesses = this.commandExecutor!.getActiveProcesses();

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
            }))
          }, null, 2)
        } as TextContent
      ]
    };
  }

  private async handleKillCommand(args: any) {
    const processId = args.processId;
    const signal = args.signal || 'SIGTERM';

    const killed = this.commandExecutor!.killProcess(processId, signal as NodeJS.Signals);

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
        } as TextContent
      ]
    };
  }

  private async handleGetLogs(args: any) {
    const {
      level = 'INFO',
      component,
      operation,
      count = 20
    } = args;

    // Convert string level to LogLevel enum
    const logLevel = LogLevel[level as keyof typeof LogLevel];
    if (logLevel === undefined) {
      throw new McpError(ErrorCode.InvalidRequest, `Invalid log level: ${level}`);
    }

    const filters: any = { level: logLevel };
    if (component) filters.component = component;
    if (operation) filters.operation = operation;

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
        } as TextContent
      ]
    };
  }

  async run() {
    try {
      // Load and validate configuration
      const baseConfig = await loadConfig();
      const envOverrides = getEnvironmentOverrides();
      this.config = { ...baseConfig, ...envOverrides };

      await validateConfig(this.config);

      // Initialize logger (it will read LOG_LEVEL and other LOG_* env vars directly)
      await logger.initialize();

      // Log startup information
      logger.info('MCP-Shell', 'Starting Utaba MCP Shell Server v1.0.0');
      logger.info('MCP-Shell', `Project roots: ${this.config.projectRoots.join(', ')}`);
      logger.info('MCP-Shell', `Trusted environment: ${this.config.trustedEnvironment}`);
      logger.info('MCP-Shell', `Max concurrent commands: ${this.config.maxConcurrentCommands}`);
      logger.info('MCP-Shell', `Default timeout: ${this.config.defaultTimeout}ms`);
      logger.info('MCP-Shell', `Allowed commands: ${this.config.allowedCommands.length}`);

      // Security warning
      if (this.config.trustedEnvironment) {
        logger.warn('MCP-Shell', 'SECURITY WARNING: Running in trusted environment mode');
        logger.warn('MCP-Shell', 'Commands can execute with full system privileges');
        logger.warn('MCP-Shell', 'Use only in development environments you trust');
      }

      // Initialize command executor
      this.commandExecutor = new CommandExecutor(this.config, logger);

      // Set up graceful shutdown
      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));
      process.on('SIGHUP', this.shutdown.bind(this));

      // Start the server
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info('MCP-Shell', 'Server running on stdio transport');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('MCP-Shell', 'Failed to start server', undefined, { error: errorMessage });
      
      console.error('Failed to start MCP Shell Server:', errorMessage);
      console.error('Run "mcp-shell init" to create a configuration file');
      
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('MCP-Shell', 'Shutting down server gracefully');

    try {
      if (this.commandExecutor) {
        await this.commandExecutor.shutdown(true);
      }

      await logger.shutdown();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }

    process.exit(0);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPShellServer();
  server.run().catch((error) => {
    console.error('Server crashed:', error);
    process.exit(1);
  });
}

export { MCPShellServer };
