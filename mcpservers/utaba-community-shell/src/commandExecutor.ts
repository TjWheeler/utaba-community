import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { Config, CommandPattern } from './config.js';
import { SecurityValidator, ValidationResult, SecurityError } from './security.js';
import { Logger } from './logger.js';
import { ApprovalManager, ApprovalError, ApprovalTimeoutError } from './approvals/index.js';
import { 
  createAsyncJobQueue, 
  AsyncJobQueue, 
  JobRecord, 
  JobSubmissionRequest, 
  JobStatusResponse,
  JobResultResponse,
  JobSummary,
  generateSessionId 
} from './async/index.js';

export interface CommandRequest {
  command: string;
  args: string[];
  startDirectory: string; 
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

// New interfaces for async operations
export interface AsyncJobSubmission {
  jobId: string;
  status: string;
  submittedAt: number;
  estimatedApprovalTime?: number;
  approvalUrl?: string;
}

export class CommandExecutionError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stdout: string,
    public readonly stderr: string
  ) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}

export class ApprovalRequiredError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly args: string[],
    public readonly workingDirectory: string
  ) {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

/**
 * Command execution engine with security validation, approval workflow, and process management
 */
export class CommandExecutor extends EventEmitter {
  private securityValidator: SecurityValidator;
  private approvalManager: ApprovalManager | null = null;
  private asyncJobQueue: AsyncJobQueue | null = null;
  private activeProcesses = new Map<string, ChildProcess>();
  private processCounter = 0;
  private currentSessionId: string;
  
  constructor(
    private config: Config,
    private logger: Logger
  ) {
    super();
    this.securityValidator = new SecurityValidator(config);
    this.currentSessionId = generateSessionId();
    
    // Initialize approval manager if any commands require confirmation
    if (this.hasCommandsRequiringApproval()) {
      this.approvalManager = new ApprovalManager(
        process.cwd(), // Use current working directory for approval queue
        logger
      );
    }

    // Initialize async job queue
    this.asyncJobQueue = createAsyncJobQueue({
      baseDir: process.cwd() // Will create async-queue subdirectory
    }, logger);
  }

  /**
   * Initialize the command executor (async initialization)
   */
  async initialize(): Promise<void> {
    if (this.approvalManager) {
      await this.approvalManager.initialize();
      this.logger.info('CommandExecutor', 'Approval system initialized', 'initialize');
    }

    if (this.asyncJobQueue) {
      await this.asyncJobQueue.initialize();
      this.logger.info('CommandExecutor', 'Async job queue initialized', 'initialize', {
        sessionId: this.currentSessionId,
        baseDir: this.asyncJobQueue.getBaseDirectory()
      });
    }
  }

  /**
   * Submit command for async execution - returns immediately with job ID
   */
  async executeCommandAsync(request: CommandRequest, options: {
    conversationId?: string;
    userDescription?: string;
  } = {}): Promise<AsyncJobSubmission> {
    if (!this.asyncJobQueue) {
      throw new Error('Async job queue not initialized');
    }

    // Validate trusted environment and command security
    this.securityValidator.validateTrustedEnvironment();
    
    const validation = this.securityValidator.validateCommand(
      request.command,
      request.args,
      request.workingDirectory || "",
      request.startDirectory
    );
    
    if (!validation.allowed) {
      this.logger.warn('CommandExecutor', 'Async command submission blocked', 'executeCommandAsync', {
        command: request.command,
        args: request.args,
        reason: validation.reason
      });
      throw new SecurityError(`Command execution denied: ${validation.reason}`, validation.reason || 'Unknown');
    }

    const pattern = validation.matchedPattern!;
    const resolvedWorkingDirectory = this.securityValidator.resolveWorkingDirectory(
      request.startDirectory, 
      request.workingDirectory || ""
    );

    // Create job submission request
    const jobRequest: JobSubmissionRequest = {
      command: request.command,
      args: validation.sanitizedArgs || request.args,
      workingDirectory: resolvedWorkingDirectory,
      timeout: request.timeout || this.securityValidator.getCommandTimeout(pattern),
      conversationId: options.conversationId,
      sessionId: this.currentSessionId,
      userDescription: options.userDescription
    };

    try {
      // Submit job to queue
      const job = await this.asyncJobQueue.submitJob(jobRequest);

      this.logger.info('CommandExecutor', 'Async command submitted', 'executeCommandAsync', {
        jobId: job.id,
        command: job.command,
        operationType: job.operationType,
        requiresApproval: pattern.requiresConfirmation,
        estimatedDuration: job.estimatedDuration
      });

      // Calculate estimated approval time for UI
      const estimatedApprovalTime = pattern.requiresConfirmation ? 
        job.submittedAt + (5 * 60 * 1000) : // 5 minutes for approval
        undefined;

      // Get approval URL if needed
      let approvalUrl: string | undefined;
      if (pattern.requiresConfirmation && this.approvalManager) {
        const serverStatus = this.approvalManager.getServerStatus();
        approvalUrl = serverStatus.url;
        
        // Ensure approval server is running
        if (!serverStatus.isRunning) {
          await this.approvalManager.launchApprovalCenter();
          const updatedStatus = this.approvalManager.getServerStatus();
          approvalUrl = updatedStatus.url;
        }
      }

      return {
        jobId: job.id,
        status: job.status,
        submittedAt: job.submittedAt,
        estimatedApprovalTime,
        approvalUrl
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CommandExecutor', 'Failed to submit async command', 'executeCommandAsync', {
        error: errorMsg,
        command: request.command,
        args: request.args
      });
      throw new Error(`Failed to submit async command: ${errorMsg}`);
    }
  }

  /**
   * Check status of async job
   */
  async checkJobStatus(jobId: string): Promise<JobStatusResponse | null> {
    if (!this.asyncJobQueue) {
      throw new Error('Async job queue not initialized');
    }

    try {
      const job = await this.asyncJobQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      const timeElapsed = Date.now() - job.submittedAt;
      let estimatedTimeRemaining: number | undefined;

      // Calculate estimated time remaining based on status
      if (job.status === 'executing' && job.estimatedDuration) {
        const executionElapsed = Date.now() - (job.startedAt || job.submittedAt);
        const remaining = job.estimatedDuration - executionElapsed;
        estimatedTimeRemaining = remaining > 0 ? remaining : undefined;
      }

      // Get approval URL if needed
      let approvalUrl: string | undefined;
      if (job.status === 'pending_approval' && this.approvalManager) {
        const serverStatus = this.approvalManager.getServerStatus();
        approvalUrl = serverStatus.url;
      }

      const response: JobStatusResponse = {
        jobId: job.id,
        status: job.status,
        submittedAt: job.submittedAt,
        lastUpdated: job.lastUpdated,
        timeElapsed,
        estimatedTimeRemaining,
        progressMessage: job.progressMessage,
        progressPercentage: job.progressPercentage,
        executionToken: job.status === 'completed' ? job.executionToken : undefined,
        error: job.error,
        approvalUrl,
        canCancel: ['pending_approval', 'approved', 'executing'].includes(job.status),
        canRetry: job.canRetry && ['execution_failed', 'execution_timeout'].includes(job.status),
        nextPollRecommendation: this.calculateNextPollInterval(job)
      };

      this.logger.debug('CommandExecutor', 'Job status checked', 'checkJobStatus', {
        jobId,
        status: job.status,
        timeElapsed
      });

      return response;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CommandExecutor', 'Failed to check job status', 'checkJobStatus', {
        error: errorMsg,
        jobId
      });
      throw new Error(`Failed to check job status: ${errorMsg}`);
    }
  }

  /**
   * Get job result with secure token validation
   */
  async getJobResult(jobId: string, executionToken: string): Promise<JobResultResponse | null> {
    if (!this.asyncJobQueue) {
      throw new Error('Async job queue not initialized');
    }

    try {
      const job = await this.asyncJobQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      // Validate execution token
      if (job.status !== 'completed' || !job.executionToken) {
        throw new Error('Job is not completed or results are not available');
      }

      if (job.executionToken !== executionToken) {
        this.logger.warn('CommandExecutor', 'Invalid execution token for job result', 'getJobResult', {
          jobId,
          providedToken: executionToken.substring(0, 8) + '...'
        });
        throw new Error('Invalid execution token');
      }

      // TODO: Read actual execution results from files
      // For now, return placeholder data
      const response: JobResultResponse = {
        success: job.exitCode === 0,
        exitCode: job.exitCode || null,
        stdout: "Command execution results would be here", // TODO: Load from file
        stderr: "", // TODO: Load from file
        executionTime: job.executionTime || 0,
        timedOut: job.timedOut || false,
        killed: job.killed || false,
        pid: job.pid,
        completedAt: job.completedAt || Date.now()
      };

      this.logger.info('CommandExecutor', 'Job result retrieved', 'getJobResult', {
        jobId,
        success: response.success,
        executionTime: response.executionTime
      });

      return response;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CommandExecutor', 'Failed to get job result', 'getJobResult', {
        error: errorMsg,
        jobId
      });
      throw new Error(`Failed to get job result: ${errorMsg}`);
    }
  }

  /**
   * List recent jobs with optional filtering
   */
  async listJobs(options: {
    limit?: number;
    conversationId?: string;
    status?: string;
  } = {}): Promise<JobSummary[]> {
    if (!this.asyncJobQueue) {
      throw new Error('Async job queue not initialized');
    }

    try {
      const jobs = await this.asyncJobQueue.listJobs({
        limit: options.limit || 10,
        conversationId: options.conversationId
      });

      this.logger.debug('CommandExecutor', 'Jobs listed', 'listJobs', {
        count: jobs.length,
        conversationId: options.conversationId
      });

      return jobs;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CommandExecutor', 'Failed to list jobs', 'listJobs', {
        error: errorMsg,
        options
      });
      throw new Error(`Failed to list jobs: ${errorMsg}`);
    }
  }

  /**
   * Check all jobs for current conversation
   */
  async checkConversationJobs(conversationId?: string): Promise<{
    activeJobs: JobSummary[];
    recentlyCompleted: JobSummary[];
    pendingResults: JobSummary[];
  }> {
    if (!this.asyncJobQueue) {
      throw new Error('Async job queue not initialized');
    }

    try {
      const allJobs = await this.asyncJobQueue.listJobs({
        conversationId: conversationId || this.currentSessionId,
        limit: 50
      });

      const activeJobs = allJobs.filter(job => 
        ['pending_approval', 'approved', 'executing'].includes(job.status)
      );

      const recentlyCompleted = allJobs.filter(job => {
        if (job.status !== 'completed') return false;
        const completedRecently = (Date.now() - job.lastUpdated) < (30 * 60 * 1000); // 30 minutes
        return completedRecently;
      });

      const pendingResults = allJobs.filter(job => 
        job.status === 'completed' && job.executionToken
      );

      this.logger.info('CommandExecutor', 'Conversation jobs checked', 'checkConversationJobs', {
        conversationId: conversationId || this.currentSessionId,
        activeCount: activeJobs.length,
        recentlyCompletedCount: recentlyCompleted.length,
        pendingResultsCount: pendingResults.length
      });

      return {
        activeJobs,
        recentlyCompleted,
        pendingResults
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CommandExecutor', 'Failed to check conversation jobs', 'checkConversationJobs', {
        error: errorMsg,
        conversationId
      });
      throw new Error(`Failed to check conversation jobs: ${errorMsg}`);
    }
  }
  
  /**
   * Execute a command with full validation and security checks (SYNC - existing method)
   */
  async executeCommand(request: CommandRequest): Promise<CommandResult> {
    // Validate trusted environment
    this.securityValidator.validateTrustedEnvironment();
    
    // Validate command against security rules
    const validation = this.securityValidator.validateCommand(
      request.command,
      request.args,
      request.workingDirectory || "",
      request.startDirectory
    );
    
    if (!validation.allowed) {
      this.logger.warn('CommandExecutor', 'Command execution blocked', 'executeCommand', {
        command: request.command,
        args: request.args,
        reason: validation.reason
      });
      throw new SecurityError(`Command execution denied: ${validation.reason}`, validation.reason || 'Unknown');
    }
    
    // Check if approval is required for this command
    const pattern = validation.matchedPattern!;
    if (pattern.requiresConfirmation && this.approvalManager) {
      await this.handleApprovalWorkflow(request, pattern);
    }
    
    // Check concurrent execution limits
    if (this.activeProcesses.size >= this.config.maxConcurrentCommands) {
      throw new Error(`Maximum concurrent commands reached (${this.config.maxConcurrentCommands})`);
    }
    
    const timeout = this.securityValidator.getCommandTimeout(pattern);
    const sanitizedArgs = validation.sanitizedArgs || request.args;
    const resolvedWorkingDirectory = this.securityValidator.resolveWorkingDirectory(request.startDirectory, request.workingDirectory || "");
    
    this.logger.debug('CommandExecutor', 'Resolved working directory is ' + resolvedWorkingDirectory, 'executeCommand');
    this.logger.info('CommandExecutor', 'Executing command', 'executeCommand', {
      command: request.command,
      args: sanitizedArgs,
      workingDirectory: request.workingDirectory,
      timeout,
      pattern: pattern.description,
      requiresApproval: pattern.requiresConfirmation
    });
    
    return this.spawnProcess(
      request.command,
      sanitizedArgs,
      {
        cwd: resolvedWorkingDirectory,
        env: this.securityValidator.sanitizeEnvironment(request.environment),
        timeout: request.timeout || timeout
      }
    );
  }
  
  /**
   * Execute a command with streaming output (SYNC - existing method)
   */
  executeCommandStreaming(
    request: CommandRequest,
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void
  ): Promise<CommandResult> {
    return new Promise(async (resolve, reject) => {
      try {
        // Same validation as executeCommand
        this.securityValidator.validateTrustedEnvironment();
        
        const validation = this.securityValidator.validateCommand(
          request.command,
          request.args,
          request.workingDirectory || "",
          request.startDirectory
        );
        
        if (!validation.allowed) {
          throw new SecurityError(`Command execution denied: ${validation.reason}`, validation.reason || 'Unknown');
        }
        
        // Check if approval is required for this command
        const pattern = validation.matchedPattern!;
        if (pattern.requiresConfirmation && this.approvalManager) {
          await this.handleApprovalWorkflow(request, pattern);
        }
        
        if (this.activeProcesses.size >= this.config.maxConcurrentCommands) {
          throw new Error(`Maximum concurrent commands reached (${this.config.maxConcurrentCommands})`);
        }
        
        const timeout = this.securityValidator.getCommandTimeout(pattern);
        const sanitizedArgs = validation.sanitizedArgs || request.args;
        
        this.logger.info('CommandExecutor', 'Executing streaming command', 'executeCommandStreaming', {
          command: request.command,
          args: sanitizedArgs,
          workingDirectory: request.workingDirectory,
          timeout,
          requiresApproval: pattern.requiresConfirmation
        });
        
        let resolvedWorkingDirectory = this.securityValidator.resolveWorkingDirectory(request.startDirectory, request.workingDirectory || "");
        const result = await this.spawnProcessStreaming(
          request.command,
          sanitizedArgs,
          {
            cwd: resolvedWorkingDirectory,
            env: this.securityValidator.sanitizeEnvironment(request.environment),
            timeout: request.timeout || timeout
          },
          onOutput
        );
        
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get approval manager status (for debugging/monitoring)
   */
  getApprovalStatus(): { 
    enabled: boolean; 
    serverRunning?: boolean; 
    serverUrl?: string;
    pendingRequests?: number;
  } {
    if (!this.approvalManager) {
      return { enabled: false };
    }

    const serverStatus = this.approvalManager.getServerStatus();
    
    return {
      enabled: true,
      serverRunning: serverStatus.isRunning,
      serverUrl: serverStatus.url,
      // Note: pendingRequests would require async call, could be added if needed
    };
  }

  /**
   * Launch the approval center and return access information
   */
  async launchApprovalCenter(forceRestart: boolean = false): Promise<{
    launched: boolean;
    url?: string;
    port?: number;
    alreadyRunning: boolean;
  }> {
    // Check if approval system is available
    if (!this.approvalManager) {
      this.logger.info('CommandExecutor', 'Approval center not available - no commands require approval', 'launchApprovalCenter');
      return {
        launched: false,
        alreadyRunning: false
      };
    }

    try {
      // Use the approval manager's launch method
      const result = await this.approvalManager.launchApprovalCenter(forceRestart);
      
      this.logger.info('CommandExecutor', 'Approval center launch completed', 'launchApprovalCenter', {
        launched: result.launched,
        url: result.url,
        port: result.port,
        alreadyRunning: result.alreadyRunning,
        forceRestart
      });

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('CommandExecutor', 'Failed to launch approval center', 'launchApprovalCenter', {
        error: errorMsg,
        forceRestart
      });
      
      throw new Error(`Failed to launch approval center: ${errorMsg}`);
    }
  }

  // Private methods

  private hasCommandsRequiringApproval(): boolean {
    return this.config.allowedCommands.some(cmd => cmd.requiresConfirmation === true);
  }

  private calculateNextPollInterval(job: JobRecord): number {
    // Use the utility function from async module
    const { calculatePollingInterval } = require('./async/utils.js');
    return calculatePollingInterval(job);
  }

  private async handleApprovalWorkflow(request: CommandRequest, pattern: CommandPattern): Promise<void> {
    if (!this.approvalManager) {
      throw new Error('Approval manager not initialized but approval required');
    }

    try {
      const resolvedWorkingDirectory = this.securityValidator.resolveWorkingDirectory(
        request.startDirectory, 
        request.workingDirectory || ""
      );

      this.logger.info('CommandExecutor', 'Requesting approval for command', 'handleApprovalWorkflow', {
        command: request.command,
        args: request.args,
        workingDirectory: resolvedWorkingDirectory
      });

      // Request approval and wait for decision
      const decision = await this.approvalManager.requestApproval(
        request.command,
        request.args,
        resolvedWorkingDirectory,
        request.timeout || 300000 // 5 minute default timeout
      );

      if (decision.decision === 'reject') {
        this.logger.warn('CommandExecutor', 'Command execution rejected by user', 'handleApprovalWorkflow', {
          command: request.command,
          args: request.args,
          decidedBy: decision.decidedBy,
          reason: decision.reason
        });
        
        throw new SecurityError(
          `Command execution rejected by ${decision.decidedBy}${decision.reason ? ': ' + decision.reason : ''}`,
          'USER_REJECTED'
        );
      }

      this.logger.info('CommandExecutor', 'Command execution approved by user', 'handleApprovalWorkflow', {
        command: request.command,
        args: request.args,
        decidedBy: decision.decidedBy,
        decisionTime: Date.now() - decision.timestamp
      });

    } catch (error) {
      if (error instanceof ApprovalTimeoutError) {
        this.logger.warn('CommandExecutor', 'Approval request timed out', 'handleApprovalWorkflow', {
          command: request.command,
          args: request.args,
          timeout: error.message
        });
        
        throw new SecurityError(
          `Command execution approval timed out. No response received within the timeout period.`,
          'APPROVAL_TIMEOUT'
        );
      }

      if (error instanceof ApprovalError) {
        this.logger.error('CommandExecutor', 'Approval system error', 'handleApprovalWorkflow', {
          command: request.command,
          args: request.args,
          error: error.message,
          code: error.code
        });
        
        throw new SecurityError(
          `Approval system error: ${error.message}`,
          'APPROVAL_SYSTEM_ERROR'
        );
      }

      // Re-throw security errors and other errors as-is
      throw error;
    }
  }
  
  /**
   * Spawn a process and wait for completion
   */
  private spawnProcess(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeout: number;
    }
  ): Promise<CommandResult> {
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
        
        const result: CommandResult = {
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
        
        reject(new CommandExecutionError(
          `Command execution failed: ${error.message}`,
          null,
          stdout,
          stderr
        ));
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
  private spawnProcessStreaming(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeout: number;
    },
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void
  ): Promise<CommandResult> {
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
        
        reject(new CommandExecutionError(
          `Command execution failed: ${error.message}`,
          null,
          stdout,
          stderr
        ));
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
  killProcess(processId: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
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
    } catch (error) {
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
  killAllProcesses(signal: NodeJS.Signals = 'SIGTERM'): number {
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
  getActiveProcesses(): Array<{
    id: string;
    pid?: number;
    command: string;
    startTime: number;
  }> {
    const processes: Array<{
      id: string;
      pid?: number;
      command: string;
      startTime: number;
    }> = [];
    
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
  getStats(): {
    activeProcesses: number;
    maxConcurrent: number;
    totalExecuted: number;
    approvalSystemEnabled: boolean;
  } {
    return {
      activeProcesses: this.activeProcesses.size,
      maxConcurrent: this.config.maxConcurrentCommands,
      totalExecuted: this.processCounter,
      approvalSystemEnabled: this.approvalManager !== null
    };
  }
  
  /**
   * Graceful shutdown - kill all processes and cleanup
   */
  async shutdown(graceful = true): Promise<void> {
    this.logger.info('CommandExecutor', 'Shutting down command executor', 'shutdown', {
      activeProcesses: this.activeProcesses.size,
      graceful
    });
    
    // Shutdown async job queue
    if (this.asyncJobQueue) {
      try {
        await this.asyncJobQueue.shutdown();
        this.asyncJobQueue = null;
      } catch (error) {
        this.logger.error('CommandExecutor', 'Error shutting down async job queue', 'shutdown', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Shutdown approval manager
    if (this.approvalManager) {
      try {
        await this.approvalManager.shutdown();
        this.approvalManager = null;
      } catch (error) {
        this.logger.error('CommandExecutor', 'Error shutting down approval manager', 'shutdown', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
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
  static parseCommandString(commandString: string): { command: string; args: string[] } {
    // Simple parsing - in production, consider using a proper shell parser
    const parts = commandString.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    return { command, args };
  }
  
  /**
   * Escape shell argument (basic implementation)
   */
  static escapeShellArg(arg: string): string {
    if (process.platform === 'win32') {
      // Windows shell escaping
      return `"${arg.replace(/"/g, '""')}"`;
    } else {
      // Unix shell escaping
      return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }
  }
  
  /**
   * Check if command exists on the system
   */
  static async commandExists(command: string): Promise<boolean> {
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
  static formatCommandResult(result: CommandResult): string {
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
