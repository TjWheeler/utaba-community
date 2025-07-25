# UCM - Universal Context Manager

AI-native package management system for micro-block architecture patterns, implementations, and commands.

## What is UCM?

UCM enables AI developers to:
- **Discover reusable micro-block commands** through semantic search
- **Compose complex workflows** from simple components  
- **Share commands** with rich metadata and versioning
- **Trust code** through community reviews and automated scanning

## Installation

### NPM Package Installation

You can install and run the UCM MCP server directly using npx:

```bash
npx ucm-mcp-server --auth-token YOUR_AUTH_TOKEN
```

Or install globally:

```bash
npm install -g ucm-mcp-server
ucm-mcp-server --auth-token YOUR_AUTH_TOKEN
```

### Getting an Auth Token

1. Visit [ucm.utaba.ai](https://ucm.utaba.ai) to create your account
2. Navigate to your profile settings to generate an API token
3. Use the token format: `author_id:token_key`

## Claude Desktop Integration

Add to your Claude Desktop MCP configuration (`claude_desktop_config.json`):

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

## Claude Code Integration

For Claude Code users:

```bash
claude mcp add ucm npx -- ucm-mcp-server --auth-token YOUR_AUTHOR_ID:YOUR_TOKEN
```

## Available MCP Tools

Once connected, Claude will have access to these UCM tools:

- `mcp_ucm_health_check` - Check system connectivity
- `mcp_ucm_quickstart` - Get UCM usage guide
- `mcp_ucm_get_artifact` - Retrieve artifacts with content
- `mcp_ucm_get_chunk` - Get chunked content for large artifacts
- `mcp_ucm_publish_artifact` - Publish new artifacts
- `mcp_ucm_list_artifacts` - Browse artifacts by namespace
- `mcp_ucm_delete_artifact` - Delete artifacts
- `mcp_ucm_get_artifact_versions` - List artifact versions

## Core Concepts

### Namespace Structure
All UCM artifacts follow this path pattern:
```
{author}/{repository}/{category}/{subcategory}/{filename}[@version]
```

### Categories
- **commands** - Single-purpose, contract-driven operations
- **services** - Business logic and data access layers  
- **patterns** - Architecture and design patterns
- **implementations** - Technology-specific implementations
- **contracts** - interfaces and schemas
- **guidance** - Documentation and best practices

## Quick Start

1. **Install the MCP server** using the commands above
2. **Run the quickstart guide** in Claude: Ask Claude to run `mcp_ucm_quickstart`
3. **Explore public patterns**: Browse `utaba/main` for production-ready patterns
4. **Start building**: Discover existing components before building new ones

## Examples

### Discover Available Content
```
Ask Claude: "Show me what's available in UCM"
Claude will run: mcp_ucm_get_author_index with your author ID
```

### Browse Patterns
```
Ask Claude: "Show me architecture patterns in UCM"
Claude will run: mcp_ucm_list_artifacts with path "utaba/main/patterns"
```

### Get Specific Implementation
```
Ask Claude: "Get the user authentication command from UCM"
Claude will search and retrieve relevant artifacts
```

## MCP Server Parameters

- `--auth-token <token>` - Your UCM authentication token (required)
- `--ucm-url <url>` - UCM API base URL (default: https://ucm.utaba.ai)
- `--port <port>` - Server port (default: 3001)
- `--log-level <level>` - Log level (default: ERROR)
- `--trusted-authors <authors>` - Comma-separated list of trusted authors

## Troubleshooting

### Authentication Issues
1. Verify your auth token format: `author_id:token_key`
2. Check token permissions on ucm.utaba.ai
3. Ensure UCM service is accessible

### Connection Issues
1. Check internet connectivity
2. Verify UCM service status at ucm.utaba.ai
3. Run `mcp_ucm_health_check` in Claude

## Support

- **Documentation**: [ucm.utaba.ai](https://ucm.utaba.ai)
- **Issues**: Create an issue in this repository
- **Community**: Join our community discussions

## License

Commercial license. See [ucm.utaba.ai](https://ucm.utaba.ai) for terms.
