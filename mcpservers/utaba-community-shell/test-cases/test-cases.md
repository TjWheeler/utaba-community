# Test Cases for Utaba MCP Shell

## Overview

This document outlines comprehensive test cases for the Utaba Community Shell MCP server. The testing strategy covers security validation, command execution, process management, configuration handling, and integration scenarios.

## Testing Categories

### 1. Security Validation Tests

#### 1.1 Command Whitelisting
| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| `security-001` | Execute whitelisted command (`npm test`) | ✅ Command allowed and executed |
| `security-002` | Execute non-whitelisted command (`rm -rf /`) | ❌ SecurityError with whitelist violation |
| `security-003` | Execute whitelisted command with invalid args | ❌ SecurityError with argument validation failure |
| `security-004` | Execute command with mixed valid/invalid args | ❌ SecurityError on first invalid argument |

#### 1.2 Command Injection Protection
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `security-011` | Command substitution with backticks | `echo \`whoami\`` | ❌ SecurityError - injection detected |
| `security-012` | Command substitution with $() | `echo $(id)` | ❌ SecurityError - injection detected |
| `security-013` | Command chaining with semicolon | `echo test; rm -rf /` | ❌ SecurityError - injection detected |
| `security-014` | Command chaining with pipe | `echo test \| cat` | ❌ SecurityError - injection detected |
| `security-015` | Command chaining with && | `echo test && malicious` | ❌ SecurityError - injection detected |
| `security-016` | Redirection attempts | `echo test > /etc/passwd` | ❌ SecurityError - injection detected |
| `security-017` | Null byte injection | `echo test\x00malicious` | ❌ SecurityError - injection detected |
| `security-018` | Path traversal attempts | `cat ../../../etc/passwd` | ❌ SecurityError - injection detected |
| `security-019` | Environment variable expansion | `echo $HOME` | ❌ SecurityError - injection detected |
| `security-020` | Nested command execution | `eval "echo test"` | ❌ SecurityError - injection detected |

#### 1.3 Working Directory Validation
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `security-031` | Command in project root | `cwd=./` | ✅ Command allowed |
| `security-032` | Command in project subdirectory | `cwd=./src` | ✅ Command allowed |
| `security-033` | Command outside project root | `cwd=/tmp` | ❌ SecurityError - directory not allowed |
| `security-034` | Command with absolute path working dir | `cwd=/home/user/project` | ❌ SecurityError - absolute paths not allowed |
| `security-035` | Command with path traversal in working dir | `cwd=../../../` | ❌ SecurityError - path traversal detected |
| `security-036` | NPM command without package.json | `npm test` in dir without package.json | ❌ SecurityError - no package.json |
| `security-037` | NPM command with package.json | `npm test` in dir with package.json | ✅ Command allowed |

#### 1.4 Environment Variable Sanitization
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `security-041` | Blocked environment variables filtered | `env={HOME: '/home/user'}` | ✅ HOME not passed to command |
| `security-042` | Allowed environment variables passed | `env={NODE_ENV: 'test'}` | ✅ NODE_ENV passed to command |
| `security-043` | Mixed allowed/blocked variables | `env={NODE_ENV: 'test', PATH: '/bin'}` | ✅ Only NODE_ENV passed |
| `security-044` | Empty environment variables | `env={}` | ✅ Default environment used |

### 2. Command Execution Tests

#### 2.1 Basic Command Execution
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `exec-001` | Execute simple echo command | `echo "hello"` | ✅ Returns stdout: "hello" |
| `exec-002` | Execute command with exit code 0 | `echo "success"` | ✅ exitCode: 0, stdout: "success" |
| `exec-003` | Execute command with non-zero exit | `node -e "process.exit(1)"` | ✅ exitCode: 1 |
| `exec-004` | Execute command with stderr output | Command that writes to stderr | ✅ stderr captured |
| `exec-005` | Execute command with both stdout/stderr | Command writing to both | ✅ Both streams captured |

#### 2.2 NPM Commands
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `exec-011` | NPM test execution | `npm test` | ✅ Test suite executed |
| `exec-012` | NPM install execution | `npm install` | ✅ Dependencies installed |
| `exec-013` | NPM build execution | `npm run build` | ✅ Build completed |
| `exec-014` | NPM script with arguments | `npm run test -- --verbose` | ✅ Arguments passed correctly |
| `exec-015` | NPM in different working directory | `npm test` in `./src` | ✅ Command executed in correct directory |

#### 2.3 Git Commands
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `exec-021` | Git status | `git status` | ✅ Repository status returned |
| `exec-022` | Git log with limits | `git log --oneline -5` | ✅ Commit history returned |
| `exec-023` | Git diff | `git diff` | ✅ Changes displayed |
| `exec-024` | Git add files | `git add .` | ✅ Files staged |
| `exec-025` | Git commit | `git commit -m "test"` | ✅ Commit created |

#### 2.4 TypeScript Commands
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `exec-031` | TypeScript compilation check | `tsc --noEmit` | ✅ Type checking completed |
| `exec-032` | TypeScript build | `tsc --build` | ✅ Build completed |
| `exec-033` | TypeScript watch mode | `tsc --watch` (with timeout) | ✅ Watch mode started and stopped |

### 3. Streaming Command Execution Tests

#### 3.1 Real-time Output
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `stream-001` | Stream stdout in real-time | Long-running command with output | ✅ Output chunks received progressively |
| `stream-002` | Stream stderr in real-time | Command with stderr output | ✅ Error chunks received progressively |
| `stream-003` | Stream mixed stdout/stderr | Command writing to both | ✅ Both streams received correctly |
| `stream-004` | Stream command completion | Any streaming command | ✅ Final result matches accumulated output |

#### 3.2 Long-running Operations
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `stream-011` | NPM install with progress | `npm install` (large project) | ✅ Installation progress streamed |
| `stream-012` | Test suite with live output | `npm test` (verbose) | ✅ Test progress streamed |
| `stream-013` | Build process streaming | `npm run build` | ✅ Build steps streamed |

### 4. Process Management Tests

#### 4.1 Process Lifecycle
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `proc-001` | Start and track process | Any command | ✅ Process ID assigned and tracked |
| `proc-002` | List active processes | Multiple concurrent commands | ✅ All active processes listed |
| `proc-003` | Kill specific process | Kill by process ID | ✅ Process terminated |
| `proc-004` | Kill all processes | Kill all command | ✅ All processes terminated |
| `proc-005` | Process cleanup on completion | Command completion | ✅ Process removed from active list |

#### 4.2 Concurrent Execution
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `proc-011` | Execute multiple commands concurrently | 3 simultaneous commands | ✅ All execute within limit |
| `proc-012` | Exceed concurrent command limit | 4+ simultaneous commands | ❌ Error after limit reached |
| `proc-013` | Queue commands when at limit | Commands beyond limit | ✅ Commands queued or rejected appropriately |

#### 4.3 Timeout Handling
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `proc-021` | Command timeout (graceful) | Long-running command with timeout | ✅ SIGTERM sent, process terminated |
| `proc-022` | Command timeout (force kill) | Command ignoring SIGTERM | ✅ SIGKILL sent after grace period |
| `proc-023` | Custom timeout per command | Command with custom timeout | ✅ Custom timeout respected |
| `proc-024` | Default timeout application | Command without custom timeout | ✅ Default timeout used |

### 5. Configuration Tests

#### 5.1 Configuration Loading
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `config-001` | Load default configuration | No config file | ✅ Default config loaded |
| `config-002` | Load custom configuration | Custom config file | ✅ Custom settings applied |
| `config-003` | Load configuration with env vars | Environment variables set | ✅ Env vars override config |
| `config-004` | Invalid configuration file | Malformed JSON config | ❌ Configuration error |
| `config-005` | Missing configuration file | Non-existent config path | ✅ Falls back to defaults |

#### 5.2 Template Selection
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `config-011` | NodeJS template | Template: 'nodejs' | ✅ Full development commands available |
| `config-012` | Minimal template | Template: 'minimal' | ✅ Only basic commands available |
| `config-013` | Custom template | Custom template definition | ✅ Custom commands configured |

#### 5.3 Environment Variable Configuration
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `config-021` | Start directory from env | `MCP_SHELL_START_DIRECTORY` | ✅ Working directory set correctly |
| `config-022` | Config path from env | `MCP_SHELL_CONFIG_PATH` | ✅ Custom config loaded |
| `config-023` | Logging config from env | `LOG_LEVEL`, `LOG_FILE` | ✅ Logging configured |
| `config-024` | Invalid env var values | Invalid timeout value | ❌ Configuration validation error |

### 6. Logging Tests

#### 6.1 Log Output
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `log-001` | Command execution logging | Any command | ✅ Execution logged with details |
| `log-002` | Security validation logging | Blocked command | ✅ Security decision logged |
| `log-003` | Process lifecycle logging | Process start/stop | ✅ Lifecycle events logged |
| `log-004` | Error logging | Command failure | ✅ Error details logged |

#### 6.2 Log Levels
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `log-011` | Debug level logging | `LOG_LEVEL=debug` | ✅ Debug messages included |
| `log-012` | Info level logging | `LOG_LEVEL=info` | ✅ Info and above logged |
| `log-013` | Warn level logging | `LOG_LEVEL=warn` | ✅ Warnings and errors only |
| `log-014` | Error level logging | `LOG_LEVEL=error` | ✅ Errors only |

#### 6.3 Log Rotation
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `log-021` | Log file rotation | Large log file | ✅ File rotated when size exceeded |
| `log-022` | Multiple backup files | Multiple rotations | ✅ Backup files maintained |
| `log-023` | Log file cleanup | Exceed backup limit | ✅ Old files deleted |

### 7. Integration Tests

#### 7.1 MCP Protocol Integration
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `integ-001` | Tool discovery | List available tools | ✅ All tools listed correctly |
| `integ-002` | Tool execution via MCP | Execute command via MCP | ✅ Command executed, result returned |
| `integ-003` | Streaming via MCP | Stream command via MCP | ✅ Output streamed correctly |
| `integ-004` | Error handling via MCP | Invalid command via MCP | ❌ Error returned in MCP format |

#### 7.2 Claude Desktop Integration
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `integ-011` | Claude command execution | Claude requests command | ✅ Command executed successfully |
| `integ-012` | Claude streaming commands | Claude requests streaming | ✅ Output streamed to Claude |
| `integ-013` | Claude error handling | Claude sends invalid command | ❌ Error reported to Claude |
| `integ-014` | Claude concurrent operations | Multiple Claude requests | ✅ Handled within limits |

#### 7.3 File System Integration
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `integ-021` | Package.json detection | NPM commands | ✅ package.json required and found |
| `integ-022` | Git repository detection | Git commands | ✅ Git repository operations work |
| `integ-023` | TypeScript project detection | TypeScript commands | ✅ tsconfig.json used if available |
| `integ-024` | Multi-project support | Commands in different projects | ✅ Each project isolated correctly |

### 8. Performance Tests

#### 8.1 Execution Performance
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `perf-001` | Command execution speed | Simple commands | ✅ Under 100ms overhead |
| `perf-002` | Concurrent command performance | Multiple commands | ✅ No significant slowdown |
| `perf-003` | Large output handling | Commands with large output | ✅ Memory usage stable |
| `perf-004` | Long-running command handling | Commands running > 1 minute | ✅ No memory leaks |

#### 8.2 Resource Management
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `perf-011` | Memory usage monitoring | Extended operation | ✅ Memory usage stable |
| `perf-012` | CPU usage monitoring | CPU-intensive commands | ✅ CPU usage appropriate |
| `perf-013` | File handle management | Many file operations | ✅ File handles cleaned up |

### 9. Error Handling Tests

#### 9.1 Command Errors
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `error-001` | Non-existent command | `invalidcommand` | ❌ Command not found error |
| `error-002` | Command with invalid arguments | `npm invalidarg` | ❌ Command execution error |
| `error-003` | Command timeout | Long command with short timeout | ❌ Timeout error |
| `error-004` | Process kill during execution | Kill command mid-execution | ❌ Process killed error |

#### 9.2 System Errors
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `error-011` | Insufficient permissions | Command requiring elevated permissions | ❌ Permission error |
| `error-012` | Working directory not found | Non-existent working directory | ❌ Directory error |
| `error-013` | Environment setup failure | Invalid environment configuration | ❌ Environment error |

#### 9.3 Recovery Tests
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `error-021` | Recovery from command failure | Failed command followed by success | ✅ System continues normally |
| `error-022` | Recovery from process crash | Process crash during execution | ✅ System cleanup and continues |
| `error-023` | Recovery from timeout | Timeout recovery | ✅ Process cleaned up properly |

### 10. Edge Cases

#### 10.1 Input Edge Cases
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `edge-001` | Empty command | `""` | ❌ Invalid command error |
| `edge-002` | Command with only spaces | `"   "` | ❌ Invalid command error |
| `edge-003` | Very long command line | 1000+ character command | ✅ Handled or appropriate error |
| `edge-004` | Unicode in arguments | Commands with unicode chars | ✅ Unicode handled correctly |
| `edge-005` | Special characters in paths | Paths with spaces, quotes | ✅ Path handling correct |

#### 10.2 System Edge Cases
| Test Case | Description | Input | Expected Result |
|-----------|-------------|-------|-----------------|
| `edge-011` | System shutdown during execution | Kill server during command | ✅ Graceful shutdown |
| `edge-012` | Disk space exhaustion | Large output when disk full | ❌ Appropriate error handling |
| `edge-013` | Network interruption | Network-dependent commands | ❌ Network error handled |

## Test Execution Guidelines

### Test Environment Setup
1. **Isolated Environment**: Each test should run in isolation
2. **Clean State**: Reset configuration and process state between tests
3. **Temporary Directories**: Use temporary directories for file operations
4. **Mock External Dependencies**: Mock network calls and external services

### Test Data Management
1. **Test Fixtures**: Use consistent test data across related tests
2. **Cleanup**: Always clean up temporary files and processes
3. **Deterministic Results**: Ensure tests produce consistent results

### Security Test Guidelines
1. **Safe Patterns**: Use obviously safe test patterns that won't cause damage
2. **Isolated Execution**: Run security tests in containers when possible
3. **No Real Harm**: Ensure injection tests can't cause actual system damage
4. **Log Analysis**: Verify security decisions are logged correctly

### Performance Test Guidelines
1. **Baseline Measurements**: Establish performance baselines
2. **Reasonable Timeouts**: Use appropriate timeouts for performance tests
3. **Resource Monitoring**: Monitor memory, CPU, and file handles
4. **Load Testing**: Test with realistic concurrent load

### Integration Test Guidelines
1. **End-to-End**: Test complete workflows from MCP request to response
2. **Real Commands**: Use actual npm, git, and tsc commands when safe
3. **Error Paths**: Test both success and failure scenarios
4. **Configuration Variations**: Test different configuration setups

## Test Implementation Notes

### Vitest Configuration
- Use the existing Vitest setup with `--ui` for interactive testing
- Leverage the test utilities in `src/test-utils/helpers.ts`
- Add new helper functions as needed for these test cases

### Mock Strategy
- Mock external processes when testing security validation
- Use real processes for integration tests with safe commands
- Mock file system operations for edge case testing

### Test Organization
```
src/__tests__/
├── unit/
│   ├── security.test.ts (existing)
│   ├── config.test.ts (existing)
│   ├── commandExecutor.test.ts (new)
│   ├── logger.test.ts (new)
│   └── processManager.test.ts (new)
├── integration/
│   ├── mcp-protocol.test.ts (new)
│   ├── claude-integration.test.ts (new)
│   └── end-to-end.test.ts (new)
├── performance/
│   ├── execution-performance.test.ts (new)
│   └── resource-usage.test.ts (new)
└── security/
    ├── injection-protection.test.ts (new)
    ├── path-validation.test.ts (new)
    └── environment-sanitization.test.ts (new)
```

### Critical Test Priorities

**High Priority (Implement First):**
1. Security validation tests (security-001 through security-044)
2. Basic command execution (exec-001 through exec-005)
3. NPM command tests (exec-011 through exec-015)
4. Process management (proc-001 through proc-005)
5. Configuration loading (config-001 through config-005)

**Medium Priority:**
1. Streaming tests (stream-001 through stream-013)
2. Git command tests (exec-021 through exec-025)
3. Error handling (error-001 through error-023)
4. Integration tests (integ-001 through integ-024)

**Lower Priority:**
1. Performance tests (perf-001 through perf-013)
2. Edge cases (edge-001 through edge-013)
3. Advanced logging tests (log-021 through log-023)

This comprehensive test suite ensures the Utaba MCP Shell is secure, reliable, and performs well in real-world development scenarios.