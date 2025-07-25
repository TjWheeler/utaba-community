# UCM Quickstart Guide

## Getting Started with UCM

The Universal Context Manager (UCM) is an AI-friendly repository for managing reusable code components, patterns, and implementations. This guide will help you get started quickly.

## Installation

### Step 1: Install the MCP Server
```bash
npx ucm-mcp-server --auth-token YOUR_AUTH_TOKEN
```

### Step 2: Get Your Auth Token
1. Visit [ucm.utaba.ai](https://ucm.utaba.ai)
2. Create an account or sign in
3. Go to Profile > API Tokens
4. Generate a new token
5. Copy the token (format: `author_id:token_key`)

### Step 3: Configure Claude
Add to your Claude Desktop configuration:
```json
{
  "mcpServers": {
    "ucm": {
      "command": "npx",
      "args": [
        "ucm-mcp-server",
        "--auth-token",
        "YOUR_TOKEN_HERE"
      ]
    }
  }
}
```

## First Steps with UCM

### 1. Check Your Setup
Ask Claude: *"Run the UCM health check"*

Claude will verify your connection and show available tools.

### 2. Explore Available Content
Ask Claude: *"Show me what's available in UCM"*

This gives you an overview of all available patterns, commands, and implementations.

### 3. Browse Public Patterns
Ask Claude: *"Show me the Utaba public patterns"*

Explore production-ready, AI-optimized patterns and implementations.

## Core Concepts

### Namespace Structure
Everything in UCM follows this pattern:
```
author/repository/category/subcategory/filename
```

**Example**: `utaba/main/patterns/micro-block/README.md`

### Categories You'll Find
- **patterns** - Architecture and design patterns
- **implementations** - Technology-specific code examples
- **commands** - Single-purpose operations
- **services** - Business logic components
- **guidance** - Documentation and best practices

## Common Use Cases

### Find Existing Components
Before building anything new, always search first:

*"Search UCM for authentication patterns"*
*"Find database connection implementations"*
*"Show me React component patterns"*

### Get Specific Implementation
*"Get the user registration command from UCM"*
*"Show me the micro-block pattern implementation"*
*"Retrieve the API client service"*

### Publish Your Own Components
*"Publish this function to UCM as a utility command"*
*"Save this pattern to my UCM namespace"*

## Best Practices

### 1. Discovery First
Always search UCM before building new components. You might find exactly what you need already exists.

### 2. Start with Patterns
Look for architectural patterns first, then find specific implementations for your technology stack.

### 3. Use Versioning
When you find components, check if newer versions are available.

### 4. Follow the Micro-Block Architecture
UCM works best with the micro-block pattern - small, focused, reusable components.

## Advanced Features

### Browse by Technology
*"Show me all TypeScript implementations in UCM"*
*"Find Python patterns in the UCM repository"*

### Version Management
*"Get version 2.0.0 of the authentication service"*
*"Show me all versions of this component"*

### Cross-Reference Dependencies
*"Load this pattern and all its dependencies"*

## Troubleshooting

### Common Issues

**"Authentication failed"**
- Check your token format: `author_id:token_key`
- Verify token is active on ucm.utaba.ai

**"Server not responding"**
- Check internet connection
- Verify UCM service status
- Ask Claude to run health check

**"Artifact not found"**
- Check the exact path and spelling
- Browse the category first to see what's available
- Verify you have access permissions

### Getting Help
1. Ask Claude to run `mcp_ucm_quickstart` for this guide
2. Use `mcp_ucm_health_check` to test your connection
3. Browse categories with `mcp_ucm_list_artifacts`

## Next Steps

1. **Explore the Utaba patterns** - Start with proven, production-ready components
2. **Find your tech stack** - Look for implementations in your preferred language/framework  
3. **Start small** - Begin with simple commands and services
4. **Contribute back** - Publish your own reusable components

## Examples

### Getting Started Session
```
You: "Show me what's in UCM"
Claude: [Runs author index, shows available categories]

You: "Show me authentication patterns"
Claude: [Lists auth-related patterns and implementations]

You: "Get the OAuth implementation for Node.js"
Claude: [Retrieves specific implementation with code]

You: "How do I use this in my project?"
Claude: [Explains integration and provides examples]
```

That's it! You're ready to start using UCM for AI-native development.
