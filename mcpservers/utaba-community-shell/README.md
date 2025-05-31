# Utaba MCP Shell

A production-ready MCP (Model Context Protocol) server that gives Claude secure command-line access with **browser-based approval system** for safe AI-human collaboration.

🎯 **Perfect for:** Developers who want Claude to help with real development tasks  
🛡️ **Built-in Safety:** Interactive approval workflow for risky commands  
⚡ **Powerful:** Full access to npm, git, build tools, and custom commands

## ✨ Quick Demo

**Claude:** "Let me run your tests"
```bash
✅ npm test → runs immediately (trusted command)
```

**Claude:** "Let me create a new React app"  
```bash
🛡️ npx create-react-app → opens browser for approval
```

**You:** Click "Approve" in browser → Command executes

---

## 🚀 Quick Start

### 1. Install
```bash
npm install -g utaba-community-shell
```

### 2. Configure Claude Desktop

Find your Claude Desktop config file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

### 3. Add This Configuration

**Simple Setup (Windows):**
```json
{
  "mcpServers": {
    "mcp-shell": {
      "command": "npx",
      "args": ["utaba-community-shell"],
      "env": {
        "MCP_SHELL_START_DIRECTORY": "C:\\Users\\YourName\\my-project"
      }
    }
  }
}
```

**Simple Setup (macOS/Linux):**
```json
{
  "mcpServers": {
    "mcp-shell": {
      "command": "npx", 
      "args": ["utaba-community-shell"],
      "env": {
        "MCP_SHELL_START_DIRECTORY": "/Users/yourname/my-project"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

That's it! Claude now has secure command-line access.

---

## 🎯 What Claude Can Do

### ✅ Trusted Commands (Run Immediately)
- **Package Management**: `npm install`, `npm test`, `npm run build`
- **Version Control**: `git status`, `git add`, `git commit`, `git push` 
- **TypeScript**: `tsc --build`, `tsc --noEmit`
- **Code Quality**: `eslint`, `prettier`

### 🛡️ Approval Required Commands
- **Package Execution**: `npx create-react-app`, `npx playwright install`
- **Network Requests**: `curl`, `wget`
- **Custom risky commands**: Anything you configure with `requiresConfirmation: true`

---

## 🛡️ Interactive Approval System

When Claude tries to run a risky command:

1. **🚀 Browser Opens Automatically** → Secure approval interface
2. **🔍 Command Review** → See exactly what will run, where, and why it might be risky
3. **✅ Your Decision** → Approve or reject with full context
4. **⚡ Instant Execution** → Command runs immediately after approval

### Approval Interface Preview
```
🛡️ Command Approval Center
═══════════════════════════════════════════

Command Execution Request                Risk: 7/10
npx create-react-app my-new-project

Working Directory: /Users/you/projects
Package: create-react-app  
Timeout: 300s

⚠️ Risk Factors:
• Downloads and executes remote code
• Creates new files and directories  
• Installs multiple dependencies

[✅ Approve]  [❌ Reject]
```

---

## ⚙️ Configuration Examples

### Simple Config (Most Users)
Create `mcp-shell-config.json` in your project:

```json
{
  "projectRoots": ["/path/to/your/project"],
  "trustedEnvironment": true,
  "allowedCommands": [
    {
      "command": "npm",
      "allowedArgs": ["install", "test", "run", "build"],
      "description": "Package manager - runs immediately"
    },
    {
      "command": "git",
      "allowedArgs": ["status", "add", "commit", "push", "pull"],
      "description": "Version control - runs immediately"
    }
  ]
}
```

Note: In windows your paths should include double backslashes, eg; "C:\\Users\\MyProfile\\Repos\\MyProject"


### Full Development Config
For comprehensive development environment:

```json
{
  "description": "Full development environment with approval system",
  "projectRoots": ["/Users/yourname/projects"],
  "trustedEnvironment": true,
  "maxConcurrentCommands": 5,
  "defaultTimeout": 120000,
  "allowedCommands": [
    {
      "command": "npm",
      "description": "Node.js package manager",
      "allowedArgs": ["install", "run", "test", "build", "start", "audit", "outdated"],
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
      "allowedArgs": ["status", "add", "commit", "push", "pull", "fetch", "checkout", "branch", "log", "diff", "-F"],
      "timeout": 120000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": false
    },
    {
      "command": "tsc",
      "description": "TypeScript compiler",
      "allowedArgs": ["--build", "--watch", "--noEmit", "--listFiles", "--project"],
      "timeout": 180000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": false
    },
    {
      "command": "eslint",
      "description": "ESLint linter",
      "allowedArgs": ["--fix", "--cache", "--ext", "--format"],
      "argPatterns": [
        "^--ext\\s+\\.(js|ts|jsx|tsx)(,\\.(js|ts|jsx|tsx))*$",
        "^\\./", "^src/", "^\\*\\*/\\*\\.(js|ts|jsx|tsx)$"
      ],
      "timeout": 90000,
      "workingDirRestriction": "project-only",
      "requiresConfirmation": false
    },
   {
      "command": "curl",
      "description": "HTTP client - REQUIRES APPROVAL",
      "argPatterns": ["^(https?|ftp):\/\/[^\\s/$.?#].[^\\s]*$"],
      "timeout": 60000,
      "workingDirRestriction": "none",
      "requiresConfirmation": true
    }
  ],
  "logLevel": "info",
  "logToFile": false
}
```

---

## 🔧 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MCP_SHELL_START_DIRECTORY` | **Required:** Project root directory | `/Users/you/my-project` |
| `MCP_SHELL_CONFIG_PATH` | Custom config file location | `./my-config.json` |
| `LOG_LEVEL` | Logging detail: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Enable file logging | `./mcp-shell.log` |
| `MCP_SHELL_MAX_CONCURRENT` | Max simultaneous commands | `3` |

---

## 🚨 Security Model

### Trusted Development Environment
- ✅ **Use only in development environments you trust**
- ✅ **npm commands have full system access** (this is npm's design, not a limitation)
- ✅ **Command whitelisting prevents accidents**, approval system adds human oversight
- ✅ **Perfect for AI-human collaboration** with appropriate safeguards

### What's Protected
- **Command Validation**: Only whitelisted commands can run
- **Argument Checking**: Parameters validated against safe patterns  
- **Directory Restrictions**: Commands limited to project directories
- **Human Oversight**: Interactive approval for risky operations
- **Audit Logging**: Complete history of all commands

### What Requires Approval
Configure any command with `requiresConfirmation: true`:
- **External package execution** (`npx`)
- **Network requests** (`curl`, `wget`)
- **System modifications** (custom admin commands)
- **File operations outside project** (if configured)

---

## 💡 Real-World Examples

### "Claude, help me start a new React project"
```bash
# Claude will request approval for:
npx create-react-app my-awesome-app

# After your approval:
✅ Project created
✅ Dependencies installed  
✅ Ready for development
```

### "Run my tests and check git status"
```bash
# These run immediately (trusted):
npm test ✅
git status ✅

# Results displayed in real-time
```

### "Deploy my changes"
```bash
# Trusted commands run immediately:
git add . ✅
git commit -m "Deploy updates" ✅
git push ✅

# If you configured deployment commands to require approval:
npm run deploy 🛡️ → browser approval → ✅
```

---

## 🛠️ Advanced Features

### Real-Time Command Streaming
See command output as it happens:
```bash
npm install  # Long running command
📊 Installing dependencies... 47% complete
📊 Building native modules... 
📊 ✅ Completed in 23.4s
```

### Process Management
- **Monitor active commands**: See what's running and for how long
- **Kill hanging processes**: Stop commands that get stuck
- **Execution history**: Review past commands with timing data

### Comprehensive Logging
```bash
# Enable detailed logging
LOG_LEVEL="info" LOG_FILE="./mcp-shell.log"
```

### Approval Analytics  
Track approval patterns:
- **Decision history**: See what you've approved/rejected
- **Risk assessment**: Understand why commands are flagged
- **Performance metrics**: Average approval time, success rates

---

## 🐛 Troubleshooting

### Browser Won't Open for Approvals
- Check default browser settings
- Try manually visiting the approval URL shown in Claude's response
- Ensure localhost connections aren't blocked

### "Command not allowed"
- Verify the command is in your `allowedCommands` config
- Check that arguments match the `allowedArgs` or `argPatterns`
- Ensure the command exists on your system

### "Working directory not allowed"  
- Confirm directory is within your `projectRoots`
- Check `MCP_SHELL_START_DIRECTORY` points to correct location
- Verify directory permissions

### Approval Timeouts
- Default approval timeout is 5 minutes
- Check if browser window closed accidentally
- Verify approval server is still running

---

## 🎯 Best Practices

### Security
- ✅ **Review approval requests carefully** - understand what will be executed
- ✅ **Use project-specific configs** - tailor permissions to each project
- ✅ **Enable logging** - track command history for debugging
- ✅ **Regular config reviews** - ensure permissions match current needs

### Performance  
- ✅ **Set appropriate timeouts** - longer for build commands, shorter for quick operations
- ✅ **Limit concurrent commands** - prevent system overload
- ✅ **Use streaming for long operations** - better user experience

### Development Workflow
- ✅ **Start with restrictive config** - add permissions as needed
- ✅ **Test approval workflow** - ensure browser integration works
- ✅ **Document custom commands** - help team understand permissions

---

## 📚 What's New in This Version

### 🛡️ Interactive Approval System
- **Browser-based approval interface** with risk assessment
- **Real-time updates** via Server-Sent Events  
- **Keyboard shortcuts** for faster decisions
- **Mobile-friendly** responsive design

### ⚡ Enhanced Command Execution
- **Async job queue** for long-running commands
- **Real-time output streaming** with progress indicators
- **Process management** with kill capabilities
- **Comprehensive logging** with rotation support

### 🔧 Improved Configuration
- **Template-based setup** for common development stacks
- **Environment variable overrides** for easy customization
- **Validation and error reporting** for configuration issues

---

## 🤝 Contributing

We welcome contributions! Areas of focus:

- **Risk assessment improvements** - better command risk scoring
- **UI enhancements** - approval interface improvements  
- **New command templates** - support for more development tools
- **Security features** - additional validation and protection

## 📄 License

BSD-3-Clause License - see [LICENSE](LICENSE) file for details.

## 🙏 Credits

Built by Tim Wheeler in collaboration with Claude (Anthropic). 
From the [Utaba AI](https://utaba.ai) open source community.

---

**Ready to give Claude secure command-line superpowers?**

```bash
npm install -g utaba-community-shell
```

**Happy AI-powered development!** 🚀🤖✨
