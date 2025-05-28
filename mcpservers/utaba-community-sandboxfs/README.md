# Utaba Community Sandbox FS

A secure MCP (Model Context Protocol) server that provides sandboxed file system access for AI assistants like Claude.

## Features

- 🔒 **Secure sandboxing** - All operations confined to designated directory
- 📊 **Quota management** - Configurable storage limits
- 🚫 **Path traversal protection** - Prevents access outside sandbox
- 📝 **File type restrictions** - Whitelist/blacklist extensions
- 🔄 **Binary file support** - Read/write binary data with base64 encoding
- ⚙️ **Highly configurable** - Environment variables for all settings

## Installation

### Prerequistes

Node.js (version 18 or higher) - This includes:

node - The JavaScript runtime
npm - Package manager
npx - Package runner (comes with npm 5.2+)

```bash
npm install -g utaba-community-sandboxfs
```

# Integration with an LLM

Integrate with the LLM of your choice.  

### Claude Desktop
Here's how to integrate it with Claude Desktop:

Edit the config file at:
Windows: `Edit: %APPDATA%\Claude\claude_desktop_config.json`
macOS: `Edit: ~/Library/Application Support/Claude/claude_desktop_config.json`
Linux: `Edit: ~/.config/claude/claude_desktop_config.json`

Add this to the mcpServers section:
```json
{
  "mcpServers": {
    "sandbox-fs": {
      "command": "npx",
      "args": ["utaba-community-sandboxfs"],
      "env": {
        "MCP_SANDBOX_ROOT": "C:\\Users\\YourName\\ai-sandbox",
        "MCP_SANDBOX_QUOTA": "104857600",
        "MCP_SANDBOX_ALLOWED_EXTENSIONS": ".txt,.json,.csv,.md",
        "MCP_SANDBOX_BLOCK_DANGEROUS": "true"
      }
    }
  }
}
```
# Security Features

Path Traversal Protection: All paths are validated to prevent ../ attacks
Extension Filtering: Control allowed file types
Quota Enforcement: Prevent excessive storage use
Binary Control: Optional binary file restrictions
Operation Permissions: Granular control over delete/directory operations


# Available Tools in MCP Server

get_quota_status - Check storage usage
list_directory - List files and folders
read_file - Read file contents (text or binary)
write_file - Create or overwrite files
append_file - Add content to existing files
delete_file - Remove files
create_directory - Make new folders
delete_directory - Remove empty folders
move_file - Move or rename files/folders
copy_file - Duplicate files
exists - Check if path exists
get_file_info - Get file metadata

# Development 

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Run tests (when implemented)
npm test
```
## Development Claude Config

```json
{
  "mcpServers": {
    "sandbox-fs": {
      "command": "node",
      "args": ["C:\\path\\to\\utaba-community-sandboxfs\\dist\\index.js"],
      "env": {
        "MCP_SANDBOX_ROOT": "C:\\Users\\YourUsername\\mcp-sandbox",
        "MCP_SANDBOX_QUOTA": "104857600",
        "MCP_SANDBOX_MAX_FILE_SIZE": "10485760",
        "MCP_SANDBOX_ALLOW_DELETE": "true",
        "MCP_SANDBOX_ALLOW_DIRECTORY_OPS": "true",
        "MCP_SANDBOX_ALLOW_BINARY": "true",
        "MCP_SANDBOX_ALLOWED_EXTENSIONS": ".txt,.json,.csv,.md,.xml,.yaml,.log",
        "MCP_SANDBOX_BLOCK_DANGEROUS": "true"
      }
    }
  }
}
```

## Build and test the server:

### Configuration

```powershell
# Windows PowerShell
$env:MCP_SANDBOX_ROOT = "D:\ai-workspace"
$env:MCP_SANDBOX_QUOTA = "524288000"  # 500MB
$env:MCP_SANDBOX_ALLOWED_EXTENSIONS = ".txt,.json,.csv,.md"
$env:MCP_SANDBOX_BLOCK_DANGEROUS = "true"
```

```bash
# Linux/macOS
export MCP_SANDBOX_ROOT="/home/user/ai-workspace"
export MCP_SANDBOX_QUOTA="524288000"
export MCP_SANDBOX_ALLOWED_EXTENSIONS=".txt,.json,.csv,.md"
export MCP_SANDBOX_BLOCK_DANGEROUS="true"
```

```powershell
# Build the TypeScript
npm run build

# Test it directly
node dist/index.js
```

# Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.