import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { SecurityValidator, SecurityError } from './security.js';
export class CommandExecutionError extends Error {
    exitCode;
    stdout;
    stderr;
    constructor(message, exitCode, stdout, stderr) {
        super(message);
        this.exitCode = exitCode;
        this.stdout = stdout;
        this.stderr = stderr;
        this.name = 'CommandExecutionError';
    }
}
/**
 * Command execution engine with security validation and process management
 */
export class CommandExecutor extends EventEmitter {
    config;
    logger;
    securityValidator;
    activeProcesses = new Map();
    processCounter = 0;
    constructor(config, logger) {
        super();
        this.config = config;
        this.logger = logger;
        this.securityValidator = new SecurityValidator(config);
    }
    /**
     * Execute a command with full validation and security checks
     */
    async executeCommand(request) {
        // Validate trusted environment
        this.securityValidator.validateTrustedEnvironment();
        // Validate command against security rules
        const validation = this.securityValidator.validateCommand(request.command, request.args, request.workingDirectory);
        if (!validation.allowed) {
            this.logger.warn('CommandExecutor', 'Command execution blocked', 'executeCommand', {
                command: request.command,
                args: request.args,
                reason: validation.reason
            });
            throw new SecurityError(`Command execution denied: ${validation.reason}`, validation.reason || 'Unknown');
        }
        // Check concurrent execution limits
        if (this.activeProcesses.size >= this.config.maxConcurrentCommands) {
            throw new Error(`Maximum concurrent commands reached (${this.config.maxConcurrentCommands})`);
        }
        const pattern = validation.matchedPattern;
        const timeout = this.securityValidator.getCommandTimeout(pattern);
        const sanitizedArgs = validation.sanitizedArgs || request.args;
        this.logger.info('CommandExecutor', 'Executing command', 'executeCommand', {
            command: request.command,
            args: sanitizedArgs,
            workingDirectory: request.workingDirectory,
            timeout,
            pattern: pattern.description
        });
        return this.spawnProcess(request.command, sanitizedArgs, {
            cwd: request.workingDirectory,
            env: this.securityValidator.sanitizeEnvironment(request.environment),
            timeout: request.timeout || timeout
        });
    }
    /**
     * Execute a command with streaming output
     */
    executeCommandStreaming(request, onOutput) {
        return new Promise(async (resolve, reject) => {
            try {
                // Same validation as executeCommand
                this.securityValidator.validateTrustedEnvironment();
                const validation = this.securityValidator.validateCommand(request.command, request.args, request.workingDirectory);
                if (!validation.allowed) {
                    throw new SecurityError(`Command execution denied: ${validation.reason}`, validation.reason || 'Unknown');
                }
                if (this.activeProcesses.size >= this.config.maxConcurrentCommands) {
                    throw new Error(`Maximum concurrent commands reached (${this.config.maxConcurrentCommands})`);
                }
                const pattern = validation.matchedPattern;
                const timeout = this.securityValidator.getCommandTimeout(pattern);
                const sanitizedArgs = validation.sanitizedArgs || request.args;
                this.logger.info('CommandExecutor', 'Executing streaming command', 'executeCommandStreaming', {
                    command: request.command,
                    args: sanitizedArgs,
                    workingDirectory: request.workingDirectory,
                    timeout
                });
                const result = await this.spawnProcessStreaming(request.command, sanitizedArgs, {
                    cwd: request.workingDirectory,
                    env: this.securityValidator.sanitizeEnvironment(request.environment),
                    timeout: request.timeout || timeout
                }, onOutput);
                resolve(result);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Spawn a process and wait for completion
     */
    spawnProcess(command, args, options) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const processId = `proc_${++this.processCounter}`;
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let killed = false;
            // Spawn the process
            const child = spawn(command, args, {
                cwd: options.cwd || process.cwd(),
                env: options.env || process.env,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: process.platform === 'win32' // Use shell on Windows for better command resolution
            });
            // Track active process
            this.activeProcesses.set(processId, child);
            // Set up timeout
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                this.killProcess(processId, 'SIGTERM');
                // Force kill after 5 seconds if still running
                setTimeout(() => {
                    if (this.activeProcesses.has(processId)) {
                        this.killProcess(processId, 'SIGKILL');
                    }
                }, 5000);
            }, options.timeout);
            // Collect stdout
            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            // Collect stderr
            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            // Handle process completion
            child.on('close', (code, signal) => {
                clearTimeout(timeoutHandle);
                this.activeProcesses.delete(processId);
                const executionTime = Date.now() - startTime;
                this.logger.info('CommandExecutor', 'Command completed', 'spawnProcess', {
                    command,
                    exitCode: code,
                    signal,
                    executionTime,
                    timedOut,
                    killed,
                    pid: child.pid
                });
                const result = {
                    exitCode: code,
                    stdout,
                    stderr,
                    executionTime,
                    timedOut,
                    killed,
                    pid: child.pid
                };
                resolve(result);
            });
            // Handle process errors
            child.on('error', (error) => {
                clearTimeout(timeoutHandle);
                this.activeProcesses.delete(processId);
                this.logger.error('CommandExecutor', 'Command execution error', 'spawnProcess', {
                    command,
                    error: error.message
                });
                reject(new CommandExecutionError(`Command execution failed: ${error.message}`, null, stdout, stderr));
            });
            // Handle kill events
            child.on('exit', (code, signal) => {
                if (signal) {
                    killed = true;
                }
            });
        });
    }
    /**
     * Spawn a process with streaming output
     */
    spawnProcessStreaming(command, args, options, onOutput) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const processId = `proc_${++this.processCounter}`;
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let killed = false;
            // Spawn the process
            const child = spawn(command, args, {
                cwd: options.cwd || process.cwd(),
                env: options.env || process.env,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: process.platform === 'win32'
            });
            // Track active process
            this.activeProcesses.set(processId, child);
            // Set up timeout
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                this.killProcess(processId, 'SIGTERM');
                setTimeout(() => {
                    if (this.activeProcesses.has(processId)) {
                        this.killProcess(processId, 'SIGKILL');
                    }
                }, 5000);
            }, options.timeout);
            // Stream stdout with callback
            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
                onOutput(chunk, 'stdout');
            });
            // Stream stderr with callback
            child.stderr?.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
                onOutput(chunk, 'stderr');
            });
            // Handle completion
            child.on('close', (code, signal) => {
                clearTimeout(timeoutHandle);
                this.activeProcesses.delete(processId);
                const executionTime = Date.now() - startTime;
                this.logger.info('CommandExecutor', 'Streaming command completed', 'spawnProcessStreaming', {
                    command,
                    exitCode: code,
                    signal,
                    executionTime,
                    timedOut,
                    killed,
                    pid: child.pid
                });
                resolve({
                    exitCode: code,
                    stdout,
                    stderr,
                    executionTime,
                    timedOut,
                    killed,
                    pid: child.pid
                });
            });
            // Handle errors
            child.on('error', (error) => {
                clearTimeout(timeoutHandle);
                this.activeProcesses.delete(processId);
                this.logger.error('CommandExecutor', 'Streaming command error', 'spawnProcessStreaming', {
                    command,
                    error: error.message
                });
                reject(new CommandExecutionError(`Command execution failed: ${error.message}`, null, stdout, stderr));
            });
            child.on('exit', (code, signal) => {
                if (signal) {
                    killed = true;
                }
            });
        });
    }
    /**
     * Kill a running process
     */
    killProcess(processId, signal = 'SIGTERM') {
        const process = this.activeProcesses.get(processId);
        if (!process) {
            return false;
        }
        try {
            process.kill(signal);
            this.logger.info('CommandExecutor', 'Process killed', 'killProcess', {
                processId,
                pid: process.pid,
                signal
            });
            return true;
        }
        catch (error) {
            this.logger.error('CommandExecutor', 'Failed to kill process', 'killProcess', {
                processId,
                pid: process.pid,
                signal,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
    /**
     * Kill all active processes
     */
    killAllProcesses(signal = 'SIGTERM') {
        const processIds = Array.from(this.activeProcesses.keys());
        let killedCount = 0;
        for (const processId of processIds) {
            if (this.killProcess(processId, signal)) {
                killedCount++;
            }
        }
        this.logger.info('CommandExecutor', 'Killed all processes', 'killAllProcesses', {
            killedCount,
            totalProcesses: processIds.length,
            signal
        });
        return killedCount;
    }
    /**
     * Get status of active processes
     */
    getActiveProcesses() {
        const processes = [];
        for (const [id, process] of this.activeProcesses) {
            processes.push({
                id,
                pid: process.pid,
                command: process.spawnargs.join(' '),
                startTime: Date.now() // This should be tracked better in a real implementation
            });
        }
        return processes;
    }
    /**
     * Get execution statistics
     */
    getStats() {
        return {
            activeProcesses: this.activeProcesses.size,
            maxConcurrent: this.config.maxConcurrentCommands,
            totalExecuted: this.processCounter
        };
    }
    /**
     * Graceful shutdown - kill all processes and cleanup
     */
    async shutdown(graceful = true) {
        this.logger.info('CommandExecutor', 'Shutting down command executor', 'shutdown', {
            activeProcesses: this.activeProcesses.size,
            graceful
        });
        if (graceful) {
            // First try graceful termination
            this.killAllProcesses('SIGTERM');
            // Wait up to 10 seconds for processes to terminate
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        // Force kill any remaining processes
        if (this.activeProcesses.size > 0) {
            this.killAllProcesses('SIGKILL');
            // Wait a bit for force kill to take effect
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        this.activeProcesses.clear();
        this.removeAllListeners();
    }
}
/**
 * Utility functions for command execution
 */
export class CommandUtils {
    /**
     * Parse command string into command and arguments
     */
    static parseCommandString(commandString) {
        // Simple parsing - in production, consider using a proper shell parser
        const parts = commandString.trim().split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1);
        return { command, args };
    }
    /**
     * Escape shell argument (basic implementation)
     */
    static escapeShellArg(arg) {
        if (process.platform === 'win32') {
            // Windows shell escaping
            return `"${arg.replace(/"/g, '""')}"`;
        }
        else {
            // Unix shell escaping
            return `'${arg.replace(/'/g, "'\"'\"'")}'`;
        }
    }
    /**
     * Check if command exists on the system
     */
    static async commandExists(command) {
        return new Promise((resolve) => {
            const which = process.platform === 'win32' ? 'where' : 'which';
            const child = spawn(which, [command], { stdio: 'ignore' });
            child.on('close', (code) => {
                resolve(code === 0);
            });
            child.on('error', () => {
                resolve(false);
            });
        });
    }
    /**
     * Format command result for display
     */
    static formatCommandResult(result) {
        const lines = [
            `Exit Code: ${result.exitCode}`,
            `Execution Time: ${result.executionTime}ms`,
            `PID: ${result.pid || 'Unknown'}`,
            `Timed Out: ${result.timedOut}`,
            `Killed: ${result.killed}`
        ];
        if (result.stdout.trim()) {
            lines.push('', 'STDOUT:', result.stdout.trim());
        }
        if (result.stderr.trim()) {
            lines.push('', 'STDERR:', result.stderr.trim());
        }
        return lines.join('\n');
    }
}
//# sourceMappingURL=commandExecutor.js.map