# Utaba MCP Shell - Workflow Approvals Feature
# Author: https://utaba.ai

## Overview

The Workflow Approvals feature extends the Utaba MCP Shell with an interactive confirmation gateway for high-risk commands, specifically `npx` operations. This feature addresses the security gap where `npx` commands can execute arbitrary packages from the npm registry without user oversight, potentially introducing malicious code into the development environment.

The feature implements a browser-based approval interface that pauses command execution, presents the user with detailed command information, and requires explicit approval before proceeding. This maintains the convenience of AI-assisted development while adding a critical security checkpoint for potentially dangerous operations.

**Primary Goal**: Provide human oversight for `npx` commands while maintaining seamless workflow integration and building foundation for expanded approval workflows.

## Security Enhancement & Trust Model

**This feature enhances the existing trusted development environment model by:**

- **Adding human oversight for arbitrary package execution** through `npx` command interception
- **Providing visibility into command context** including working directory, package names, and risk assessment
- **Creating audit trail** of all approval decisions for security review
- **Maintaining atomicity** - commands either complete successfully after approval or fail cleanly
- **Building foundation** for expanded approval workflows (git operations, file system changes, etc.)

**Enhanced Security Benefits:**
- Prevents accidental execution of malicious or unintended packages
- Provides opportunity to review package sources and reputations before execution
- Creates decision checkpoint that can be logged and audited
- Allows for team-based approval workflows in shared development environments

## Core Requirements

### Approval Gateway

| ID | Requirement | Description |
|---|---|---|
| REQ1 | Command Interception | Detect and intercept `npx` commands before execution |
| REQ2 | File-Based Queue | Implement robust file-based approval queue system |
| REQ3 | Browser UI Launch | Automatically launch browser interface for pending approvals |
| REQ4 | Real-time Updates | Provide live updates of approval queue status |
| REQ5 | Approval Persistence | Maintain approval/rejection decisions with audit trail |

### User Interface

| ID | Requirement | Description |
|---|---|---|
| REQ6 | Command Details Display | Show full command, working directory, package information |
| REQ7 | Risk Assessment | Provide automated risk scoring based on package analysis |
| REQ8 | Batch Operations | Support approve/reject multiple commands efficiently |
| REQ9 | Mobile Responsive | Ensure UI works on mobile devices for remote approvals |
| REQ10 | Accessibility | Meet WCAG 2.1 AA standards for accessibility |

### Process Management

| ID | Requirement | Description |
|---|---|---|
| REQ11 | Timeout Handling | Auto-reject commands after configurable timeout period |
| REQ12 | Process Cleanup | Clean up pending processes when commands are rejected |
| REQ13 | Atomic Operations | Ensure approval decisions are atomic and cannot be lost |
| REQ14 | Recovery Mechanisms | Handle approval server crashes gracefully |
| REQ15 | Multi-Instance Support | Support multiple shell instances with shared approval server |

## Technical Architecture

### Technology Stack
- **Backend**: Node.js 18+ with Express/Fastify for approval server
- **Frontend**: Vanilla JavaScript with Server-Sent Events for real-time updates
- **Communication**: File-based queue system with JSON manifests
- **Security**: Localhost-only binding with optional token authentication
- **Integration**: Extends existing MCP Shell architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Shell     │    │ Approval Queue  │    │ Browser UI      │
│   Tool          │───▶│ File System     │◀───│ Interface       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │
                       ┌─────────────────┐
                       │ Approval Server │
                       │ (Express/SSE)   │
                       └─────────────────┘
```

### File-Based Queue Structure
```
approval-queue/
├── pending/
│   ├── {timestamp}-{hash}.json    # Pending approval requests
│   └── manifest.json              # Queue metadata
├── approved/
│   └── {timestamp}-{hash}.json    # Approved commands (audit trail)
├── rejected/
│   └── {timestamp}-{hash}.json    # Rejected commands (audit trail)
└── config/
    ├── server.json                # Approval server configuration
    └── risk-rules.json            # Risk assessment rules
```

### Integration Points
- **MCP Shell Integration**: Command interceptor hooks into existing execution pipeline
- **File System**: Shared approval queue accessible by shell tool and browser server
- **Browser Interface**: Local HTTP server with WebSocket/SSE for real-time updates
- **Logging**: Integration with existing Winston logging system

## Functional Specifications

### Core Workflow

1. **Command Detection**: MCP Shell detects `npx` command execution request
2. **Queue Creation**: Create approval request in `pending/` directory with command details
3. **Server Launch**: Launch approval server if not already running, open browser tab
4. **User Interaction**: User reviews command details and makes approval decision
5. **Execution**: On approval, execute command normally; on rejection, return error
6. **Audit Trail**: Move completed requests to `approved/` or `rejected/` directories

### Approval Request Format
```typescript
interface ApprovalRequest {
  id: string;                    // Unique request identifier
  timestamp: string;             // ISO timestamp of request
  command: string;               // Command being executed (npx)
  args: string[];               // Command arguments
  workingDirectory: string;      // Execution context
  packageName?: string;          // Extracted package name for npx
  riskScore: number;            // Automated risk assessment (1-10)
  riskFactors: string[];        // Specific risk indicators
  requestedBy: string;          // MCP client identifier
  timeout: number;              // Timeout in milliseconds
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
}
```

### Browser Interface Features

#### Dashboard View
- **Queue Summary**: Count of pending, approved, rejected commands
- **Recent Activity**: Timeline of recent approval decisions
- **Risk Metrics**: Statistics on command risk patterns

#### Approval Interface
- **Command Details**: Full command with syntax highlighting
- **Context Information**: Working directory, project name, git branch
- **Package Analysis**: Package reputation, download stats, last updated
- **Risk Assessment**: Automated scoring with detailed risk factors
- **Decision Actions**: Large approve/reject buttons with keyboard shortcuts

#### Audit Trail
- **Search/Filter**: Find specific commands or approval patterns
- **Export**: Download approval history for compliance or analysis
- **Statistics**: Approval rates, response times, risk distribution

## Non-Functional Requirements

### Performance
- **Approval Latency**: < 2 seconds from command detection to browser UI display
- **Server Startup**: Approval server startup < 5 seconds
- **UI Responsiveness**: < 100ms response to user interactions
- **Queue Processing**: Handle up to 50 concurrent approval requests

### Usability
- **Zero Configuration**: Work out-of-the-box with sensible defaults
- **Clear Communication**: Obvious risk indicators and approval implications
- **Fast Decision Making**: Keyboard shortcuts, batch operations, smart defaults
- **Mobile Support**: Full functionality on mobile devices

### Security
- **Local Only**: Approval server binds only to localhost
- **No Remote Access**: No external network access or remote approval capabilities
- **Token Protection**: Optional token-based authentication for approval server
- **Audit Integrity**: Tamper-evident audit trail with checksums

### Reliability
- **Server Recovery**: Auto-restart approval server on crashes
- **Queue Persistence**: Approval queue survives system restarts
- **Timeout Handling**: Graceful timeout with cleanup of pending processes
- **Error Recovery**: Clear error messages and recovery guidance

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] File-based approval queue implementation
- [ ] Command detection and interception in MCP Shell
- [ ] Basic approval server with HTTP API
- [ ] Simple HTML approval interface

### Phase 2: Enhanced UI (Week 2)
- [ ] Real-time updates with Server-Sent Events
- [ ] Risk assessment algorithm and display
- [ ] Mobile-responsive design
- [ ] Keyboard shortcuts and batch operations

### Phase 3: Advanced Features (Week 3)
- [ ] Package reputation analysis
- [ ] Audit trail search and export
- [ ] Configuration management UI
- [ ] Performance optimization and error handling

### Phase 4: Integration & Polish (Week 4)
- [ ] Full MCP Shell integration testing
- [ ] Documentation and user guides
- [ ] Security review and penetration testing
- [ ] Performance benchmarking and optimization

## Configuration Options

### Approval Server Settings
```typescript
interface ApprovalServerConfig {
  port: number;                 // Server port (default: auto-assigned)
  autoLaunch: boolean;         // Auto-launch browser (default: true)
  timeout: number;             // Default approval timeout (default: 300000ms)
  enableAuth: boolean;         // Enable token authentication
  logLevel: string;            // Logging level for approval server
  riskThreshold: number;       // Auto-reject threshold (1-10, default: 9)
}
```

### Risk Assessment Rules
```typescript
interface RiskRule {
  pattern: string;             // Command/package pattern to match
  score: number;              // Risk score contribution (1-10)
  description: string;        // Human-readable risk explanation
  autoReject?: boolean;       // Automatically reject without user input
}
```

## Success Criteria

### Acceptance Criteria
- [ ] `npx` commands are intercepted and require approval before execution
- [ ] Browser UI launches automatically and displays command details clearly
- [ ] Approval/rejection decisions are processed within 2 seconds
- [ ] Audit trail maintains complete history of all approval decisions
- [ ] Mobile interface allows approvals from phones/tablets
- [ ] System recovers gracefully from approval server crashes

### Quality Gates
- [ ] Zero false positives - legitimate commands are not incorrectly flagged
- [ ] Sub-second UI response times for all approval interactions
- [ ] Complete audit trail with no missing approval decisions
- [ ] Mobile UI passes usability testing on iOS and Android
- [ ] Security review confirms no remote access vulnerabilities

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Approval fatigue leading to rubber-stamp approvals | High | Medium | Smart risk scoring, batch operations, clear risk communication |
| Browser UI not launching on headless systems | Medium | Low | Fallback to CLI approval mode, configuration detection |
| File-based queue corruption or loss | Medium | Low | Atomic file operations, backup mechanisms, queue validation |
| Performance impact on command execution | Low | Medium | Async approval processing, optimized file operations |
| Security bypass through queue manipulation | High | Low | File system permissions, queue integrity checks |

## Future Enhancements

### Planned Extensions
- **Team Approval Workflows**: Multi-user approval requirements for high-risk commands
- **Integration with Git Operations**: Approval gates for git push, merge operations
- **Package Whitelist/Blacklist**: Pre-approved and banned package lists
- **Machine Learning Risk Assessment**: Learn from approval patterns to improve risk scoring
- **IDE Integration**: Native VS Code extension for in-editor approvals

### API Extensibility
- **Plugin System**: Allow custom risk assessment plugins
- **Webhook Support**: Integrate with external security tools and notifications
- **Configuration Management**: Import/export approval policies across teams
- **Metrics Integration**: Export approval metrics to monitoring systems

## Testing Strategy

### Unit Testing
- **Queue Operations**: File-based queue manipulation and integrity
- **Risk Assessment**: Risk scoring algorithm accuracy and consistency
- **Command Interception**: Proper detection and handling of target commands
- **Server Management**: Approval server lifecycle and error handling

### Integration Testing
- **End-to-End Workflow**: Complete approval cycle from command to execution
- **Browser Interface**: UI functionality across different browsers and devices
- **MCP Protocol**: Integration with existing MCP Shell functionality
- **Multi-Instance**: Multiple shell instances sharing approval server

### Security Testing
- **Queue Tampering**: Attempts to bypass approval through file manipulation
- **Server Security**: Local-only access enforcement and token validation
- **Injection Attacks**: Command injection through approval interface
- **Privilege Escalation**: Attempts to gain elevated privileges through approval system

### Usability Testing
- **Approval Speed**: Time-to-decision measurements across different user types
- **Mobile Experience**: Approval workflow on various mobile devices
- **Error Recovery**: User experience during system failures and edge cases
- **Decision Clarity**: User comprehension of risk factors and approval implications

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2025-05-31 | Development Team | Initial specification for workflow approvals feature |

