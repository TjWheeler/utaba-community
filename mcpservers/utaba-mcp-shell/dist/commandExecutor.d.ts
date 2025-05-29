import { EventEmitter } from 'events';
import { Config } from './config.js';
import { Logger } from './logger.js';
export interface CommandRequest {
    command: string;
    args: string[];
    workingDirectory?: string;
    environment?: Record<string, string>;
    timeout?: number;
}
export interface CommandResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    executionTime: number;
    timedOut: boolean;
    killed: boolean;
    pid?: number;
}
export interface StreamingCommandResult extends CommandResult {
    isComplete: boolean;
}
export declare class CommandExecutionError extends Error {
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    constructor(message: string, exitCode: number | null, stdout: string, stderr: string);
}
/**
 * Command execution engine with security validation and process management
 */
export declare class CommandExecutor extends EventEmitter {
    private config;
    private logger;
    private securityValidator;
    private activeProcesses;
    private processCounter;
    constructor(config: Config, logger: Logger);
    /**
     * Execute a command with full validation and security checks
     */
    executeCommand(request: CommandRequest): Promise<CommandResult>;
    /**
     * Execute a command with streaming output
     */
    executeCommandStreaming(request: CommandRequest, onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void): Promise<CommandResult>;
    /**
     * Spawn a process and wait for completion
     */
    private spawnProcess;
    /**
     * Spawn a process with streaming output
     */
    private spawnProcessStreaming;
    /**
     * Kill a running process
     */
    killProcess(processId: string, signal?: NodeJS.Signals): boolean;
    /**
     * Kill all active processes
     */
    killAllProcesses(signal?: NodeJS.Signals): number;
    /**
     * Get status of active processes
     */
    getActiveProcesses(): Array<{
        id: string;
        pid?: number;
        command: string;
        startTime: number;
    }>;
    /**
     * Get execution statistics
     */
    getStats(): {
        activeProcesses: number;
        maxConcurrent: number;
        totalExecuted: number;
    };
    /**
     * Graceful shutdown - kill all processes and cleanup
     */
    shutdown(graceful?: boolean): Promise<void>;
}
/**
 * Utility functions for command execution
 */
export declare class CommandUtils {
    /**
     * Parse command string into command and arguments
     */
    static parseCommandString(commandString: string): {
        command: string;
        args: string[];
    };
    /**
     * Escape shell argument (basic implementation)
     */
    static escapeShellArg(arg: string): string;
    /**
     * Check if command exists on the system
     */
    static commandExists(command: string): Promise<boolean>;
    /**
     * Format command result for display
     */
    static formatCommandResult(result: CommandResult): string;
}
//# sourceMappingURL=commandExecutor.d.ts.map