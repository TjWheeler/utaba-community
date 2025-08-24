/**
 * Async Job Processor
 * 
 * Background processor that executes queued jobs and manages their lifecycle
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { 
  JobRecord, 
  JobStatus, 
  JobResultData,
  ProcessorConfig,
  OperationType,
  JobDetailedError
} from './types.js';
import { 
  generateExecutionToken,
  getJobFilePaths,
  createProgressMessage,
  calculatePollingInterval
} from './utils.js';
import { AsyncJobQueue } from './queue.js';
import { Logger } from '../logger.js';

/**
 * Background job processor that handles command execution
 */
export class AsyncJobProcessor extends EventEmitter {
  private isRunning = false;
  private activeProcesses = new Map<string, ChildProcess>();
  private processingLoop?: NodeJS.Timeout;
  
  constructor(
    private queue: AsyncJobQueue,
    private config: ProcessorConfig,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Convert Node.js spawn error to JobDetailedError
   */
  private createDetailedError(
    error: NodeJS.ErrnoException,
    job: JobRecord,
    category: 'spawn' | 'execution' | 'timeout' | 'approval' | 'system' = 'execution'
  ): JobDetailedError {
    return {
      message: error.message,
      code: error.code,
      category,
      command: job.command,
      args: job.args,
      workingDirectory: job.workingDirectory,
      systemError: {
        errno: error.errno,
        code: error.code,
        syscall: error.syscall,
        path: error.path
      },
      suggestedAction: this.getSuggestedActionForError(error),
      originalError: error.message,
      timestamp: Date.now()
    };
  }

  /**
   * Get suggested action for common errors
   */
  private getSuggestedActionForError(error: NodeJS.ErrnoException): string {
    switch (error.code) {
      case 'ENOENT':
        return 'Command not found. Check if the command is installed and in PATH';
      case 'EACCES':
        return 'Permission denied. Check file permissions or run with appropriate privileges';
      case 'EMFILE':
      case 'ENFILE':
        return 'Too many open files. Close other processes or increase system limits';
      case 'ENOMEM':
        return 'Out of memory. Close other applications or increase available memory';
      default:
        return 'Check command syntax and system configuration';
    }
  }

  /**
   * Start the background processor
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    
    this.logger.info('AsyncJobProcessor', 'Starting background job processor', 'start', {
      maxConcurrent: this.config.maxConcurrentJobs,
      processingInterval: this.config.processingInterval
    });

    // Start main processing loop
    this.processingLoop = setInterval(async () => {
      try {
        await this.processQueuedJobs();
      } catch (error) {
        this.logger.error('AsyncJobProcessor', 'Error in processing loop', 'processQueuedJobs', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.config.processingInterval);

    this.emit('started');
  }

  /**
   * Stop the background processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('AsyncJobProcessor', 'Stopping background job processor', 'stop', {
      activeProcesses: this.activeProcesses.size
    });

    this.isRunning = false;

    // Stop processing loop
    if (this.processingLoop) {
      clearInterval(this.processingLoop);
      this.processingLoop = undefined;
    }

    // Wait for active processes to complete or force-kill them
    await this.waitForProcessesToComplete(this.config.shutdownTimeout);

    this.removeAllListeners();
    this.emit('stopped');
  }

  /**
   * Get processor status
   */
  getStatus(): {
    isRunning: boolean;
    activeJobs: number;
    maxConcurrent: number;
    capacity: number;
  } {
    return {
      isRunning: this.isRunning,
      activeJobs: this.activeProcesses.size,
      maxConcurrent: this.config.maxConcurrentJobs,
      capacity: this.config.maxConcurrentJobs - this.activeProcesses.size
    };
  }

  /**
   * Main processing loop - checks for approved jobs and executes them
   */
  private async processQueuedJobs(): Promise<void> {
    if (!this.isRunning) return;

    // Check capacity
    if (this.activeProcesses.size >= this.config.maxConcurrentJobs) {
      this.logger.debug('AsyncJobProcessor', 'At capacity, skipping job processing', 'processQueuedJobs', {
        activeJobs: this.activeProcesses.size,
        maxConcurrent: this.config.maxConcurrentJobs
      });
      return;
    }

    try {
      // Get approved jobs ready for execution
      const approvedJobs = await this.queue.listJobs({ 
        status: 'approved',
        limit: this.config.maxConcurrentJobs - this.activeProcesses.size
      });

      for (const jobSummary of approvedJobs) {
        if (this.activeProcesses.size >= this.config.maxConcurrentJobs) break;

        const job = await this.queue.getJob(jobSummary.id);
        if (!job || job.status !== 'approved') continue;

        await this.executeJob(job);
      }

    } catch (error) {
      this.logger.error('AsyncJobProcessor', 'Failed to process queued jobs', 'processQueuedJobs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: JobRecord): Promise<void> {
    const jobId = job.id;

    try {
      this.logger.info('AsyncJobProcessor', 'Starting job execution', 'executeJob', {
        jobId,
        command: job.command,
        operationType: job.operationType,
        workingDirectory: job.workingDirectory
      });

      // Update job status to executing
      await this.queue.updateJob(jobId, {
        status: 'executing',
        startedAt: Date.now(),
        currentPhase: 'execution',
        progressMessage: 'Executing command...',
        progressPercentage: 10
      });

      // Prepare execution environment
      const paths = getJobFilePaths(this.queue.getBaseDirectory(), job);
      await fs.mkdir(paths.resultDir, { recursive: true });

      // Create result tracking
      const resultData: JobResultData = {
        stdout: '',
        stderr: '',
        startTime: Date.now(),
        endTime: 0,
        exitCode: null,
        timedOut: false,
        killed: false,
        pid: undefined
      };

      // Spawn the process
      const child = spawn(job.command, job.args, {
        cwd: job.workingDirectory,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });

      resultData.pid = child.pid;

      // Track active process
      this.activeProcesses.set(jobId, child);

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.logger.warn('AsyncJobProcessor', 'Job execution timeout', 'executeJob', {
          jobId,
          timeout: job.requestedTimeout
        });
        
        resultData.timedOut = true;
        this.killJob(jobId, 'SIGTERM');
        
        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.activeProcesses.has(jobId)) {
            this.killJob(jobId, 'SIGKILL');
          }
        }, 5000);
      }, job.requestedTimeout);

      // Stream stdout to file and collect
      const stdoutStream = createWriteStream(paths.stdoutFile);
      child.stdout?.on('data', (chunk) => {
        const data = chunk.toString();
        resultData.stdout += data;
        stdoutStream.write(data);
        
        // Update progress periodically
        this.updateJobProgress(jobId, data);
      });

      // Stream stderr to file and collect
      const stderrStream = createWriteStream(paths.stderrFile);
      child.stderr?.on('data', (chunk) => {
        const data = chunk.toString();
        resultData.stderr += data;
        stderrStream.write(data);
      });

      // Handle process completion
      child.on('close', async (code, signal) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(jobId);
        
        resultData.endTime = Date.now();
        resultData.exitCode = code;
        
        if (signal) {
          resultData.killed = true;
        }

        // Close file streams
        stdoutStream.end();
        stderrStream.end();

        const executionTime = resultData.endTime - resultData.startTime;
        const success = code === 0 && !resultData.timedOut && !resultData.killed;

        this.logger.info('AsyncJobProcessor', 'Job execution completed', 'executeJob', {
          jobId,
          exitCode: code,
          signal,
          executionTime,
          success,
          timedOut: resultData.timedOut,
          killed: resultData.killed
        });

        // Save complete result data
        await this.saveJobResults(job, resultData);

        // Update job status based on result
        if (success) {
          const executionToken = generateExecutionToken();
          
          await this.queue.updateJob(jobId, {
            status: 'completed',
            completedAt: resultData.endTime,
            exitCode: code ?? undefined, // Convert null to undefined
            executionTime,
            timedOut: resultData.timedOut,
            killed: resultData.killed,
            pid: resultData.pid,
            executionToken,
            progressMessage: 'Command completed successfully',
            progressPercentage: 100,
            currentPhase: 'completed'
          });

          this.emit('jobCompleted', jobId, { success: true, executionTime });
        } else {
          let status: JobStatus = 'execution_failed';
          let message = 'Command execution failed';
          
          if (resultData.timedOut) {
            status = 'execution_timeout';
            message = 'Command execution timed out';
          }

          // Create detailed error for execution failures
          const detailedError: JobDetailedError = {
            message: `${message}. Exit code: ${code}`,
            code: `EXIT_CODE_${code}`,
            category: resultData.timedOut ? 'timeout' : 'execution',
            command: job.command,
            args: job.args,
            workingDirectory: job.workingDirectory,
            processState: {
              pid: resultData.pid,
              spawnfile: job.command,
              spawnargs: [job.command, ...job.args],
              killed: resultData.killed || false,
              exitCode: code,
              signalCode: null
            },
            suggestedAction: resultData.timedOut 
              ? 'Consider increasing timeout or optimizing the command'
              : 'Check stderr output and command arguments',
            timestamp: Date.now()
          };

          await this.queue.updateJob(jobId, {
            status,
            completedAt: resultData.endTime,
            exitCode: code ?? undefined, // Convert null to undefined
            executionTime,
            timedOut: resultData.timedOut,
            killed: resultData.killed,
            pid: resultData.pid,
            error: `${message}. Exit code: ${code}`,
            progressMessage: message,
            progressPercentage: 100,
            currentPhase: 'failed',
            detailedError
          });

          this.emit('jobFailed', jobId, { 
            error: message, 
            exitCode: code,
            timedOut: resultData.timedOut,
            detailedError
          });
        }
      });

      // Handle process errors with detailed information
      child.on('error', async (error: NodeJS.ErrnoException) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(jobId);

        const detailedError = this.createDetailedError(error, job, 'spawn');

        this.logger.error('AsyncJobProcessor', 'Job execution error', 'executeJob', {
          jobId,
          error: error.message,
          errno: error.errno,
          code: error.code,
          syscall: error.syscall,
          path: error.path,
          detailedError
        });

        await this.queue.updateJob(jobId, {
          status: 'execution_failed',
          completedAt: Date.now(),
          error: `Process error: ${error.message}`,
          progressMessage: 'Command execution failed',
          currentPhase: 'failed',
          detailedError
        });

        this.emit('jobFailed', jobId, { 
          error: error.message,
          detailedError 
        });
      });

    } catch (error) {
      this.activeProcesses.delete(jobId);
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      // Create detailed error for setup failures
      const detailedError: JobDetailedError = {
        message: errorMsg,
        category: 'system',
        command: job.command,
        args: job.args,
        workingDirectory: job.workingDirectory,
        suggestedAction: 'Check system resources and permissions',
        originalError: errorMsg,
        timestamp: Date.now()
      };
      
      this.logger.error('AsyncJobProcessor', 'Failed to execute job', 'executeJob', {
        jobId,
        error: errorMsg,
        detailedError
      });

      await this.queue.updateJob(jobId, {
        status: 'execution_failed',
        completedAt: Date.now(),
        error: `Execution setup failed: ${errorMsg}`,
        progressMessage: 'Failed to start command execution',
        currentPhase: 'failed',
        detailedError
      });

      this.emit('jobFailed', jobId, { 
        error: errorMsg,
        detailedError 
      });
    }
  }

  /**
   * Kill a running job
   */
  private killJob(jobId: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const process = this.activeProcesses.get(jobId);
    if (!process) return false;

    try {
      process.kill(signal);
      
      this.logger.info('AsyncJobProcessor', 'Job process killed', 'killJob', {
        jobId,
        pid: process.pid,
        signal
      });
      
      return true;
    } catch (error) {
      this.logger.error('AsyncJobProcessor', 'Failed to kill job process', 'killJob', {
        jobId,
        pid: process.pid,
        signal,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * Update job progress based on output
   */
  private async updateJobProgress(jobId: string, output: string): Promise<void> {
    try {
      // Simple progress detection based on common patterns
      let progressPercentage: number | undefined;
      let progressMessage: string | undefined;

      // Look for percentage patterns
      const percentMatch = output.match(/(\d+)%/);
      if (percentMatch) {
        progressPercentage = parseInt(percentMatch[1]);
      }

      // Look for operation-specific progress indicators
      if (output.includes('Installing') || output.includes('Downloading')) {
        progressMessage = 'Installing dependencies...';
        progressPercentage = progressPercentage || 30;
      } else if (output.includes('Building') || output.includes('Compiling')) {
        progressMessage = 'Building project...';
        progressPercentage = progressPercentage || 60;
      } else if (output.includes('Testing') || output.includes('Running tests')) {
        progressMessage = 'Running tests...';
        progressPercentage = progressPercentage || 80;
      }

      // Only update if we have something to update
      if (progressPercentage !== undefined || progressMessage !== undefined) {
        const update: any = {};
        if (progressPercentage !== undefined) update.progressPercentage = progressPercentage;
        if (progressMessage !== undefined) update.progressMessage = progressMessage;

        await this.queue.updateJob(jobId, update);
      }

    } catch (error) {
      // Progress updates are not critical, just log
      this.logger.debug('AsyncJobProcessor', 'Failed to update job progress', 'updateJobProgress', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Save job execution results to files
   */
  private async saveJobResults(job: JobRecord, resultData: JobResultData): Promise<void> {
    try {
      const paths = getJobFilePaths(this.queue.getBaseDirectory(), job);
      
      // Save metadata
      const metadata = {
        jobId: job.id,
        command: job.command,
        args: job.args,
        workingDirectory: job.workingDirectory,
        startTime: resultData.startTime,
        endTime: resultData.endTime,
        executionTime: resultData.endTime - resultData.startTime,
        exitCode: resultData.exitCode,
        timedOut: resultData.timedOut,
        killed: resultData.killed,
        pid: resultData.pid,
        stdoutSize: resultData.stdout.length,
        stderrSize: resultData.stderr.length
      };

      await fs.writeFile(paths.metadataFile, JSON.stringify(metadata, null, 2), 'utf8');

      this.logger.debug('AsyncJobProcessor', 'Job results saved', 'saveJobResults', {
        jobId: job.id,
        stdoutSize: resultData.stdout.length,
        stderrSize: resultData.stderr.length,
        executionTime: metadata.executionTime
      });

    } catch (error) {
      this.logger.error('AsyncJobProcessor', 'Failed to save job results', 'saveJobResults', {
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Wait for all active processes to complete
   */
  private async waitForProcessesToComplete(timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (this.activeProcesses.size > 0 && (Date.now() - startTime) < timeout) {
      this.logger.info('AsyncJobProcessor', 'Waiting for processes to complete', 'waitForProcessesToComplete', {
        activeProcesses: this.activeProcesses.size,
        elapsed: Date.now() - startTime,
        timeout
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Force kill remaining processes
    if (this.activeProcesses.size > 0) {
      this.logger.warn('AsyncJobProcessor', 'Force killing remaining processes', 'waitForProcessesToComplete', {
        remainingProcesses: this.activeProcesses.size
      });
      
      for (const [jobId] of this.activeProcesses) {
        this.killJob(jobId, 'SIGKILL');
      }
      
      this.activeProcesses.clear();
    }
  }
}

/**
 * Load execution results from files
 */
export async function loadJobResults(
  baseDir: string,
  job: JobRecord
): Promise<{
  stdout: string;
  stderr: string;
  metadata?: any;
} | null> {
  try {
    const paths = getJobFilePaths(baseDir, job);
    
    // Check if result files exist
    try {
      await fs.access(paths.stdoutFile);
    } catch {
      return null; // Results not available
    }

    // Read result files
    const [stdout, stderr, metadataJson] = await Promise.all([
      fs.readFile(paths.stdoutFile, 'utf8').catch(() => ''),
      fs.readFile(paths.stderrFile, 'utf8').catch(() => ''),
      fs.readFile(paths.metadataFile, 'utf8').catch(() => '{}')
    ]);

    const metadata = JSON.parse(metadataJson);

    return {
      stdout,
      stderr,
      metadata
    };

  } catch (error) {
    throw new Error(`Failed to load job results: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
