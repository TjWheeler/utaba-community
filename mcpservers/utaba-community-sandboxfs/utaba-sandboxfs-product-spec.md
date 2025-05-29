# Utaba Community Sandbox FS - Product Specification

## Overview

The Utaba Community Sandbox FS is a Model Context Protocol (MCP) server that provides secure, sandboxed file system access for AI assistants. It enables AI models to safely read, write, and manage files within a controlled environment with configurable security policies and resource limits.

## Core Requirements

### System Architecture

| ID | Requirement | Description |
|---|---|---|
| REQ1 | MCP Protocol Implementation | Server must implement the Model Context Protocol using the `@modelcontextprotocol/sdk` library for communication with AI assistants |
| REQ2 | TypeScript Implementation | Solution must be built using TypeScript with strict type checking enabled |
| REQ3 | ES Module Support | Project must use ES modules with proper import/export syntax including `.js` extensions |
| REQ4 | Node.js Compatibility | Must support Node.js version 18.0.0 or higher |
| REQ5 | Cross-Platform Support | Must work on Windows, Linux, and macOS operating systems |
| REQ6 | stdio Transport | Must use standard input/output (stdio) for MCP communication |

### Security Features

| ID | Requirement | Description |
|---|---|---|
| REQ7 | Path Traversal Protection | All file paths must be validated to prevent access outside the designated sandbox directory using path resolution and validation |
| REQ8 | Sandbox Root Isolation | All operations must be confined to a configurable sandbox root directory |
| REQ9 | Filename Validation | Filenames must be validated against invalid characters, reserved names, and suspicious patterns |
| REQ10 | Type Checking | All path and filename parameters must be runtime type-checked to ensure they are strings |
| REQ11 | Hidden File Protection | Hidden files (starting with `.`) must be blocked by default, except for system files like `.mcp-quota.json` |
| REQ12 | Case-Insensitive Path Validation | On Windows, path validation must use case-insensitive comparison |

### File Extension Management

| ID | Requirement | Description |
|---|---|---|
| REQ13 | Extension Whitelist | Support optional whitelist of allowed file extensions via `allowedExtensions` configuration |
| REQ14 | Extension Blacklist | Support optional blacklist of blocked file extensions via `blockedExtensions` configuration |
| REQ15 | Dangerous Extension Blocking | Provide optional blocking of common executable extensions (.exe, .dll, .sh, etc.) via `MCP_SANDBOX_BLOCK_DANGEROUS` flag |
| REQ16 | Extension Priority | When both whitelist and blacklist are configured, whitelist takes precedence |
| REQ17 | Extension Validation | All file operations must validate extensions before execution |

### Quota Management

| ID | Requirement | Description |
|---|---|---|
| REQ18 | Storage Quota | Implement configurable total storage quota (default 100MB) tracked across all files |
| REQ19 | Per-File Size Limit | Enforce maximum file size limit (default 10MB) for individual files |
| REQ20 | Persistent Quota Tracking | Store quota usage in `.mcp-quota.json` file within sandbox root |
| REQ21 | Quota Pre-Check | Check quota availability before write operations to prevent exceeding limits |
| REQ22 | Quota Rebuild | Support rebuilding quota data by scanning directory if quota file is corrupted |
| REQ23 | Quota Cleanup | Provide cleanup mechanism to remove quota entries for deleted files |
| REQ24 | Disk Space Validation | Verify sufficient disk space exists for the configured quota using `check-disk-space` package |

### File Operations

| ID | Requirement | Description |
|---|---|---|
| REQ25 | Read File | Support reading files as text (with encoding) or binary (returning base64) |
| REQ26 | Write File | Support creating/overwriting files with text or base64-encoded binary content |
| REQ27 | Append File | Support appending content to existing files with quota tracking |
| REQ28 | Delete File | Support file deletion with configurable permission via `allowDelete` flag |
| REQ29 | List Directory | List directory contents with metadata (size, timestamps) excluding system files |
| REQ30 | Create Directory | Support directory creation with configurable permission via `allowDirectoryOps` flag |
| REQ31 | Delete Directory | Support removing empty directories with proper permission checks |
| REQ32 | Move/Rename | Support moving or renaming files and directories with quota updates |
| REQ33 | Copy File | Support copying files with quota validation for the new copy |
| REQ34 | Check Existence | Provide method to check if a file or directory exists |
| REQ35 | Get File Info | Return detailed metadata about files/directories (size, timestamps, type) |
| REQ36 | Get Quota Status | Return current quota usage, available space, and percentage used |

### Binary File Support

| ID | Requirement | Description |
|---|---|---|
| REQ37 | Binary Operations Flag | Support enabling/disabling binary operations via `allowBinary` configuration |
| REQ38 | Base64 Encoding | Support base64 encoding/decoding for binary file transfer over JSON protocol |
| REQ39 | Binary Detection | Detect binary operations based on encoding parameter and content type |
| REQ40 | Binary Extension Check | Validate binary operations for known binary extensions (.jpg, .png, .pdf, etc.) |

### Configuration

| ID | Requirement | Description |
|---|---|---|
| REQ41 | Environment Variables | Support configuration via environment variables with MCP_SANDBOX_ prefix |
| REQ42 | Default Configuration | Provide sensible defaults for all configuration options |
| REQ43 | Sandbox Root Config | Configure sandbox location via `MCP_SANDBOX_ROOT` (default: ~/mcp-sandbox) |
| REQ44 | Quota Configuration | Configure quota via `MCP_SANDBOX_QUOTA` in bytes |
| REQ45 | Max File Size Config | Configure per-file limit via `MCP_SANDBOX_MAX_FILE_SIZE` in bytes |
| REQ46 | Operation Permissions | Configure delete and directory operations via boolean flags |
| REQ47 | Extension Lists | Support comma-separated lists for allowed/blocked extensions |
| REQ48 | Config Validation | Validate all configuration values on startup with clear error messages |

### Error Handling

| ID | Requirement | Description |
|---|---|---|
| REQ49 | Custom Error Types | Implement `SecurityError` and `QuotaError` custom error classes |
| REQ50 | MCP Error Mapping | Convert internal errors to appropriate MCP error codes |
| REQ51 | Descriptive Messages | Provide clear, actionable error messages for all failure scenarios |
| REQ52 | Safe Error Messages | Never expose system paths or sensitive information in error messages |

### MCP Integration

| ID | Requirement | Description |
|---|---|---|
| REQ53 | Tool Discovery | Implement ListToolsRequestSchema handler to expose available tools |
| REQ54 | Tool Execution | Implement CallToolRequestSchema handler to execute file operations |
| REQ55 | Tool Metadata | Provide complete JSON Schema for each tool's input parameters |
| REQ56 | Response Format | Return all responses as TextContent with appropriate formatting |
| REQ57 | Server Metadata | Expose server name and version via MCP server configuration |

### Logging and Monitoring

| ID | Requirement | Description |
|---|---|---|
| REQ58 | Startup Logging | Log configuration details on server startup to stderr |
| REQ59 | Error Logging | Log errors to stderr for debugging while keeping stdout clean for MCP |
| REQ60 | Quota Tracking | Maintain audit trail of file operations in quota tracking file |

