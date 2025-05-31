 package name for npx commands
      const packageName = command === 'npx' && args.length > 0 ? args[0] : undefined;

      // Create approval request
      const request = await this.queue.createRequest(
        command,
        args,
        workingDirectory,
        packageName,
        timeout
      );

      this.logger.info('ApprovalManager', 'Approval request created', 'requestApproval', {
        requestId: request.id,
        command,
        args,
        packageName,
        riskScore: request.riskScore
      });

      // Start approval server if not already running
      await this.ensureServerRunning();

      // Wait for decision
      const decision = await this.queue.waitForDecision(request.id, timeout);

      this.logger.info('ApprovalManager', 'Approval decision received', 'requestApproval', {
        requestId: request.id,
        decision: decision.decision,
        decidedBy: decision.decidedBy
      });

      return decision;

    } catch (error) {
      if (error instanceof ApprovalTimeoutError) {
        this.logger.warn('ApprovalManager', 'Approval request timed out', 'requestApproval', {
          error: error.message,
          requestId: error.requestId
        });
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to process approval request', 'requestApproval', {
        error: errorMsg,
        command,
        args
      });
      throw new ApprovalError(`Approval request failed: ${errorMsg}`, 'REQUEST_ERROR');
    }
  }

  /**
   * Get pending approval requests
   */
  async getPendingRequests(): Promise<ApprovalRequest[]> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    return this.queue.getPendingRequests();
  }

  /**
   * Get approval queue statistics
   */
  async getStats() {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    return this.queue.getStats();
  }

  /**
   * Manually approve a request (for CLI or other interfaces)
   */
  async approveRequest(requestId: string, decidedBy: string = 'manual'): Promise<void> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    await this.queue.approveRequest(requestId, decidedBy);
  }

  /**
   * Manually reject a request (for CLI or other interfaces)
   */
  async rejectRequest(requestId: string, decidedBy: string = 'manual'): Promise<void> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    await this.queue.rejectRequest(requestId, decidedBy);
  }

  /**
   * Get server status
   */
  getServerStatus(): { isRunning: boolean; port?: number; url?: string } {
    if (!this.server) {
      return { isRunning: false };
    }

    const status = this.server.getStatus();
    return {
      ...status,
      url: status.isRunning && status.port && status.authToken 
        ? `http://localhost:${status.port}?token=${status.authToken}`
        : undefined
    };
  }

  /**
   * Clean up old approval records
   */
  async cleanup(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.isInitialized) {
      throw new ApprovalError('Approval system not initialized', 'NOT_INITIALIZED');
    }

    return this.queue.cleanup(olderThanMs);
  }

  /**
   * Shutdown the approval system
   */
  async shutdown(): Promise<void> {
    this.logger.info('ApprovalManager', 'Shutting down approval system', 'shutdown');

    try {
      if (this.server) {
        await this.server.stop();
        this.server = null;
      }

      if (this.isInitialized) {
        await this.queue.shutdown();
      }

      this.isInitialized = false;

      this.logger.info('ApprovalManager', 'Approval system shutdown complete', 'shutdown');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Error during shutdown', 'shutdown', {
        error: errorMsg
      });
      throw error;
    }
  }

  // Private helper methods

  private async ensureServerRunning(): Promise<void> {
    if (this.server && this.server.getStatus().isRunning) {
      return;
    }

    try {
      // Generate server configuration
      const serverConfig: ApprovalServerConfig = {
        port: 0, // Auto-assign port
        autoLaunch: true,
        timeout: 300000, // 5 minutes default
        authToken: this.generateSecureToken(),
        logLevel: 'info',
        riskThreshold: 8
      };

      // Create and start server
      this.server = new ApprovalServer(this.queue, serverConfig, this.logger);
      const { port, authToken, url } = await this.server.start();

      this.logger.info('ApprovalManager', 'Approval server started', 'ensureServerRunning', {
        port,
        url,
        authRequired: true
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to start approval server', 'ensureServerRunning', {
        error: errorMsg
      });
      throw new ApprovalError(`Failed to start approval server: ${errorMsg}`, 'SERVER_START_ERROR');
    }
  }

  private generateSecureToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
}

// Export everything from the approvals module
export * from './types.js';
export { ApprovalQueue } from './queue.js';
export { ApprovalServer } from './server.js';
server.getStatus().isRunning) {
      return;
    }

    try {
      // Generate server configuration
      const serverConfig: ApprovalServerConfig = {
        port: 0, // Auto-assign port
        autoLaunch: true,
        timeout: 300000, // 5 minutes default
        authToken: this.generateSecureToken(),
        logLevel: 'info',
        riskThreshold: 8
      };

      // Create and start server
      this.server = new ApprovalServer(this.queue, serverConfig, this.logger);
      const { port, authToken, url } = await this.server.start();

      this.logger.info('ApprovalManager', 'Approval server started', 'ensureServerRunning', {
        port,
        url,
        authRequired: true
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('ApprovalManager', 'Failed to start approval server', 'ensureServerRunning', {
        error: errorMsg
      });
      throw new ApprovalError(`Failed to start approval server: ${errorMsg}`, 'SERVER_START_ERROR');
    }
  }

  private generateSecureToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
}

// Export everything from the approvals module
export * from './types.js';
export { ApprovalQueue } from './queue.js';
export { ApprovalServer } from './server.js';
