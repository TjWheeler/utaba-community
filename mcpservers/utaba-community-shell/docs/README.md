# Utaba Community Shell MCP Server

**Version:** 1.3.1  
**Description:** MCP Server for controlled command execution with interactive approval system in trusted development environments

## Overview

The Utaba Community Shell is a Model Context Protocol (MCP) server that provides secure, controlled command execution capabilities for development environments. It enables AI assistants like Claude to execute whitelisted development commands with comprehensive security validation, interactive approval workflows, and asynchronous job processing.

## Key Features

- **Whitelisted Command Execution**: Only pre-approved commands can be executed
- **Security Validation**: Multi-layer security checks including argument validation, path restrictions, and injection prevention
- **Interactive Approval System**: Browser-based approval interface for commands requiring confirmation
- **Asynchronous Job Processing**: Long-running commands with job queue management
- **Comprehensive Logging**: Structured logging with file output and performance tracking
- **Development Focus**: Optimized for npm, git, TypeScript, and other development tools

## System Architecture

The server is built around several core components:

### 1. Command Executor (`commandExecutor.ts`)
The main execution engine that handles all command operations:
- Validates commands against security rules
- Manages approval workflows
- Handles both synchronous and asynchronous execution
- Tracks active processes and provides process management

### 2. Security Validator (`security.ts`)
Multi-layer security system:
- Command whitelist validation
- Argument pattern matching and injection prevention  
- Working directory restrictions
- Environment variable sanitization
- Project boundary enforcement

### 3. Configuration System (`config.ts`)
Flexible configuration with JSON files and environment overrides:
- Command definitions with security rules
- Project root definitions
- Timeout and concurrency settings
- Logging configuration

### 4. Approval System (`approvals/`)
File-based approval workflow:
- Browser interface for command confirmation
- Queue management for pending approvals
- Bridge system for async job integration
- Express.js web server for UI

### 5. Async Job Queue (`async/`)
Background processing system:
- Job submission with unique IDs
- Status tracking and progress monitoring
- Secure result retrieval with execution tokens
- Conversation-based job grouping

### 6. Logging System (`logger.ts`)
Structured logging with:
- Multiple log levels (DEBUG, INFO, WARN, ERROR)
- File rotation and size management
- Performance and security event tracking
- JSON and text output formats

## MCP Tools

The server exposes the following tools through the Model Context Protocol:

### Synchronous Command Execution

#### `mcp_shell_execute_command`
Execute a whitelisted command and wait for completion.

**Parameters:**
- `command` (string, required): Command to execute (must be whitelisted)
- `args` (string[], optional): Command arguments
- `workingDirectory` (string, optional): Working directory for execution
- `timeout` (number, optional): Timeout in milliseconds (1000-300000)

**Returns:** Command result with exit code, stdout/stderr, execution time, and process info.

#### `mcp_shell_execute_command_streaming`
Execute a command with real-time output streaming.

**Parameters:** Same as `mcp_shell_execute_command`

**Returns:** Command result with streamed output included.

### Asynchronous Command Execution

#### `mcp_shell_execute_command_async`
Submit a command for background execution, returns immediately with job ID.

**Parameters:**
- `command` (string, required): Command to execute
- `args` (string[], optional): Command arguments  
- `workingDirectory` (string, optional): Working directory
- `timeout` (number, optional): Timeout in milliseconds (up to 4 hours)
- `conversationId` (string, optional): Conversation ID for job tracking
- `userDescription` (string, optional): Description of the task

**Returns:** Job submission response with job ID and status.

#### `mcp_shell_check_job_status`
Check the status and progress of an async job.

**Parameters:**
- `jobId` (string, required): Job ID from async execution

**Returns:** Job status with progress information and polling recommendations.

#### `mcp_shell_get_job_result`
Retrieve results from a completed job using secure token.

**Parameters:**
- `jobId` (string, required): Job ID
- `executionToken` (string, required): Secure token provided on completion

**Returns:** Complete execution results (stdout, stderr, exit code, etc.).

#### `mcp_shell_list_jobs`
List recent async jobs with optional filtering.

**Parameters:**
- `limit` (number, optional): Maximum jobs to return (1-50, default 10)
- `conversationId` (string, optional): Filter by conversation
- `status` (string, optional): Filter by job status

**Returns:** List of job summaries with metadata.

#### `mcp_shell_check_conversation_jobs`
Check status of all jobs in current conversation session.

**Parameters:**
- `conversationId` (string, optional): Conversation ID
- `includeCompleted` (boolean, optional): Include recent completions

**Returns:** Grouped job status (active, completed, pending results).

### System Management

#### `mcp_shell_list_allowed_commands`
List all whitelisted commands and their configurations.

**Returns:** Complete command whitelist with security settings and approval system status.

#### `mcp_shell_get_command_status`
Get status of running commands and execution statistics.

**Returns:** Active processes, execution statistics, and system status.

#### `mcp_shell_kill_command`
Kill a running command by process ID.

**Parameters:**
- `processId` (string, required): Process ID (system PID or internal ID)
- `signal` (string, optional): Signal to send (default: SIGTERM)

**Returns:** Kill operation status.

#### `mcp_shell_get_logs`
Retrieve recent log entries for debugging.

**Parameters:**
- `level` (string, optional): Minimum log level (DEBUG, INFO, WARN, ERROR)
- `component` (string, optional): Filter by component
- `operation` (string, optional): Filter by operation
- `count` (number, optional): Number of entries (1-100, default 20)

**Returns:** Filtered log entries with metadata.

### Approval System

#### `mcp_shell_get_approval_status`
Get status of the approval system.

**Returns:** Approval system configuration and current status.

#### `mcp_shell_launch_approval_center`
Launch the browser-based approval center.

**Parameters:**
- `forceRestart` (boolean, optional): Force restart even if running

**Returns:** Launch status and approval center URL.

## Configuration

The server uses JSON configuration files with the following structure:

```json
{
  "projectRoots": ["/path/to/project1", "/path/to/project2"],
  "trustedEnvironment": true,
  "defaultTimeout": 30000,
  "maxConcurrentCommands": 3,
  "allowedCommands": [
    {
      "command": "npm",
      "allowedArgs": ["test", "run", "install", "build"],
      "description": "Node Package Manager",
      "timeout": 60000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": false
    }
  ],
  "logLevel": "info",
  "logToFile": false,
  "blockedEnvironmentVars": ["HOME", "PATH", "USER"]
}
```

### Configuration Properties

- **projectRoots**: Array of allowed project directories
- **trustedEnvironment**: Must be true for operation
- **defaultTimeout**: Default command timeout in milliseconds
- **maxConcurrentCommands**: Maximum concurrent executions (1-10)
- **allowedCommands**: Array of command definitions
- **asyncQueueBaseDir**: Directory for async job queue storage
- **approvalQueueBaseDir**: Directory for approval queue storage

### Command Configuration

Each command in `allowedCommands` supports:

- **command**: Command name (exact match required)
- **allowedArgs**: Specific arguments allowed (optional)
- **argPatterns**: Regex patterns for argument validation (optional)
- **description**: Human-readable description
- **timeout**: Command-specific timeout override
- **workingDirRestriction**: `"none"`, `"project-only"`, or `"specific"`
- **allowedWorkingDirs**: Specific directories (required if restriction is `"specific"`)
- **requiresConfirmation**: Whether command requires approval
- **environment**: Additional environment variables

## Security Model

### Trust Boundaries

The server operates under a **trusted environment** model:

- Commands execute with full system privileges
- npm and similar tools can run arbitrary code
- Security focuses on workflow control, not isolation
- Intended for development environments only

### Security Layers

1. **Command Whitelist**: Only pre-approved commands allowed
2. **Argument Validation**: Pattern matching and injection prevention
3. **Path Restrictions**: Commands restricted to project directories
4. **Environment Sanitization**: Control over environment variables
5. **Interactive Approval**: Human confirmation for sensitive operations
6. **Audit Logging**: All actions logged for security review

### Security Warnings

- **Full System Access**: Commands can access entire system
- **Code Execution**: npm and similar tools execute arbitrary scripts
- **Trust Required**: Use only in environments you fully trust
- **No Sandboxing**: No process isolation or resource limits

## Environment Variables

The server supports environment variable configuration:

- `MCP_SHELL_CONFIG_PATH`: Path to configuration file
- `MCP_SHELL_LOG_LEVEL`: Log level override (debug, info, warn, error)
- `MCP_SHELL_MAX_CONCURRENT`: Maximum concurrent commands
- `MCP_SHELL_TIMEOUT`: Default timeout in milliseconds
- `MCP_SHELL_START_DIRECTORY`: Starting directory for operations
- `LOG_FILE`: Log file path
- `LOG_MAX_SIZE_MB`: Log file size limit
- `LOG_ROTATION_STRATEGY`: Log rotation strategy (truncate/rotate)

## Installation and Usage

### Prerequisites

- Node.js 18+
- npm or compatible package manager
- Trusted development environment

### Installation

```bash
npm install utaba-community-shell
```

### Configuration

1. Create configuration file or use built-in templates
2. Set project roots to your development directories
3. Configure allowed commands for your workflow
4. Set up approval system if needed

### Running

```bash
# Direct execution
npx utaba-mcp-shell

# Via MCP client
# Add to your MCP client configuration
```

### Development Commands

```bash
npm run build      # Build TypeScript
npm run dev        # Development mode
npm run test       # Run tests
npm run debug      # Debug mode
```

## Logging and Monitoring

### Log Levels

- **DEBUG**: Detailed execution information
- **INFO**: General operational messages
- **WARN**: Warning conditions and security events
- **ERROR**: Error conditions and failures

### Log Categories

- **MCP-Server**: Protocol and tool handling
- **CommandExecutor**: Command execution and management
- **Security**: Security validation and violations
- **ApprovalManager**: Approval workflow events
- **AsyncJobQueue**: Background job processing

### Performance Monitoring

The system tracks:
- Command execution times
- Queue processing metrics
- Approval response times
- System resource usage
- Error rates and patterns

## Error Handling

### Error Types

- **SecurityError**: Security validation failures
- **ApprovalError**: Approval system failures
- **CommandExecutionError**: Command execution failures
- **ValidationError**: Configuration validation errors

### Recovery Strategies

- Automatic retry for transient failures
- Graceful degradation for non-critical features
- Comprehensive error logging for debugging
- Clean shutdown procedures

## Contributing

This is a community project. Contributions welcome for:

- Additional command patterns
- Security enhancements
- Performance improvements
- Documentation improvements
- Test coverage expansion

## License

BSD-3-Clause License

## Support

- GitHub Issues: https://github.com/TjWheeler/utaba-community/issues
- Repository: https://github.com/TjWheeler/utaba-community

---

**Security Notice**: This server provides system-level access and should only be used in trusted development environments. Review all configuration carefully before deployment.