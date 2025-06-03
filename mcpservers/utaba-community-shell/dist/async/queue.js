/**
 * File-Based Job Queue Manager
 *
 * Handles persistent storage and retrieval of async jobs using filesystem
 */
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { generateJobId, classifyOperation, estimateExecutionDuration, getJobFilePaths, validateJobRecord, createProgressMessage, isJobExpired, sanitizeJobForLogging } from './utils.js';
/**
 * Main job queue manager with file-based persistence
 */
export class AsyncJobQueue extends EventEmitter {
    logger;
    baseDir;
    config;
    isInitialized = false;
    watchdog;
    stats;
    constructor(config = {}, logger) {
        super();
        this.logger = logger;
        // Merge config with defaults
        this.config = {
            baseDir: config.baseDir || process.cwd(),
            queueSubdir: config.queueSubdir || 'async-queue',
            processingCapacity: config.processingCapacity || 5,
            cleanupInterval: config.cleanupInterval || 5 * 60 * 1000, // 5 minutes
            jobRetention: config.jobRetention || 7 * 24 * 60 * 60 * 1000 // 7 days
        };
        // Resolve full base directory path
        this.baseDir = path.resolve(this.config.baseDir, this.config.queueSubdir);
        this.stats = this.initializeStats();
    }
    /**
     * Get the current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get the resolved base directory path
     */
    getBaseDirectory() {
        return this.baseDir;
    }
    /**
     * Initialize the queue system
     */
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            // Create directory structure
            await this.ensureDirectoryStructure();
            // Load existing stats or create new
            await this.loadStats();
            // Start background maintenance
            this.startWatchdog();
            this.isInitialized = true;
            this.logger.info('AsyncJobQueue', 'Job queue initialized', 'initialize', {
                baseDir: this.baseDir,
                configuredBaseDir: this.config.baseDir,
                queueSubdir: this.config.queueSubdir,
                processingCapacity: this.config.processingCapacity,
                totalJobs: this.stats.totalJobs
            });
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('AsyncJobQueue', 'Failed to initialize job queue', 'initialize', {
                error: errorMsg,
                baseDir: this.baseDir,
                configuredBaseDir: this.config.baseDir
            });
            throw new Error(`Failed to initialize async job queue: ${errorMsg}`);
        }
    }
    /**
     * Submit a new job for processing
     */
    async submitJob(request) {
        if (!this.isInitialized) {
            throw new Error('Job queue not initialized');
        }
        try {
            // Determine initial status based on requiresConfirmation flag
            const initialStatus = request.requiresConfirmation === true
                ? 'pending_approval'
                : 'approved'; // AUTO-APPROVE if no confirmation needed
            const initialProgressMessage = request.requiresConfirmation === true
                ? 'Submitted for approval'
                : 'Approved automatically - queued for execution'; // Clear messaging
            // Create job record
            const job = {
                id: generateJobId(),
                conversationId: request.conversationId,
                sessionId: request.sessionId,
                command: request.command,
                args: request.args,
                workingDirectory: request.workingDirectory || process.cwd(),
                requestedTimeout: request.timeout || 300000, // 5 minutes default
                operationType: request.operationType || classifyOperation(request.command, request.args),
                userDescription: request.userDescription,
                // Timestamps
                submittedAt: Date.now(),
                lastUpdated: Date.now(),
                // CRITICAL FIX: Set status based on approval requirement
                status: initialStatus,
                progressMessage: initialProgressMessage,
                currentPhase: request.requiresConfirmation === true ? 'approval' : 'execution',
                // AUTO-SET approvedAt if no confirmation needed
                approvedAt: request.requiresConfirmation === true ? undefined : Date.now(),
                // Estimated duration
                estimatedDuration: request.estimatedDuration || estimateExecutionDuration(request.operationType || classifyOperation(request.command, request.args), request.command, request.args),
                // Initialize counters
                pollCount: 0,
                retryCount: 0,
                canRetry: true
            };
            // Validate job record
            const errors = validateJobRecord(job);
            if (errors.length > 0) {
                throw new Error(`Invalid job record: ${errors.map(e => e.message).join(', ')}`);
            }
            // Save job to filesystem
            await this.saveJob(job);
            // Update stats
            this.stats.totalJobs++;
            this.stats.queuedJobs++;
            await this.saveStats();
            this.logger.info('AsyncJobQueue', 'Job submitted successfully', 'submitJob', {
                jobId: job.id,
                command: job.command,
                operationType: job.operationType,
                estimatedDuration: job.estimatedDuration,
                requiresConfirmation: request.requiresConfirmation,
                initialStatus: job.status // Log the resolved status
            });
            // Emit event for listeners
            this.emit('jobSubmitted', job);
            return job;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('AsyncJobQueue', 'Failed to submit job', 'submitJob', {
                error: errorMsg,
                request: sanitizeJobForLogging(request)
            });
            throw new Error(`Failed to submit job: ${errorMsg}`);
        }
    }
    /**
     * Get job by ID
     */
    async getJob(jobId) {
        if (!this.isInitialized) {
            throw new Error('Job queue not initialized');
        }
        try {
            // Search across all status directories
            const statusDirs = ['pending_approval', 'approved', 'executing', 'completed', 'rejected', 'approval_timeout', 'execution_timeout', 'execution_failed', 'cancelled', 'expired'];
            for (const status of statusDirs) {
                const jobPath = path.join(this.baseDir, 'jobs', status, jobId, 'job.json');
                try {
                    const data = await fs.readFile(jobPath, 'utf8');
                    const job = JSON.parse(data);
                    // Update last polled timestamp
                    job.lastPolledAt = Date.now();
                    job.pollCount = (job.pollCount || 0) + 1;
                    await this.saveJob(job);
                    return job;
                }
                catch (error) {
                    // Job not in this status directory, continue searching
                    continue;
                }
            }
            this.logger.debug('AsyncJobQueue', 'Job not found', 'getJob', { jobId });
            return null;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('AsyncJobQueue', 'Failed to get job', 'getJob', {
                error: errorMsg,
                jobId
            });
            throw new Error(`Failed to get job: ${errorMsg}`);
        }
    }
    /**
     * Update job status and properties
     */
    async updateJob(jobId, update) {
        if (!this.isInitialized) {
            throw new Error('Job queue not initialized');
        }
        try {
            const currentJob = await this.getJob(jobId);
            if (!currentJob) {
                throw new Error(`Job ${jobId} not found`);
            }
            const oldStatus = currentJob.status;
            const updatedJob = {
                ...currentJob,
                ...update,
                lastUpdated: Date.now()
            };
            // Update progress message if not provided
            if (!update.progressMessage) {
                updatedJob.progressMessage = createProgressMessage(updatedJob);
            }
            // If status changed, move job to new directory
            if (update.status && update.status !== oldStatus) {
                await this.moveJobToStatus(updatedJob, oldStatus, update.status);
                // Update stats
                this.updateStatsForStatusChange(oldStatus, update.status);
                await this.saveStats();
                this.logger.info('AsyncJobQueue', 'Job status changed', 'updateJob', {
                    jobId,
                    oldStatus,
                    newStatus: update.status
                });
                // Emit status change event
                this.emit('jobStatusChanged', updatedJob, oldStatus);
            }
            else {
                // Just update the job file
                await this.saveJob(updatedJob);
            }
            return updatedJob;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('AsyncJobQueue', 'Failed to update job', 'updateJob', {
                error: errorMsg,
                jobId,
                update
            });
            throw new Error(`Failed to update job: ${errorMsg}`);
        }
    }
    /**
     * List jobs with optional filtering
     */
    async listJobs(options = {}) {
        if (!this.isInitialized) {
            throw new Error('Job queue not initialized');
        }
        try {
            const jobs = [];
            const statusDirs = options.status ? [options.status] :
                ['pending_approval', 'approved', 'executing', 'completed', 'rejected', 'approval_timeout', 'execution_timeout', 'execution_failed', 'cancelled'];
            for (const status of statusDirs) {
                const statusDir = path.join(this.baseDir, 'jobs', status);
                try {
                    const jobDirs = await fs.readdir(statusDir);
                    for (const jobDir of jobDirs) {
                        const jobPath = path.join(statusDir, jobDir, 'job.json');
                        try {
                            const data = await fs.readFile(jobPath, 'utf8');
                            const job = JSON.parse(data);
                            // Apply filters
                            if (options.operationType && job.operationType !== options.operationType)
                                continue;
                            if (options.conversationId && job.conversationId !== options.conversationId)
                                continue;
                            // Create summary
                            const summary = {
                                id: job.id,
                                status: job.status,
                                command: job.command,
                                operationType: job.operationType,
                                submittedAt: job.submittedAt,
                                lastUpdated: job.lastUpdated,
                                progressMessage: job.progressMessage,
                                progressPercentage: job.progressPercentage,
                                userDescription: job.userDescription,
                                executionToken: job.status === 'completed' ? job.executionToken : undefined,
                                error: job.error
                            };
                            // Calculate estimated time remaining
                            if (job.status === 'executing' && job.estimatedDuration) {
                                const elapsed = Date.now() - (job.startedAt || job.submittedAt);
                                const remaining = job.estimatedDuration - elapsed;
                                if (remaining > 0) {
                                    summary.estimatedTimeRemaining = remaining;
                                }
                            }
                            jobs.push(summary);
                        }
                        catch (error) {
                            // Skip invalid job files
                            this.logger.warn('AsyncJobQueue', 'Skipping invalid job file', 'listJobs', {
                                jobPath,
                                error: error instanceof Error ? error.message : 'Unknown error'
                            });
                        }
                    }
                }
                catch (error) {
                    // Status directory doesn't exist, skip
                    continue;
                }
            }
            // Sort by submission time (newest first)
            jobs.sort((a, b) => b.submittedAt - a.submittedAt);
            // Apply pagination
            const offset = options.offset || 0;
            const limit = options.limit || jobs.length;
            return jobs.slice(offset, offset + limit);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('AsyncJobQueue', 'Failed to list jobs', 'listJobs', {
                error: errorMsg,
                options
            });
            throw new Error(`Failed to list jobs: ${errorMsg}`);
        }
    }
    /**
     * Get queue statistics
     */
    async getStats() {
        if (!this.isInitialized) {
            throw new Error('Job queue not initialized');
        }
        // Refresh stats from filesystem
        await this.refreshStats();
        return { ...this.stats };
    }
    /**
     * Clean up expired jobs
     */
    async cleanup(options = {}) {
        if (!this.isInitialized) {
            throw new Error('Job queue not initialized');
        }
        const maxAge = options.maxAge || this.config.jobRetention;
        const dryRun = options.dryRun || false;
        let removed = 0;
        let archived = 0;
        try {
            const completedJobs = await this.listJobs({ status: 'completed' });
            for (const jobSummary of completedJobs) {
                const job = await this.getJob(jobSummary.id);
                if (!job || !job.completedAt)
                    continue;
                const age = Date.now() - job.completedAt;
                if (age > maxAge) {
                    if (!dryRun) {
                        if (isJobExpired(job)) {
                            await this.removeJob(job.id);
                            removed++;
                        }
                        else {
                            await this.archiveJob(job);
                            archived++;
                        }
                    }
                    else {
                        if (isJobExpired(job)) {
                            removed++;
                        }
                        else {
                            archived++;
                        }
                    }
                }
            }
            this.logger.info('AsyncJobQueue', 'Cleanup completed', 'cleanup', {
                removed,
                archived,
                maxAge,
                dryRun
            });
            return { removed, archived };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('AsyncJobQueue', 'Failed to cleanup jobs', 'cleanup', {
                error: errorMsg,
                options
            });
            throw new Error(`Failed to cleanup jobs: ${errorMsg}`);
        }
    }
    /**
     * Shutdown the queue system
     */
    async shutdown() {
        this.logger.info('AsyncJobQueue', 'Shutting down job queue', 'shutdown');
        if (this.watchdog) {
            clearInterval(this.watchdog);
            this.watchdog = undefined;
        }
        this.isInitialized = false;
        this.removeAllListeners();
        this.logger.info('AsyncJobQueue', 'Job queue shutdown complete', 'shutdown');
    }
    // Private helper methods
    async ensureDirectoryStructure() {
        const dirs = [
            this.baseDir,
            path.join(this.baseDir, 'jobs'),
            path.join(this.baseDir, 'jobs', 'pending_approval'),
            path.join(this.baseDir, 'jobs', 'approved'),
            path.join(this.baseDir, 'jobs', 'executing'),
            path.join(this.baseDir, 'jobs', 'completed'),
            path.join(this.baseDir, 'jobs', 'rejected'),
            path.join(this.baseDir, 'jobs', 'approval_timeout'),
            path.join(this.baseDir, 'jobs', 'execution_timeout'),
            path.join(this.baseDir, 'jobs', 'execution_failed'),
            path.join(this.baseDir, 'jobs', 'cancelled'),
            path.join(this.baseDir, 'jobs', 'expired'),
            path.join(this.baseDir, 'results'),
            path.join(this.baseDir, 'conversations'),
            path.join(this.baseDir, 'archive')
        ];
        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            }
            catch (error) {
                // Directory might already exist
            }
        }
    }
    async saveJob(job) {
        const paths = getJobFilePaths(this.baseDir, job);
        // Ensure job directory exists
        await fs.mkdir(paths.jobDir, { recursive: true });
        // Save job record
        await fs.writeFile(paths.jobFile, JSON.stringify(job, null, 2), 'utf8');
    }
    async moveJobToStatus(job, oldStatus, newStatus) {
        const oldPaths = getJobFilePaths(this.baseDir, { ...job, status: oldStatus });
        const newPaths = getJobFilePaths(this.baseDir, { ...job, status: newStatus });
        // Create new directory
        await fs.mkdir(newPaths.jobDir, { recursive: true });
        // Update job status
        job.status = newStatus;
        // Save job in new location
        await this.saveJob(job);
        // Remove old job directory
        try {
            await fs.rm(oldPaths.jobDir, { recursive: true, force: true });
        }
        catch (error) {
            // Old directory might not exist
        }
    }
    async removeJob(jobId) {
        const job = await this.getJob(jobId);
        if (!job)
            return;
        const paths = getJobFilePaths(this.baseDir, job);
        try {
            await fs.rm(paths.jobDir, { recursive: true, force: true });
            await fs.rm(paths.resultDir, { recursive: true, force: true });
        }
        catch (error) {
            // Directories might not exist
        }
    }
    async archiveJob(job) {
        // Implementation for archiving jobs (compress and move to archive)
        // For now, just move to expired status
        await this.updateJob(job.id, { status: 'expired' });
    }
    initializeStats() {
        return {
            totalJobs: 0,
            activeJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            queuedJobs: 0,
            averageExecutionTime: 0,
            averageApprovalTime: 0,
            systemLoad: 'low',
            processingCapacity: this.config.processingCapacity
        };
    }
    async loadStats() {
        try {
            const statsPath = path.join(this.baseDir, 'stats.json');
            const data = await fs.readFile(statsPath, 'utf8');
            this.stats = { ...this.stats, ...JSON.parse(data) };
        }
        catch (error) {
            // Stats file doesn't exist, use defaults
            await this.saveStats();
        }
    }
    async saveStats() {
        const statsPath = path.join(this.baseDir, 'stats.json');
        await fs.writeFile(statsPath, JSON.stringify(this.stats, null, 2), 'utf8');
    }
    async refreshStats() {
        // Recalculate stats from filesystem
        const jobs = await this.listJobs();
        this.stats.totalJobs = jobs.length;
        this.stats.activeJobs = jobs.filter(j => ['pending_approval', 'approved', 'executing'].includes(j.status)).length;
        this.stats.completedJobs = jobs.filter(j => j.status === 'completed').length;
        this.stats.failedJobs = jobs.filter(j => ['execution_failed', 'execution_timeout', 'approval_timeout'].includes(j.status)).length;
        this.stats.queuedJobs = jobs.filter(j => ['pending_approval', 'approved'].includes(j.status)).length;
        // Calculate load
        if (this.stats.activeJobs >= this.stats.processingCapacity * 0.8) {
            this.stats.systemLoad = 'high';
        }
        else if (this.stats.activeJobs >= this.stats.processingCapacity * 0.5) {
            this.stats.systemLoad = 'medium';
        }
        else {
            this.stats.systemLoad = 'low';
        }
        await this.saveStats();
    }
    updateStatsForStatusChange(oldStatus, newStatus) {
        // Update counters based on status change
        if (['pending_approval', 'approved', 'executing'].includes(oldStatus) &&
            !['pending_approval', 'approved', 'executing'].includes(newStatus)) {
            this.stats.activeJobs--;
        }
        if (!['pending_approval', 'approved', 'executing'].includes(oldStatus) &&
            ['pending_approval', 'approved', 'executing'].includes(newStatus)) {
            this.stats.activeJobs++;
        }
        if (newStatus === 'completed') {
            this.stats.completedJobs++;
        }
        if (['execution_failed', 'execution_timeout', 'approval_timeout'].includes(newStatus)) {
            this.stats.failedJobs++;
        }
    }
    startWatchdog() {
        // Run maintenance using configured interval
        this.watchdog = setInterval(async () => {
            try {
                await this.refreshStats();
                // Clean up expired jobs using configured retention period
                await this.cleanup({ maxAge: this.config.jobRetention });
            }
            catch (error) {
                this.logger.error('AsyncJobQueue', 'Watchdog maintenance failed', 'watchdog', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }, this.config.cleanupInterval);
    }
}
//# sourceMappingURL=queue.js.map