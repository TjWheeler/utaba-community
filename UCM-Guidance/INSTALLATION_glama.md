# UCM Installation Guide

## Prerequisites

- Node.js 18+ installed
- Claude Desktop or Claude Code
- Internet connection

## Step-by-Step Installation

### 1. Get Your UCM Auth Token

1. Go to [ucm.utaba.ai](https://ucm.utaba.ai)
2. Create an account or sign in
3. Navigate to **Profile > API Tokens**
4. Click **Generate New Token**
5. Copy the token (format: `1234567890:abc123def456...`)

### 2. Test the MCP Server

Before configuring Claude, test that everything works:

```bash
npx ucm-mcp-server --auth-token YOUR_AUTHOR_ID:YOUR_TOKEN
```

You should see output like:
```
UCM MCP Server starting...
Connected to UCM API at https://ucm.utaba.ai
Server ready on port 3001
```

Press `Ctrl+C` to stop the test.

### 3. Configure Claude Desktop

1. **Find your Claude Desktop config file:**
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Edit the config file** (create it if it doesn't exist):
   ```json
   {
     "mcpServers": {
       "ucm": {
         "command": "npx",
         "args": [
           "ucm-mcp-server",
           "--auth-token",
           "YOUR_AUTHOR_ID:YOUR_TOKEN"
         ]
       }
     }
   }
   ```

3. **Replace** `YOUR_AUTHOR_ID:YOUR_TOKEN` with your actual token

4. **Save the file**

### 4. Configure Claude Code (Alternative)

If you use Claude Code instead:

```bash
claude mcp add ucm npx -- ucm-mcp-server --auth-token YOUR_AUTHOR_ID:YOUR_TOKEN
```

### 5. Restart Claude

1. **Completely close** Claude Desktop/Code
2. **Restart** the application
3. **Start a new conversation**

### 6. Verify Installation

In a new Claude conversation, ask:

```
"Run the UCM health check"
```

You should see a response confirming the connection is working.

## Troubleshooting

### Token Issues

**Error: "Authentication failed"**
- Double-check your token format: `author_id:token_key`
- Verify the token is active on ucm.utaba.ai
- Make sure there are no extra spaces or characters

### Installation Issues

**Error: "npx command not found"**
- Install Node.js from [nodejs.org](https://nodejs.org)
- Restart your terminal/command prompt

**Error: "Server failed to start"**
- Check your internet connection
- Verify ucm.utaba.ai is accessible
- Try running the test command again

### Claude Configuration Issues

**Claude doesn't see UCM tools**
- Verify the config file path is correct
- Check JSON syntax (use a JSON validator)
- Restart Claude completely
- Check Claude's MCP server logs

### Getting the Config File Path

**Windows:**
```cmd
echo %APPDATA%\Claude\claude_desktop_config.json
```

**macOS/Linux:**
```bash
echo ~/.config/Claude/claude_desktop_config.json
```

## Advanced Configuration

### Custom UCM URL
If you're using a private UCM instance:
```json
{
  "mcpServers": {
    "ucm": {
      "command": "npx",
      "args": [
        "ucm-mcp-server",
        "--auth-token", "YOUR_TOKEN",
        "--ucm-url", "https://your-ucm-instance.com"
      ]
    }
  }
}
```

### Debug Mode
For troubleshooting, enable debug logging:
```json
{
  "mcpServers": {
    "ucm": {
      "command": "npx",
      "args": [
        "ucm-mcp-server",
        "--auth-token", "YOUR_TOKEN",
        "--log-level", "DEBUG"
      ]
    }
  }
}
```

### Multiple Authors
To access multiple UCM author namespaces:
```json
{
  "mcpServers": {
    "ucm": {
      "command": "npx",
      "args": [
        "ucm-mcp-server",
        "--auth-token", "YOUR_TOKEN",
        "--trusted-authors", "utaba,author2,author3"
      ]
    }
  }
}
```

## Success!

Once installed, you can:
- Ask Claude to show you available UCM content
- Search for patterns and implementations
- Publish your own reusable components
- Explore the Utaba public pattern library

See the [Quickstart Guide](QUICKSTART.md) for your first steps with UCM.
