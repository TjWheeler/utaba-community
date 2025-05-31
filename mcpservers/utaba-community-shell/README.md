# Utaba MCP Shell - https://utaba.ai

A **development tooling** MCP (Model Context Protocol) server that provides **controlled command execution** with **interactive approval workflow** for AI assistants like Claude. Features browser-based approval interface for enhanced security.

## 🚨 **CRITICAL SECURITY NOTICE**

**This tool operates under a "trusted development environment" security model:**

- **⚠️ npm command execution provides FULL SYSTEM ACCESS** through package installation scripts and package.json execution
- **⚠️ No true sandboxing is possible** when allowing npm operations
- **⚠️ Command whitelisting provides WORKFLOW CONTROL, not security isolation**
- **✅ Use ONLY in development environments** where you trust the project dependencies and toolchain
- **🛡️ NEW: Interactive approval system** provides human oversight for sensitive commands

### **Security Reality**
- **npm commands can execute arbitrary code** through pre/post-install hooks, package.json scripts, and dependency behaviors
- **This is an inherent limitation** of npm's design, not a flaw in this tool
- **Command validation prevents accidents**, not malicious attacks
- **Approval workflow adds human oversight** for high-risk operations
- **Trust your environment** - this tool is for developers who already run these commands manually

## 🌟 Why Use This?

- **🎯 Controlled Execution** - Only pre-approved commands can run with validated arguments
- **🛡️ Interactive Approvals** - Browser-based confirmation for sensitive operations
- **⚡ Real-time Streaming** - Watch long-running operations with live output
- **🔄 Git Integration** - Complete version control workflow support
- **📊 Process Management** - Monitor, track, and control running commands
- **🛠️ Production Logging** - Comprehensive audit trails with file rotation
- **🛠️ Easy Setup** - Template-based configuration for common development stacks
- **🔍 Performance Monitoring** - Built-in timing and execution analytics
- **🎮 Developer Friendly** - Designed for real development workflows

## 🛡️ **NEW: Interactive Approval System**

The approval system provides browser-based human oversight for commands that require confirmation:

### **How It Works**
1. **Command Execution**: Claude requests to run a command marked with `requiresConfirmation: true`
2. **Approval Server**: A secure web server automatically launches at `http://localhost:PORT`
3. **Browser Interface**: Beautiful, responsive UI shows command details with risk assessment
4. **Human Decision**: You approve or reject with full context and security warnings
5. **Execution**: Command proceeds only after explicit approval

### **Key Features**
- **🎯 Risk Assessment**: Automatic scoring (1-10) with specific risk factors identified
- **⚡ Real-time Updates**: Server-sent events for instant UI updates
- **🔒 Secure Authentication**: Token-based access with auto-generated credentials
- **📱 Mobile Friendly**: Responsive design works on phones and tablets
- **⌨️ Keyboard Shortcuts**: Press 'A' to approve, 'R' to reject
- **📊 Statistics Dashboard**: Track approval patterns and decision history
- **🔍 Command Details**: Full visibility into command, arguments, and working directory

### **Approval UI Preview**
```
🛡️ Command Approval Center
┌─────────────────────────────────────────────┐
│ Command Execution Request                    │
│ Risk: 7/10                                  │
│                                             │
│ npx create-react-app my-new-project         │
│                                             │
│ Working Directory: /home/user/projects      │
│ Package: create-react-app                   │
│ Timeout: 300s                              │
│                                             │
│ Risk Factors:                               │
│ • Downloads and executes remote code        │
│ • Creates new files and directories         │
│ • Installs multiple dependencies            │
│                                             │
│ [✅ Approve]  [❌ Reject]                   │
└─────────────────────────────────────────────┘
```

### **Configuration for Approvals**
```json
{
  "command": "npx",
  "description": "Execute npm packages - REQUIRES APPROVAL",
  "allowedArgs": "*",
  "timeout": 600000,
  "workingDirRestriction": "project-only",
  "requiresConfirmation": true
}
```

## 🚀 Quick Start

### Prerequisites

You'll need **Node.js** (version 18 or higher) installed on your computer. If you don't have it:

- **Windows/Mac**: Download from [nodejs.org](https://nodejs.org)
- **Linux**: Use your package manager (e.g., `sudo apt install nodejs npm`)

### Installation

```bash
npm install -g utaba-community-shell
```

### Setup with Claude Desktop

1. **Configure Claude Desktop**:
   
   Find your config file:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
   - **Linux**: `~/.config/claude/claude_desktop_config.json`

   Note: If you don't see it, open Claude Desktop, goto Settings, Developer -> Edit Config.

2. **Add this configuration**:
   Note: This uses Windows style paths with 2 backslashes. In Windows you need this. If using Linux, use /path/to/dir.
   ```json
   {
     "mcpServers": {
       "mcp-shell": {
         "command": "npx",
         "args": ["utaba-community-shell"],
         "env": {
           "MCP_SHELL_START_DIRECTORY": "C:\\Users\\YourName\\my-project",
           "LOG_FILE": "C:\\temp\\mcp-shell.log",
           "LOG_LEVEL": "info",
           "LOG_MAX_SIZE_MB": "50",
           "LOG_ROTATION_STRATEGY": "rotate",
           "LOG_KEEP_FILES": "5",
           "LOG_FORMAT": "text"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop** and start commanding! 🚀

## 🎯 What Can Claude Do Now?

Once configured, Claude can help you with **powerful** development operations:

- **📦 Package Management** - Run npm install, test, build with real-time progress
- **🔄 Version Control** - Complete git workflow: status, add, commit, push, pull, merge
- **🏗️ Project Building** - TypeScript compilation, linting, formatting with instant feedback
- **🧪 Testing** - Run Jest, Vitest, and other test suites with streaming output
- **🔍 Code Quality** - ESLint, Prettier, and other tools with detailed results
- **⚡ Live Monitoring** - Watch process execution, kill hanging commands, view logs
- **🛡️ Secure npx Operations** - Execute packages with browser-based approval workflow

## 💪 **Command Execution Features**

### **Whitelisted Commands**
- **npm**: test, run, install, ci, audit, outdated, list, start, build
- **git**: status, log, diff, add, commit, push, pull, fetch, merge, branch, checkout, stash, tag
- **TypeScript**: tsc --noEmit, --build, --watch
- **Linting**: eslint, prettier with configurable patterns
- **Testing**: jest, vitest with full argument support
- **npx**: Execute packages with browser-based confirmation prompts

### **Security Validation**
- **Argument Patterns**: Regex validation for safe command arguments
- **Working Directory**: Commands restricted to project directories
- **Injection Protection**: Basic detection of command injection attempts
- **Environment Control**: Sanitized environment variable handling
- **Human Oversight**: Interactive approval for high-risk operations

### **Process Management**
```
✅ Command executed: npm test (duration: 2.3s, exit: 0, pid: 12345)
✅ Real-time streaming: 847 lines of output processed
✅ Process monitoring: 3 active, 1 completed, 0 failed
✅ Approval requested: npx create-react-app (pending human decision)
```

## 🛡️ Security Features

### Trust-Based Model
- **Trusted Environment**: Assumes development machine security
- **Command Whitelisting**: Only pre-approved commands execute
- **Argument Validation**: Parameters checked against safe patterns
- **Working Directory**: Commands confined to project boundaries
- **Interactive Approval**: Human oversight for sensitive operations

### Access Control  
- **Pattern Matching**: Regex validation for command arguments
- **Path Restrictions**: Operations limited to project directories
- **Environment Filtering**: Control over environment variable access
- **Audit Logging**: Complete history of all executed commands
- **Approval Workflow**: Browser-based confirmation with risk assessment

### Monitoring
- **Real-time Logging**: Track all command executions with timestamps
- **Security Auditing**: Log all validation decisions and blocks
- **Performance Tracking**: Monitor execution time and resource usage
- **Process Oversight**: Track active processes and their lifecycle
- **Approval History**: Complete audit trail of human decisions

## 📋 Available Commands

When Claude uses the shell, these **controlled** operations are available:

| Command | Description | Security Level |
|---------|-------------|----------------|
| `execute_command` | Run whitelisted command | **Validated execution** |
| `execute_command_streaming` | **⚡ Live output** streaming | **Real-time monitoring** |
| `list_allowed_commands` | Show configuration | **Read-only access** |
| `get_command_status` | Process monitoring | **System insights** |
| `kill_command` | Stop running processes | **Process control** |
| `get_logs` | View execution logs | **Audit access** |
| `get_approval_status` | Check approval system | **Human oversight status** |

## 🛡️ **Approval System Configuration**

### **Enabling Approvals**

Set `requiresConfirmation: true` for any command that should require human approval:

```json
{
  "allowedCommands": [
    {
      "command": "npx",
      "description": "Execute npm packages - REQUIRES APPROVAL",
      "allowedArgs": "*",
      "timeout": 600000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": true
    },
    {
      "command": "curl",
      "description": "HTTP client - REQUIRES APPROVAL for external requests",
      "allowedArgs": "*",
      "timeout": 60000,
      "workingDirRestriction": "any",
      "requiresConfirmation": true
    }
  ]
}
```

### **Approval Workflow Example**

1. **Claude Request**: "Let me create a new React app with `npx create-react-app my-app`"
2. **System Response**: "Approval required for npx command. Browser window will open..."
3. **Browser Opens**: Secure approval interface at `http://localhost:3847?token=abc123`
4. **Risk Assessment**: Shows risk score 7/10 with factors:
   - Downloads and executes remote code
   - Creates new files and directories  
   - Installs multiple dependencies
5. **Human Decision**: You click "✅ Approve" or "❌ Reject"
6. **Execution**: Command proceeds only if approved

### **Risk Assessment Rules**

The system automatically calculates risk scores (1-10) based on:

- **Package Source**: Unknown packages score higher
- **Argument Patterns**: Suspicious flags increase risk
- **Network Access**: External connections add risk
- **File Operations**: File creation/deletion considered
- **Execution Context**: Working directory permissions

### **Approval Server Security**

- **Token Authentication**: Random 64-character tokens for each session
- **Local Only**: Server binds to localhost only
- **Auto-Shutdown**: Closes when MCP server stops
- **Secure Headers**: CSP, XSS protection, frame denial
- **Request Logging**: Full audit trail of all access attempts

## 🧪 Testing & Development

### Running Tests

This project includes a comprehensive test suite built with Vitest for reliability and development confidence:

```bash
# Run all tests in watch mode (great for development)
npm test

# Run tests once and exit (good for CI/CD)
npm run test:run

# Run tests with coverage reporting
npm run test:coverage

# Open interactive test UI in browser
npm run test:ui

# Debug tests with breakpoints (IDE integration)
npm run test:debug

# Run tests in watch mode (alternative)
npm run test:watch
```

### Test Coverage

The test suite provides comprehensive coverage across:

- **Unit Tests** - Individual component testing (security, config, command execution)
- **Integration Tests** - End-to-end command execution workflows
- **Approval System Tests** - Complete approval workflow validation
- **Security Tests** - Command injection, validation bypass attempts
- **Performance Tests** - Execution timing and process management
- **Error Handling** - Graceful failure and recovery scenarios

### Approval System Tests

Specific test coverage for the approval system:

```bash
# Run only approval system tests
npm test -- --grep "approval"

# Test approval workflow end-to-end
npm test -- src/__tests__/approvals.test.ts

# Test approval server integration
npm test -- --grep "ApprovalServer"
```

### Test Structure

```
src/__tests__/
├── unit/                    # Component-specific tests
│   ├── security.test.ts    # Security validation
│   ├── config.test.ts      # Configuration loading
│   ├── commandExecutor.test.ts # Command execution
│   └── logger.test.ts      # Logging functionality
├── integration/            # End-to-end tests
│   └── server.test.ts     # Full workflow testing
├── approvals.test.ts       # Approval system tests
└── fixtures/              # Test data and samples
```

## 🔧 Technical Configuration

### Environment Variables

Configure the server behavior using these environment variables:

#### Core Settings
```bash
# Required: Initial project directory
MCP_SHELL_START_DIRECTORY="/path/to/your/project"

# Configuration file path
MCP_SHELL_CONFIG_PATH="/path/to/mcp-shell-config.json"

# Maximum concurrent commands (default: 3)
MCP_SHELL_MAX_CONCURRENT="3"

# Default command timeout in milliseconds (default: 30000)
MCP_SHELL_DEFAULT_TIMEOUT="30000"
```

#### Logging Configuration
```bash
# Enable persistent file logging
LOG_FILE="/path/to/mcp-shell.log"

# Log level: 'debug', 'info', 'warn', 'error' (default: info)
LOG_LEVEL="info"

# Maximum log file size in MB before rotation (default: 10)
LOG_MAX_SIZE_MB="10"

# Log rotation strategy: 'rotate' or 'truncate' (default: rotate)
LOG_ROTATION_STRATEGY="rotate"

# Number of backup log files to keep (default: 3)
LOG_KEEP_FILES="3"

# Log format: 'text' or 'json' (default: text)
LOG_FORMAT="text"
```

### Configuration Templates

#### Node.js Development with Approvals (Recommended)
```json
{
  "mcpServers": {
    "mcp-shell": {
      "command": "npx",
      "args": ["utaba-community-shell"],
      "env": {
        "MCP_SHELL_START_DIRECTORY": "C:\\Users\\YourName\\my-project",
        "MCP_SHELL_CONFIG_PATH": "C:\\Users\\YourName\\my-project\\.mcp-shell-config.json",
        "LOG_FILE": "C:\\Users\\YourName\\my-project\\mcp-shell.log",
        "LOG_LEVEL": "info",
        "MCP_SHELL_MAX_CONCURRENT": "5"
      }
    }
  }
}
```

#### Example .mcp-shell-config.json with Approvals
```json
{
  "description": "Development environment with approval system",
  "trustedEnvironment": true,
  "projectRoots": ["C:\\Users\\YourName\\my-project"],
  "maxConcurrentCommands": 3,
  "defaultTimeout": 120000,
  "allowedCommands": [
    {
      "command": "npm",
      "description": "Node.js package manager",
      "allowedArgs": ["install", "run", "test", "build", "start"],
      "timeout": 300000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": false
    },
    {
      "command": "npx",
      "description": "Execute npm packages - REQUIRES APPROVAL",
      "allowedArgs": "*",
      "timeout": 600000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": true
    },
    {
      "command": "git",
      "description": "Git version control",
      "allowedArgs": ["status", "add", "commit", "push", "pull", "fetch"],
      "timeout": 120000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": false
    }
  ]
}
```

## 📊 **Command Execution Monitoring**

### **Built-in Command Analytics**

Ask Claude to show you execution metrics:

```
"Show me recent command executions with timing data"
"What commands have been running and their status?"
"Display the command execution log with performance metrics"
"How many npm installs have we run this session?"
"What's the status of the approval system?"
```

### **Enhanced Execution Viewer**

The server provides detailed command insights:

**Command Log Example:**
```
20:15:42.123 INFO  [CommandExecutor] [executeCommand] npm test completed 
    (duration: 2.3s, exit: 0, pid: 12345)
20:15:45.200 INFO  [Security] [validateCommand] git commit allowed 
    [SECURITY:ALLOWED] Valid arguments
20:15:47.350 WARN  [Security] [validateCommand] Security violation detected 
    [SECURITY:BLOCKED] Invalid argument pattern
20:15:50.120 INFO  [ApprovalManager] [requestApproval] Approval required for npx
    [APPROVAL:PENDING] Browser interface launched
20:15:55.890 INFO  [ApprovalServer] [api] Request approved via browser
    [APPROVAL:APPROVED] User: browser-user
```

### **Approval System Analytics**
```
Approval System Report:
✅ Status: Active (Server running on port 3847)
✅ Pending Requests: 0
✅ Total Decisions: 12 (10 approved, 2 rejected)
✅ Average Decision Time: 15.3s
🎯 Security Score: High (all risky commands require approval)
```

### **Performance Benchmarks**

| Command Type | Average Duration | Success Rate | Approval Rate |
|-------------|------------------|--------------|---------------|
| **npm test** | 2.3s | 98% | N/A |
| **git operations** | 0.8s | 99% | N/A |
| **npx commands** | 45.2s | 95% | 83% approved |
| **curl requests** | 1.8s | 92% | 75% approved |

## 🐛 Troubleshooting

### Common Issues

**"Approval system not starting"**
- Check that port is available (approval server auto-assigns)
- Verify no firewall blocking localhost connections
- Ensure sufficient permissions to open browser

**"Browser window not opening"**
- Check system default browser configuration
- Try manual navigation to approval URL shown in logs
- Verify browser not blocking localhost connections

**"Approval timeout"**
- Default timeout is 5 minutes for approval decisions
- Check browser window hasn't been closed
- Verify approval server is still running

**"Command not in whitelist"**
- Check that the command is in your `allowedCommands` configuration
- Verify command exists on your system (`which npm`, `which git`)
- Ensure arguments match the allowed patterns

**"Working directory not allowed"**
- Verify the working directory is within your configured `projectRoots`
- Check that `MCP_SHELL_START_DIRECTORY` points to the correct location
- Ensure directory permissions allow access

**"Security validation failed"**
- Review command arguments for potentially dangerous patterns
- Check logs for specific validation failures
- Ensure arguments match the configured `argPatterns`

### **Approval System Debug Mode**

Enable detailed approval logging:
```bash
LOG_LEVEL="debug"
```

This will show:
- **Approval request creation** and risk assessment details
- **Server startup** and authentication token generation
- **Browser launch attempts** and success/failure reasons
- **User decision processing** and validation steps
- **Queue management** and cleanup operations

## 🔨 Development

### Building from Source

```bash
# Clone and install dependencies
git clone <repository>
cd utaba-community-shell
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Test approval system
npm run test -- --grep "approval"
```

### Approval System Development

The approval system consists of several key components:

```
src/approvals/
├── index.ts          # Main exports
├── types.ts          # TypeScript definitions
├── queue.ts          # File-based request queue
├── manager.ts        # Orchestration layer
└── server.ts         # Express web server
```

**Key Design Decisions:**
- **File-based queue**: Reliable, debuggable, atomic operations
- **Browser authentication**: Secure token-based access
- **Risk assessment**: Automated scoring with human oversight
- **Real-time updates**: Server-sent events for responsive UI

## 🚀 **Configuration Guide**

### **Template Selection**

Choose the right template for your project:

1. **nodejs-with-approvals** (Recommended): Full development environment with interactive approval system
2. **nodejs**: Standard setup without approval requirements
3. **minimal**: Basic setup with only essential commands

### **Custom Approval Configuration**

Configure which commands require approval:

```json
{
  "allowedCommands": [
    {
      "command": "npm",
      "requiresConfirmation": false
    },
    {
      "command": "npx",
      "requiresConfirmation": true
    },
    {
      "command": "curl",
      "requiresConfirmation": true
    }
  ]
}
```

### **Security Considerations**

- ✅ **Review package intentions** before approving npx commands
- ✅ **Understand command implications** shown in approval interface
- ✅ **Monitor approval patterns** for unusual requests
- ✅ **Use approval system** for any commands that download/execute external code
- ✅ **Check working directories** in approval interface before proceeding

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch  
3. Add tests for new approval features
4. Ensure approval workflow works correctly
5. Submit a pull request

### Approval System Contributions

Specific areas for approval system enhancement:
- **Risk assessment rules**: Improve scoring algorithms
- **UI improvements**: Better visualization of command risks
- **Integration tests**: More comprehensive workflow testing
- **Performance optimization**: Faster approval server startup

## 📄 License

This project is licensed under the BSD-3-Clause License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with the [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- Uses TypeScript for type safety and developer experience
- Express.js powers the approval web interface
- Designed for real-world development workflows with human oversight
- Inspired by the need for **controlled, secure** AI-human collaboration

---

## ⚠️ **Ready to Take Control?**

```bash
npm install -g utaba-community-shell
```

**Give Claude the power of the command line - with human oversight for safety!** 🚀🛡️

---

**Happy AI-powered development - now with interactive approval system!** ⚡🤖✨🛡️
