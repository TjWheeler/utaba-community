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
import { loadConfig, validateConfig, SandboxConfig, DEFAULT_LIMITS } from './config.js';
import { QuotaManager } from './quota.js';
import { FileOperations } from './fileOperations.js';
import { SecurityError } from './security.js';
import { QuotaError } from './quota.js';
import { logger, LogLevel, PerformanceTimer } from './logger.js';

// Define our tools metadata - now with MCP standard namespaced names
const TOOLS: Tool[] = [
  {
    name: 'mcp_sandboxfs_get_quota_status',
    description: 'Get current quota usage, available space, and configured operation limits',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'mcp_sandboxfs_get_logs',
    description: 'View recent log entries from the MCP server for debugging and monitoring',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          description: 'Minimum log level to show (DEBUG, INFO, WARN, ERROR)',
          enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
          default: 'INFO'
        },
        component: {
          type: 'string',
          description: 'Filter by component (e.g., "FileOps", "Security", "MCP-Server")',
        },
        operation: {
          type: 'string',
          description: 'Filter by operation (e.g., "writeFile", "readFile", "pathValidation")',
        },
        count: {
          type: 'number',
          description: 'Number of recent log entries to return (max 100)',
          default: 20,
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'mcp_sandboxfs_list_directory',
    description: 'List files and directories in a given path',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path within sandbox (empty for root)',
          default: ''
        }
      },
      required: []
    }
  },
  {
    name: 'mcp_sandboxfs_read_file',
    description: 'Read contents of a file with automatic content type detection and optimized encoding. Text files are returned as UTF-8, binary files as base64.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        },
        encoding: {
          type: 'string',
          description: 'Optional encoding override: utf-8 for text, base64 for binary. If not specified, optimal encoding is auto-detected.',
          enum: ['utf-8', 'base64', 'binary'],
        }
      },
      required: ['path']
    }
  },
  {
    name: 'mcp_sandboxfs_write_file',
    description: 'Write content to a file (creates or overwrites) with automatic content type detection',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        },
        content: {
          type: 'string',
          description: 'Content to write (text or base64 encoded binary)'
        },
        encoding: {
          type: 'string',
          description: 'Encoding: utf-8 for text content or base64 for binary content',
          enum: ['utf-8', 'base64'],
          default: 'utf-8'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'mcp_sandboxfs_append_file',
    description: 'Append content to an existing file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        },
        content: {
          type: 'string',
          description: 'Content to append (text or base64 encoded binary)'
        },
        encoding: {
          type: 'string',
          description: 'Encoding: utf-8 or base64',
          enum: ['utf-8', 'base64'],
          default: 'utf-8'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'mcp_sandboxfs_delete_file',
    description: 'Delete a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'mcp_sandboxfs_create_directory',
    description: 'Create a new directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path for the new directory'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'mcp_sandboxfs_delete_directory',
    description: 'Delete an empty directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the directory'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'mcp_sandboxfs_move_item',
    description: 'Move or rename a file or directory (including all contents for directories). Handles both same-parent renaming and cross-directory moves atomically.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source relative path (file or directory)'
        },
        destination: {
          type: 'string',
          description: 'Destination relative path (file or directory)'
        }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'mcp_sandboxfs_copy_file',
    description: 'Copy a file',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source file relative path'
        },
        destination: {
          type: 'string',
          description: 'Destination file relative path'
        }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'mcp_sandboxfs_exists',
    description: 'Check if a file or directory exists',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to check'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'mcp_sandboxfs_get_file_info',
    description: 'Get detailed information about a file or directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file or directory'
        }
      },
      required: ['path']
    }
  }
];

// Main server class
class SandboxFileSystemServer {
  private server: Server;
  private fileOps: FileOperations | null = null;
  private config: SandboxConfig | null = null;
  
  constructor() {
    // Create the MCP server instance
    this.server = new Server(
      {
        name: 'utaba-community-sandboxfs',
        version: '1.3.0', // Updated version for MCP standard compliance
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    
    // Set up error handling
    this.server.onerror = (error) => {
      logger.error('MCP-Server', 'Server error occurred', undefined, { error: error.message });
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
      if (!this.fileOps) {
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
        // Route to appropriate handler based on tool name
        let result;
        switch (name) {
          case 'mcp_sandboxfs_get_quota_status':
            result = await this.handleGetQuotaStatus();
            break;
            
          case 'mcp_sandboxfs_get_logs':
            result = await this.handleGetLogs(args);
            break;
            
          case 'mcp_sandboxfs_list_directory':
            result = await this.handleListDirectory(args);
            break;
            
          case 'mcp_sandboxfs_read_file':
            result = await this.handleReadFile(args);
            break;
            
          case 'mcp_sandboxfs_write_file':
            result = await this.handleWriteFile(args);
            break;
            
          case 'mcp_sandboxfs_append_file':
            result = await this.handleAppendFile(args);
            break;
            
          case 'mcp_sandboxfs_delete_file':
            result = await this.handleDeleteFile(args);
            break;
            
          case 'mcp_sandboxfs_create_directory':
            result = await this.handleCreateDirectory(args);
            break;
            
          case 'mcp_sandboxfs_delete_directory':
            result = await this.handleDeleteDirectory(args);
            break;
            
          case 'mcp_sandboxfs_move_item':
            result = await this.handleMoveItem(args);
            break;
            
          case 'mcp_sandboxfs_copy_file':
            result = await this.handleCopyFile(args);
            break;
            
          case 'mcp_sandboxfs_exists':
            result = await this.handleExists(args);
            break;
            
          case 'mcp_sandboxfs_get_file_info':
            result = await this.handleGetFileInfo(args);
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
        
        // Convert our custom errors to MCP errors
        if (error instanceof SecurityError || error instanceof QuotaError) {
          logger.warn('MCP-Server', `Tool failed with validation error: ${name}`, name, { error: error.message });
          throw new McpError(ErrorCode.InvalidRequest, error.message);
        }
        if (error instanceof Error) {
          logger.error('MCP-Server', `Tool failed with error: ${name}`, name, { error: error.message });
          throw new McpError(ErrorCode.InternalError, error.message);
        }
        
        logger.error('MCP-Server', `Tool failed with unknown error: ${name}`, name, { error });
        throw error;
      }
    });
  }
  
  // Tool handlers - each returns content in MCP format
  private async handleGetQuotaStatus() {
    const quota = await this.fileOps!.getQuotaStatus();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            // Existing quota info
            used_mb: (quota.usedBytes / 1024 / 1024).toFixed(2),
            available_mb: (quota.availableBytes / 1024 / 1024).toFixed(2),
            total_mb: (quota.totalQuotaBytes / 1024 / 1024).toFixed(2),
            percent_used: quota.percentUsed.toFixed(1),
            
            // NEW: Operation limits
            limits: {
              max_file_size_mb: ((this.config!.maxFileSize ?? DEFAULT_LIMITS.maxFileSize) / 1024 / 1024).toFixed(2),
              max_content_length_mb: ((this.config!.maxContentLength ?? DEFAULT_LIMITS.maxContentLength) / 1024 / 1024).toFixed(2),
              operations: {
                write_file_mb: ((this.config!.limits?.writeFile ?? DEFAULT_LIMITS.limits.writeFile) / 1024 / 1024).toFixed(2),
                append_file_mb: ((this.config!.limits?.appendFile ?? DEFAULT_LIMITS.limits.appendFile) / 1024 / 1024).toFixed(2),
                read_file_mb: ((this.config!.limits?.readFile ?? DEFAULT_LIMITS.limits.readFile) / 1024 / 1024).toFixed(2)
              },
              // Include raw byte values for precise calculations
              raw_bytes: {
                max_file_size: this.config!.maxFileSize ?? DEFAULT_LIMITS.maxFileSize,
                max_content_length: this.config!.maxContentLength ?? DEFAULT_LIMITS.maxContentLength,
                write_file: this.config!.limits?.writeFile ?? DEFAULT_LIMITS.limits.writeFile,
                append_file: this.config!.limits?.appendFile ?? DEFAULT_LIMITS.limits.appendFile,
                read_file: this.config!.limits?.readFile ?? DEFAULT_LIMITS.limits.readFile
              }
            }
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

    // Get filtered logs
    const filters: any = { level: logLevel };
    if (component) filters.component = component;
    if (operation) filters.operation = operation;

    const logs = logger.getFilteredLogs(filters).slice(-count);

    // Format logs for display
    const formattedLogs = logs.map(entry => {
      const timestamp = entry.timestamp.substring(11, 23); // HH:MM:SS.sss
      const levelStr = LogLevel[entry.level].padEnd(5);
      const operation = entry.operation ? ` [${entry.operation}]` : '';
      
      let output = `${timestamp} ${levelStr} [${entry.component}]${operation} ${entry.message}`;
      
      if (entry.performance) {
        const perf = entry.performance;
        const perfStr = [
          perf.duration ? `${perf.duration}ms` : null,
          perf.fileSize ? `${(perf.fileSize / 1024).toFixed(1)}KB` : null,
          perf.quotaUsed ? `quota: ${perf.quotaUsed}%` : null
        ].filter(Boolean).join(', ');
        
        if (perfStr) output += ` (${perfStr})`;
      }

      if (entry.security) {
        const sec = entry.security;
        output += ` [SECURITY:${sec.blocked ? 'BLOCKED' : 'ALLOWED'}]`;
        if (sec.reason) output += ` ${sec.reason}`;
      }

      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        output += ` ${JSON.stringify(entry.metadata)}`;
      }

      return output;
    });

    const summary = {
      totalEntries: logs.length,
      filters: { level, component, operation },
      oldestEntry: logs.length > 0 ? logs[0].timestamp : null,
      newestEntry: logs.length > 0 ? logs[logs.length - 1].timestamp : null
    };

    return {
      content: [
        {
          type: 'text',
          text: `MCP Server Logs (${count} most recent entries, level: ${level}+)\n` +
                `Filters: ${JSON.stringify(filters, null, 2)}\n` +
                `Summary: ${JSON.stringify(summary, null, 2)}\n\n` +
                `Recent Log Entries:\n${formattedLogs.join('\n')}`
        } as TextContent
      ]
    };
  }
  
  private async handleListDirectory(args: any) {
    const listing = await this.fileOps!.listDirectory(args.path || '');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(listing, null, 2)
        } as TextContent
      ]
    };
  }
  
  /**
   * OPTIMIZED: Use smart content detection and avoid forced base64 for text files
   */
  private async handleReadFile(args: any) {
    const timer = new PerformanceTimer('MCP-Server', 'handleReadFile');
    
    try {
      // Use the optimized readFileWithMetadata method
      const result = await this.fileOps!.readFileWithMetadata(args.path, args.encoding);
      
      timer.endWithFileSize(result.size, true);
      
      // Log the optimization benefit
      const isOptimized = result.encoding === 'utf-8' && !result.isBinary;
      logger.info('MCP-Server', `Read file optimized: ${args.path}`, 'handleReadFile', {
        size: result.size,
        encoding: result.encoding,
        contentType: result.contentType,
        isOptimized,
        sizeSavings: isOptimized ? '~25%' : 'none'
      });
      
      return {
        content: [
          {
            type: 'text',
            text: result.content  // No forced base64 conversion!
          } as TextContent
        ],
        // Include metadata for debugging and client optimization
        _meta: {
          encoding: result.encoding,
          contentType: result.contentType,
          size: result.size,
          isBinary: result.isBinary,
          optimized: isOptimized
        }
      };
    } catch (error) {
      timer.end(false, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
  
  private async handleWriteFile(args: any) {
    const timer = new PerformanceTimer('MCP-Server', 'handleWriteFile');
    await this.fileOps!.writeFile(args.path, args.content, args.encoding);
    
    // Calculate file size for performance logging
    const fileSize = Buffer.byteLength(args.content, args.encoding === 'base64' ? 'base64' : 'utf8');
    timer.endWithFileSize(fileSize, true);
    
    return {
      content: [
        {
          type: 'text',
          text: `File written successfully: ${args.path}`
        } as TextContent
      ]
    };
  }
  
  private async handleAppendFile(args: any) {
    const timer = new PerformanceTimer('MCP-Server', 'handleAppendFile');
    
    // Add this logging
    logger.debug('MCP-Server', `AppendFile content preview: ${args.content.substring(0, 200)}...`, 'handleAppendFile', {
      contentLength: args.content.length,
      encoding: args.encoding
    });
    await this.fileOps!.appendFile(args.path, args.content, args.encoding);
    
    const fileSize = Buffer.byteLength(args.content, args.encoding === 'base64' ? 'base64' : 'utf8');
    timer.endWithFileSize(fileSize, true);
    
    return {
      content: [
        {
          type: 'text',
          text: `Content appended successfully: ${args.path}`
        } as TextContent
      ]
    };
  }
  
  private async handleDeleteFile(args: any) {
    await this.fileOps!.deleteFile(args.path);
    return {
      content: [
        {
          type: 'text',
          text: `File deleted successfully: ${args.path}`
        } as TextContent
      ]
    };
  }
  
  private async handleCreateDirectory(args: any) {
    await this.fileOps!.createDirectory(args.path);
    return {
      content: [
        {
          type: 'text',
          text: `Directory created successfully: ${args.path}`
        } as TextContent
      ]
    };
  }
  
  private async handleDeleteDirectory(args: any) {
    await this.fileOps!.deleteDirectory(args.path);
    return {
      content: [
        {
          type: 'text',
          text: `Directory deleted successfully: ${args.path}`
        } as TextContent
      ]
    };
  }
  
  private async handleMoveItem(args: any) {
    await this.fileOps!.moveFile(args.source, args.destination);
    return {
      content: [
        {
          type: 'text',
          text: `Item moved successfully: ${args.source} → ${args.destination}`
        } as TextContent
      ]
    };
  }
  
  private async handleCopyFile(args: any) {
    await this.fileOps!.copyFile(args.source, args.destination);
    return {
      content: [
        {
          type: 'text',
          text: `Copied successfully: ${args.source} → ${args.destination}`
        } as TextContent
      ]
    };
  }
  
  private async handleExists(args: any) {
    const exists = await this.fileOps!.exists(args.path);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ exists, path: args.path })
        } as TextContent
      ]
    };
  }
private async handleGetFileInfo(args: any) {
    const info = await this.fileOps!.getFileInfo(args.path);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(info, null, 2)
        } as TextContent
      ]
    };
  }
  
  async run() {
    try {
      // Load and validate configuration
      const config = loadConfig();
      await validateConfig(config);
      
      // Store config for use in handlers
      this.config = config;
      
      // Initialize logger with file support
      await logger.initialize();
      
      // Set log level based on environment or config
      logger.setLevel(process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO);
      
      logger.info('Sandbox-FS', `Starting server v1.3.0 with root: ${config.sandboxRoot}`);
      logger.info('Sandbox-FS', `Quota: ${(config.quotaBytes / 1024 / 1024).toFixed(1)} MB`);
      logger.info('Sandbox-FS', `Binary ops: ${config.allowBinary ? 'enabled' : 'disabled'}`);
      logger.info('Sandbox-FS', `Allowed extensions: ${config.allowedExtensions.join(', ') || 'all'}`);
      logger.info('Sandbox-FS', 'Features: Smart content detection, atomic moves, optimized performance, MCP standard naming');
      
      // Log file logging status
      const loggerConfig = logger.getConfig();
      if (loggerConfig.logFile) {
        logger.info('Sandbox-FS', `File logging enabled: ${loggerConfig.logFile}`);
        logger.info('Sandbox-FS', `Log rotation: ${loggerConfig.rotationStrategy}, max size: ${loggerConfig.maxSizeMB}MB`);
      } else {
        logger.info('Sandbox-FS', 'File logging disabled - logs only in memory');
      }
      
      // Initialize quota manager and file operations
      const quotaManager = new QuotaManager(config);
      await quotaManager.initialize();
      
      this.fileOps = new FileOperations(config, quotaManager);
      
      // Set up graceful shutdown
      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));
      
      // Start the server using stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('Sandbox-FS', 'Server v1.3.0 running on stdio with MCP standard tool naming');
    } catch (error) {
      logger.error('Sandbox-FS', 'Failed to start server', undefined, { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      process.exit(1);
    }
  }
  
  private async shutdown(): Promise<void> {
    logger.info('Sandbox-FS', 'Shutting down server gracefully');
    await logger.shutdown();
    process.exit(0);
  }
}

// Start the server
const server = new SandboxFileSystemServer();
server.run().catch((error) => {
  logger.error('Sandbox-FS', 'Server crashed', undefined, { 
    error: error instanceof Error ? error.message : 'Unknown error' 
  });
  console.error(error);
});
