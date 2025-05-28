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
import { loadConfig, validateConfig } from './config.js';  // Add .js extension
import { QuotaManager } from './quota.js';  // Add .js extension
import { FileOperations } from './fileOperations.js';  // Add .js extension
import { SecurityError } from './security.js';  // Add .js extension
import { QuotaError } from './quota.js';  // Add .js extension

// Define our tools metadata
// This tells the AI what functions are available and how to use them
const TOOLS: Tool[] = [
  {
    name: 'get_quota_status',
    description: 'Get current quota usage and available space',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'list_directory',
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
    name: 'read_file',
    description: 'Read contents of a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        },
        encoding: {
          type: 'string',
          description: 'Encoding: utf-8, base64, or binary (returns base64)',
          enum: ['utf-8', 'base64', 'binary'],
          default: 'utf-8'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
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
          description: 'Encoding: utf-8 or base64',
          enum: ['utf-8', 'base64'],
          default: 'utf-8'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'append_file',
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
    name: 'delete_file',
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
    name: 'create_directory',
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
    name: 'delete_directory',
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
    name: 'move_file',
    description: 'Move or rename a file or directory',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source relative path'
        },
        destination: {
          type: 'string',
          description: 'Destination relative path'
        }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'copy_file',
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
    name: 'exists',
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
    name: 'get_file_info',
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
  
  constructor() {
    // Create the MCP server instance
    this.server = new Server(
      {
        name: 'utaba-community-sandboxfs',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {} // We only provide tools, no resources or prompts
        }
      }
    );
    
    // Set up error handling
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]', error);
    };
    
    this.setupHandlers();
  }
  
  private setupHandlers() {
    // Handler for listing available tools
    // This is called when the AI wants to know what tools are available
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });
    
    // Handler for calling tools
    // This is where the actual work happens when the AI calls a tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.fileOps) {
        throw new McpError(
          ErrorCode.InternalError,
          'Server not properly initialized'
        );
      }
      
      const { name, arguments: args } = request.params;
      
      try {
        // Route to appropriate handler based on tool name
        switch (name) {
          case 'get_quota_status':
            return await this.handleGetQuotaStatus();
            
          case 'list_directory':
            return await this.handleListDirectory(args);
            
          case 'read_file':
            return await this.handleReadFile(args);
            
          case 'write_file':
            return await this.handleWriteFile(args);
            
          case 'append_file':
            return await this.handleAppendFile(args);
            
          case 'delete_file':
            return await this.handleDeleteFile(args);
            
          case 'create_directory':
            return await this.handleCreateDirectory(args);
            
          case 'delete_directory':
            return await this.handleDeleteDirectory(args);
            
          case 'move_file':
            return await this.handleMoveFile(args);
            
          case 'copy_file':
            return await this.handleCopyFile(args);
            
          case 'exists':
            return await this.handleExists(args);
            
          case 'get_file_info':
            return await this.handleGetFileInfo(args);
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        // Convert our custom errors to MCP errors
        if (error instanceof SecurityError || error instanceof QuotaError) {
          throw new McpError(ErrorCode.InvalidRequest, error.message);
        }
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
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
            used_mb: (quota.usedBytes / 1024 / 1024).toFixed(2),
            available_mb: (quota.availableBytes / 1024 / 1024).toFixed(2),
            total_mb: (quota.totalQuotaBytes / 1024 / 1024).toFixed(2),
            percent_used: quota.percentUsed.toFixed(1)
          }, null, 2)
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
  
  private async handleReadFile(args: any) {
    const content = await this.fileOps!.readFile(args.path, args.encoding);
    return {
      content: [
        {
          type: 'text',
          text: typeof content === 'string' ? content : content.toString('base64')
        } as TextContent
      ]
    };
  }
  
  private async handleWriteFile(args: any) {
    await this.fileOps!.writeFile(args.path, args.content, args.encoding);
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
    await this.fileOps!.appendFile(args.path, args.content, args.encoding);
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
  
  private async handleMoveFile(args: any) {
    await this.fileOps!.moveFile(args.source, args.destination);
    return {
      content: [
        {
          type: 'text',
          text: `Moved successfully: ${args.source} → ${args.destination}`
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
      
      console.error(`[Sandbox FS] Starting with root: ${config.sandboxRoot}`);
      console.error(`[Sandbox FS] Quota: ${config.quotaBytes / 1024 / 1024} MB`);
      console.error(`[Sandbox FS] Binary ops: ${config.allowBinary ? 'enabled' : 'disabled'}`);
      
      // Initialize quota manager and file operations
      const quotaManager = new QuotaManager(config);
      await quotaManager.initialize();
      
      this.fileOps = new FileOperations(config, quotaManager);
      
      // Start the server using stdio transport
      // This means communication happens via stdin/stdout
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.error('[Sandbox FS] Server running on stdio');
    } catch (error) {
      console.error('[Sandbox FS] Failed to start:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new SandboxFileSystemServer();
server.run().catch(console.error);