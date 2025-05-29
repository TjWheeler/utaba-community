# Utaba MCP Shell - Product Specification

## Overview

The Utaba MCP Shell is a controlled command execution MCP server that provides development workflow automation for Claude Desktop and other MCP clients. It enables execution of whitelisted development commands (npm, TypeScript, linting, testing) within trusted project environments. This solves the limitation of Claude Desktop's inability to directly execute system commands while acknowledging the inherent trust requirements of development tooling.

**CRITICAL SECURITY NOTICE**: This tool is designed for trusted development environments only. npm command execution provides full system access and cannot be meaningfully sandboxed. Use only in environments where you trust the project dependencies and development toolchain.

The primary users are software developers working with Claude Desktop who need to integrate automated testing, building, and debugging into their AI-assisted development workflow.

## Security Model & Trust Requirements

**This MCP server operates under a "trusted development environment" security model:**

- **npm command execution inherently provides full system access** through package installation scripts, arbitrary script execution via package.json, and transitive dependency behaviors
- **No true sandboxing is possible** when allowing npm operations - any npm command can potentially execute arbitrary code
- **Intended for development machines** where developers already run these commands manually
- **Command whitelisting provides workflow control, not security isolation**

**Use only in environments where you trust:**
- The project's package.json and all installed dependencies
- The integrity of your npm registry and package sources
- The security of your development machine
- The commands you would normally run manually

This tool trades security isolation for development workflow convenience and should never be used in production or untrusted environments.

## Core Requirements

### Trust & Access Control

| ID | Requirement | Description |
|---|---|---|
| REQ1 | Command Whitelisting | Only pre-approved commands with specific arguments can be executed |
| REQ2 | Working Directory Validation | All commands must execute within approved project directories |
| REQ3 | Parameter Sanitization | All command arguments must be validated against allowed patterns |
| REQ4 | Execution Timeouts | Commands must have configurable timeout limits to prevent hanging processes |
| REQ5 | Trust Documentation | Clear documentation of trust requirements and security limitations |

### Command Execution

| ID | Requirement | Description |
|---|---|---|
| REQ6 | NPM Operations | Support for npm test, npm run [script], npm install (with full understanding of security implications) |
| REQ7 | TypeScript Compilation | Support for tsc --noEmit, tsc --build, and other TypeScript compiler operations |
| REQ8 | Linting & Formatting | Support for eslint, prettier, and other code quality tools |
| REQ9 | Test Framework Integration | Support for Jest, Vitest, and other common test runners |
| REQ10 | Real-time Output | Stream stdout/stderr in real-time for long-running commands |

### Integration & Communication

| ID | Requirement | Description |
|---|---|---|
| REQ11 | MCP Protocol Compliance | Full compliance with MCP specification for tool definitions |
| REQ12 | Structured Response Format | Return exit codes, stdout, stderr, execution time in structured format |
| REQ13 | Configuration Management | Support for project-specific command configurations |
| REQ14 | Error Context | Provide detailed error information including command context and trust warnings |

## Technical Architecture

### Technology Stack
- **Runtime**: Node.js 18+
- **Language**: TypeScript with strict typing
- **Framework/Libraries**: 
  - `@modelcontextprotocol/sdk` for MCP implementation
  - `child_process` for command execution
  - `zod` for input validation
  - `winston` for logging
- **Protocol/Standards**: Model Context Protocol (MCP) v1.0
- **Platform Support**: Cross-platform (Windows, macOS, Linux)

### Integration Points
- **Input/Output**: Standard MCP stdio communication
- **External Dependencies**: Node.js runtime, npm/yarn package managers
- **Configuration**: JSON configuration files, environment variables

## Functional Specifications

### Core Features
1. **Controlled Command Execution**: Execute only whitelisted commands with validated parameters within approved directories
2. **Real-time Process Management**: Stream output, handle timeouts, manage process lifecycle
3. **Configuration-driven Whitelisting**: Flexible configuration system for different project types and workflow requirements
4. **Comprehensive Logging**: Audit trail of all executed commands with context and results

### API/Interface Design
```typescript
// MCP Tool Definition
{
  name: "execute_command",
  description: "Execute a whitelisted development command in a trusted environment",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Command to execute" },
      args: { type: "array", items: { type: "string" } },
      workingDirectory: { type: "string", description: "Working directory path" }
    },
    required: ["command"]
  }
}
```

## Non-Functional Requirements

### Performance
- **Response Time**: Command initiation < 100ms, streaming output < 500ms latency
- **Throughput**: Support concurrent execution of up to 5 commands per project
- **Resource Usage**: < 50MB base memory footprint, CPU usage proportional to executed commands

### Trust & Validation
- **Authentication**: MCP client authentication via stdio channel
- **Authorization**: Project-scoped command access, working directory validation
- **Input Validation**: Sanitize command arguments against injection patterns
- **Process Control**: Directory traversal prevention, timeout enforcement, resource limits

### Reliability
- **Error Handling**: Graceful handling of command failures, process crashes, timeout scenarios
- **Logging**: Winston-based logging with configurable levels, command audit trail
- **Monitoring**: Health checks for MCP server status, command execution metrics

### Scalability
- **Single-instance Design**: One server instance per project, no shared state
- **Resource Limits**: Configurable memory/CPU limits per command, queue management
- **Configuration**: Hot-reloadable configuration without server restart

## Configuration & Deployment

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `UTABA_MCP_SHELL_LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `UTABA_MCP_SHELL_CONFIG_PATH` | `./mcp-shell-config.json` | Path to configuration file |
| `UTABA_MCP_SHELL_MAX_CONCURRENT` | `5` | Maximum concurrent command executions |
| `UTABA_MCP_SHELL_DEFAULT_TIMEOUT` | `30000` | Default command timeout in milliseconds |

### Installation & Setup
1. Install via npm: `npm install -g @utaba/mcp-shell`
2. Generate configuration file: `utaba-mcp-shell init`
3. Review and acknowledge security warnings during setup
4. Configure Claude Desktop to include MCP server in configuration
5. Verify installation: `utaba-mcp-shell test`

## Testing Strategy

### Unit Testing
- Jest framework with >90% code coverage requirement
- Mock child_process for command execution testing
- Test all validation, sanitization, and error handling paths

### Integration Testing
- Real command execution in isolated test environments
- MCP protocol compliance testing with mock clients
- Configuration validation across different project types

### Security Testing
- Validation that whitelisting prevents obviously malicious commands
- Input sanitization testing against common injection patterns
- Working directory boundary testing

## Success Criteria

### Acceptance Criteria
- [ ] Execute npm test/build commands successfully from Claude Desktop
- [ ] Command whitelisting prevents execution of non-approved commands
- [ ] Real-time output streaming works for commands taking >5 seconds
- [ ] Configuration system supports at least 3 different project archetypes
- [ ] Security documentation clearly communicates trust requirements

### Quality Gates
- [ ] All unit tests pass with >90% coverage
- [ ] Input validation prevents basic injection attempts
- [ ] Performance meets specified benchmarks under load
- [ ] Documentation clearly communicates security model and limitations
- [ ] MCP protocol compliance verified with reference client

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Arbitrary code execution via npm dependencies | High | High | **Accepted Risk** - Document trust requirements, target trusted dev environments only |
| Command injection through argument manipulation | Medium | Medium | Input validation, argument sanitization, comprehensive testing |
| Performance degradation with concurrent commands | Medium | Medium | Resource limits, queue management, performance monitoring |
| Configuration complexity overwhelming users | Medium | High | Sensible defaults, project templates, clear documentation |
| False sense of security from "whitelisting" | High | Medium | **Clear documentation** that this is workflow control, not security isolation |

## Future Considerations

### Potential Enhancements
- Docker-based execution for additional isolation (accepting container escape risks)
- Support for custom command plugins and extensions
- Integration with project-specific security policies
- Remote execution capabilities for distributed teams

### Known Limitations
- **No true security sandboxing** - npm execution provides full system access
- Single-instance design limits horizontal scaling
- Command output buffering may impact very large outputs
- Platform-specific commands require separate whitelists
- **Trust model requires secure development environment**

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2025-05-29 | Development Team | Initial specification |
| 1.1 | 2025-05-29 | Development Team | Updated security model to trusted environment approach |

## Approval

| Role | Name | Date | Signature |
|---|---|---|---|
| Product Owner | [Pending] | [Pending] | [Pending] |
| Technical Lead | [Pending] | [Pending] | [Pending] |
| Stakeholder | [Pending] | [Pending] | [Pending] |
