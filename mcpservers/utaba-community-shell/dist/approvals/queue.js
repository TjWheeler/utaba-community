import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { ApprovalError, ApprovalTimeoutError } from './types.js';
/**
 * File-based approval queue manager
 *
 * Provides atomic operations for approval requests using file system
 * as the communication mechanism between MCP shell and browser UI.
 */
export class ApprovalQueue extends EventEmitter {
    baseDir;
    logger;
    queueDir;
    pendingDir;
    approvedDir;
    rejectedDir;
    configDir;
    manifestPath;
    watchInterval = null;
    isWatching = false;
    constructor(baseDir, logger) {
        super();
        this.baseDir = baseDir;
        this.logger = logger;
        this.queueDir = path.join(baseDir, 'approval-queue');
        this.pendingDir = path.join(this.queueDir, 'pending');
        this.approvedDir = path.join(this.queueDir, 'approved');
        this.rejectedDir = path.join(this.queueDir, 'rejected');
        this.configDir = path.join(this.queueDir, 'config');
        this.manifestPath = path.join(this.queueDir, 'manifest.json');
    }
    /**
     * Initialize the approval queue directory structure
     */
    async initialize() {
        try {
            // Create directory structure
            await fs.mkdir(this.queueDir, { recursive: true });
            await fs.mkdir(this.pendingDir, { recursive: true });
            await fs.mkdir(this.approvedDir, { recursive: true });
            await fs.mkdir(this.rejectedDir, { recursive: true });
            await fs.mkdir(this.configDir, { recursive: true });
            // Initialize manifest if it doesn't exist
            await this.initializeManifest();
            this.logger.info('ApprovalQueue', 'Approval queue initialized', 'initialize', {
                queueDir: this.queueDir
            });
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('ApprovalQueue', 'Failed to initialize approval queue', 'initialize', {
                error: errorMsg
            });
            throw new ApprovalError(`Failed to initialize approval queue: ${errorMsg}`, 'INIT_ERROR');
        }
    }
    /**
     * Create a new approval request
     */
    async createRequest(command, args, workingDirectory, packageName, timeout = 300000) {
        const requestId = this.generateRequestId();
        const timestamp = new Date().toISOString();
        const createdAt = Date.now();
        // Calculate risk score (basic implementation)
        const { riskScore, riskFactors } = this.calculateRisk(command, args, packageName);
        const request = {
            id: requestId,
            timestamp,
            command,
            args,
            workingDirectory,
            packageName,
            riskScore,
            riskFactors,
            requestedBy: 'mcp-shell',
            timeout,
            status: 'pending',
            createdAt
        };
        try {
            // Write request file atomically
            const requestPath = path.join(this.pendingDir, `${requestId}.json`);
            const tempPath = `${requestPath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(request, null, 2));
            await fs.rename(tempPath, requestPath);
            // Update manifest
            await this.updateManifest();
            this.logger.info('ApprovalQueue', 'Approval request created', 'createRequest', {
                requestId,
                command,
                args,
                riskScore,
                timeout
            });
            this.emit('requestCreated', request);
            return request;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('ApprovalQueue', 'Failed to create approval request', 'createRequest', {
                requestId,
                error: errorMsg
            });
            throw new ApprovalError(`Failed to create approval request: ${errorMsg}`, 'CREATE_ERROR', requestId);
        }
    }
    /**
     * Wait for approval decision on a request
     */
    async waitForDecision(requestId, timeoutMs) {
        const request = await this.getRequest(requestId);
        if (!request) {
            throw new ApprovalError(`Request ${requestId} not found`, 'REQUEST_NOT_FOUND', requestId);
        }
        const timeout = timeoutMs || request.timeout;
        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            const checkInterval = 1000; // Check every second
            const timeoutHandle = setTimeout(() => {
                clearInterval(pollHandle);
                this.handleTimeout(requestId)
                    .catch(error => this.logger.error('ApprovalQueue', 'Error handling timeout', 'waitForDecision', { error }));
                reject(new ApprovalTimeoutError(requestId, timeout));
            }, timeout);
            const pollHandle = setInterval(async () => {
                try {
                    const currentRequest = await this.getRequest(requestId);
                    if (!currentRequest) {
                        clearTimeout(timeoutHandle);
                        clearInterval(pollHandle);
                        reject(new ApprovalError(`Request ${requestId} not found`, 'REQUEST_NOT_FOUND', requestId));
                        return;
                    }
                    if (currentRequest.status === 'approved' || currentRequest.status === 'rejected') {
                        clearTimeout(timeoutHandle);
                        clearInterval(pollHandle);
                        const decision = {
                            requestId,
                            decision: currentRequest.status === 'approved' ? 'approve' : 'reject',
                            timestamp: currentRequest.decidedAt || Date.now(),
                            decidedBy: currentRequest.decidedBy || 'unknown'
                        };
                        this.logger.info('ApprovalQueue', 'Approval decision received', 'waitForDecision', {
                            requestId,
                            decision: decision.decision,
                            decisionTime: Date.now() - startTime
                        });
                        resolve(decision);
                    }
                }
                catch (error) {
                    clearTimeout(timeoutHandle);
                    clearInterval(pollHandle);
                    reject(error);
                }
            }, checkInterval);
        });
    }
    /**
     * Approve a request
     */
    async approveRequest(requestId, decidedBy = 'user') {
        await this.processDecision(requestId, 'approved', decidedBy);
    }
    /**
     * Reject a request
     */
    async rejectRequest(requestId, decidedBy = 'user') {
        await this.processDecision(requestId, 'rejected', decidedBy);
    }
    /**
     * Get a specific request
     */
    async getRequest(requestId) {
        // Check pending first
        try {
            const pendingPath = path.join(this.pendingDir, `${requestId}.json`);
            const content = await fs.readFile(pendingPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            // Not in pending, check approved/rejected
        }
        // Check approved
        try {
            const approvedPath = path.join(this.approvedDir, `${requestId}.json`);
            const content = await fs.readFile(approvedPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            // Not in approved
        }
        // Check rejected
        try {
            const rejectedPath = path.join(this.rejectedDir, `${requestId}.json`);
            const content = await fs.readFile(rejectedPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            // Not found anywhere
        }
        return null;
    }
    /**
     * Get all pending requests
     */
    async getPendingRequests() {
        try {
            const files = await fs.readdir(this.pendingDir);
            const requests = [];
            for (const file of files) {
                if (file.endsWith('.json') && file !== 'manifest.json') {
                    try {
                        const content = await fs.readFile(path.join(this.pendingDir, file), 'utf-8');
                        const request = JSON.parse(content);
                        requests.push(request);
                    }
                    catch (error) {
                        this.logger.warn('ApprovalQueue', 'Failed to read request file', 'getPendingRequests', {
                            file,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }
            }
            return requests.sort((a, b) => a.createdAt - b.createdAt);
        }
        catch (error) {
            this.logger.error('ApprovalQueue', 'Failed to get pending requests', 'getPendingRequests', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return [];
        }
    }
    /**
     * Get queue statistics
     */
    async getStats() {
        try {
            const [pendingFiles, approvedFiles, rejectedFiles] = await Promise.all([
                fs.readdir(this.pendingDir).then(files => files.filter(f => f.endsWith('.json'))),
                fs.readdir(this.approvedDir).then(files => files.filter(f => f.endsWith('.json'))),
                fs.readdir(this.rejectedDir).then(files => files.filter(f => f.endsWith('.json')))
            ]);
            // Calculate decision times from approved/rejected requests
            const decisionTimes = [];
            for (const dir of [this.approvedDir, this.rejectedDir]) {
                const files = dir === this.approvedDir ? approvedFiles : rejectedFiles;
                for (const file of files) {
                    try {
                        const content = await fs.readFile(path.join(dir, file), 'utf-8');
                        const request = JSON.parse(content);
                        if (request.decidedAt && request.createdAt) {
                            decisionTimes.push(request.decidedAt - request.createdAt);
                        }
                    }
                    catch (error) {
                        // Skip invalid files
                    }
                }
            }
            const averageDecisionTime = decisionTimes.length > 0
                ? decisionTimes.reduce((sum, time) => sum + time, 0) / decisionTimes.length
                : 0;
            const fastestDecision = decisionTimes.length > 0 ? Math.min(...decisionTimes) : 0;
            const slowestDecision = decisionTimes.length > 0 ? Math.max(...decisionTimes) : 0;
            return {
                pending: pendingFiles.length,
                approved: approvedFiles.length,
                rejected: rejectedFiles.length,
                timedOut: 0, // Would need to track this separately
                total: pendingFiles.length + approvedFiles.length + rejectedFiles.length,
                averageDecisionTime,
                fastestDecision,
                slowestDecision
            };
        }
        catch (error) {
            this.logger.error('ApprovalQueue', 'Failed to get queue stats', 'getStats', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
                pending: 0,
                approved: 0,
                rejected: 0,
                timedOut: 0,
                total: 0,
                averageDecisionTime: 0,
                fastestDecision: 0,
                slowestDecision: 0
            };
        }
    }
    /**
     * Clean up old completed requests
     */
    async cleanup(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
        let cleanedCount = 0;
        const cutoffTime = Date.now() - olderThanMs;
        for (const dir of [this.approvedDir, this.rejectedDir]) {
            try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    if (!file.endsWith('.json'))
                        continue;
                    try {
                        const filePath = path.join(dir, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const request = JSON.parse(content);
                        if (request.decidedAt && request.decidedAt < cutoffTime) {
                            await fs.unlink(filePath);
                            cleanedCount++;
                        }
                    }
                    catch (error) {
                        // Skip invalid files
                    }
                }
            }
            catch (error) {
                this.logger.error('ApprovalQueue', 'Failed to cleanup directory', 'cleanup', {
                    dir,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        if (cleanedCount > 0) {
            await this.updateManifest();
            this.logger.info('ApprovalQueue', 'Cleaned up old requests', 'cleanup', {
                cleanedCount,
                olderThanMs
            });
        }
        return cleanedCount;
    }
    /**
     * Shutdown the approval queue
     */
    async shutdown() {
        this.stopWatching();
        this.removeAllListeners();
        this.logger.info('ApprovalQueue', 'Approval queue shutdown', 'shutdown');
    }
    // Private helper methods
    generateRequestId() {
        const timestamp = Date.now().toString();
        const randomBytes = crypto.randomBytes(8).toString('hex');
        return `${timestamp}-${randomBytes}`;
    }
    calculateRisk(command, args, packageName) {
        const riskFactors = [];
        let riskScore = 3; // Base risk for npx commands
        // Package-specific risks
        if (packageName) {
            // Known risky patterns
            if (packageName.includes('exec') || packageName.includes('shell') || packageName.includes('eval')) {
                riskScore += 3;
                riskFactors.push('Package name contains execution-related keywords');
            }
            // Very short or suspicious names
            if (packageName.length <= 2) {
                riskScore += 2;
                riskFactors.push('Very short package name');
            }
            // Contains numbers that might indicate typosquatting
            if (/\d/.test(packageName) && packageName.length < 10) {
                riskScore += 1;
                riskFactors.push('Package name contains numbers (possible typosquatting)');
            }
        }
        // Argument-based risks
        if (args.some(arg => arg.includes('http://') || arg.includes('https://'))) {
            riskScore += 2;
            riskFactors.push('Arguments contain URLs');
        }
        if (args.some(arg => arg.includes('..') || arg.includes('/etc/') || arg.includes('C:\\\\'))) {
            riskScore += 3;
            riskFactors.push('Arguments contain potentially dangerous paths');
        }
        // Limit risk score to 1-10 range
        riskScore = Math.max(1, Math.min(10, riskScore));
        if (riskFactors.length === 0) {
            riskFactors.push('Standard npx package execution');
        }
        return { riskScore, riskFactors };
    }
    async processDecision(requestId, status, decidedBy) {
        try {
            const pendingPath = path.join(this.pendingDir, `${requestId}.json`);
            const targetDir = status === 'approved' ? this.approvedDir : this.rejectedDir;
            const targetPath = path.join(targetDir, `${requestId}.json`);
            // Read current request
            const content = await fs.readFile(pendingPath, 'utf-8');
            const request = JSON.parse(content);
            // Update request with decision
            request.status = status;
            request.decidedAt = Date.now();
            request.decidedBy = decidedBy;
            // Write to target directory atomically
            const tempPath = `${targetPath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(request, null, 2));
            await fs.rename(tempPath, targetPath);
            // Remove from pending
            await fs.unlink(pendingPath);
            // Update manifest
            await this.updateManifest();
            this.logger.info('ApprovalQueue', `Request ${status}`, 'processDecision', {
                requestId,
                status,
                decidedBy,
                command: request.command
            });
            this.emit('requestDecided', { request, decision: status, decidedBy });
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('ApprovalQueue', 'Failed to process decision', 'processDecision', {
                requestId,
                status,
                error: errorMsg
            });
            throw new ApprovalError(`Failed to process decision: ${errorMsg}`, 'DECISION_ERROR', requestId);
        }
    }
    async handleTimeout(requestId) {
        try {
            await this.processDecision(requestId, 'rejected', 'timeout');
            this.logger.warn('ApprovalQueue', 'Request timed out', 'handleTimeout', { requestId });
        }
        catch (error) {
            this.logger.error('ApprovalQueue', 'Failed to handle timeout', 'handleTimeout', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async initializeManifest() {
        try {
            await fs.access(this.manifestPath);
            // Manifest exists, update it
            await this.updateManifest();
        }
        catch (error) {
            // Manifest doesn't exist, create it
            const manifest = {
                version: '1.0',
                createdAt: Date.now(),
                lastUpdated: Date.now(),
                pendingCount: 0,
                approvedCount: 0,
                rejectedCount: 0,
                serverConfig: {
                    isRunning: false
                }
            };
            await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
        }
    }
    async updateManifest() {
        try {
            const stats = await this.getStats();
            let manifest;
            try {
                const content = await fs.readFile(this.manifestPath, 'utf-8');
                manifest = JSON.parse(content);
            }
            catch (error) {
                // Create new manifest if reading fails
                manifest = {
                    version: '1.0',
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                    pendingCount: 0,
                    approvedCount: 0,
                    rejectedCount: 0,
                    serverConfig: { isRunning: false }
                };
            }
            manifest.lastUpdated = Date.now();
            manifest.pendingCount = stats.pending;
            manifest.approvedCount = stats.approved;
            manifest.rejectedCount = stats.rejected;
            await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
        }
        catch (error) {
            this.logger.error('ApprovalQueue', 'Failed to update manifest', 'updateManifest', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    startWatching() {
        if (this.isWatching)
            return;
        this.isWatching = true;
        this.watchInterval = setInterval(async () => {
            try {
                const pendingRequests = await this.getPendingRequests();
                const now = Date.now();
                // Check for timed out requests
                for (const request of pendingRequests) {
                    if (now - request.createdAt > request.timeout) {
                        await this.handleTimeout(request.id);
                    }
                }
            }
            catch (error) {
                this.logger.error('ApprovalQueue', 'Error in watch interval', 'startWatching', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }, 10000); // Check every 10 seconds
    }
    stopWatching() {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
        this.isWatching = false;
    }
}
//# sourceMappingURL=queue.js.map