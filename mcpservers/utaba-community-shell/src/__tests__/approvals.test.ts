/**
 * Approval System Tests
 * 
 * Comprehensive tests for the command approval workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalManager } from '../approvals/manager.js';
import { ApprovalQueue } from '../approvals/queue.js';
import { ApprovalServer } from '../approvals/server.js';
import { ApprovalError, ApprovalTimeoutError } from '../approvals/types.js';
import { Logger } from '../logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Approval System', () => {
  let testDir: string;
  let logger: Logger;
  let approvalQueue: ApprovalQueue;
  let approvalManager: ApprovalManager;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'approval-test-'));
    
    // Initialize logger for testing
    logger = new Logger({ 
      level: 'DEBUG',
      console: false,  // Disable console output during tests
      logFile: null    // Disable file logging during tests
    });
    await logger.initialize();

    // Initialize approval components
    approvalQueue = new ApprovalQueue(testDir, logger);
    await approvalQueue.initialize();

    approvalManager = new ApprovalManager(testDir, logger);
    await approvalManager.initialize();
  });

  afterEach(async () => {
    // Cleanup
    if (approvalManager) {
      await approvalManager.shutdown();
    }
    if (approvalQueue) {
      await approvalQueue.cleanup();
    }
    if (logger) {
      await logger.shutdown();
    }
    
    // Remove test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('ApprovalQueue', () => {
    it('should initialize successfully', async () => {
      expect(approvalQueue).toBeDefined();
      
      const stats = await approvalQueue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.total).toBe(0);
    });

    it('should create and track approval requests', async () => {
      const request = await approvalQueue.createRequest(
        'npx',
        ['create-react-app', 'test-app'],
        '/tmp/test',
        300000
      );

      expect(request.id).toBeDefined();
      expect(request.command).toBe('npx');
      expect(request.args).toEqual(['create-react-app', 'test-app']);
      expect(request.workingDirectory).toBe('/tmp/test');
      expect(request.status).toBe('pending');
      expect(request.riskScore).toBeGreaterThan(0);

      const stats = await approvalQueue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.total).toBe(1);
    });

    it('should approve requests correctly', async () => {
      const request = await approvalQueue.createRequest(
        'npx',
        ['prettier', '--check', '.'],
        '/tmp/test',
        60000
      );

      await approvalQueue.approveRequest(request.id, 'test-user');

      const approvedRequest = await approvalQueue.getRequest(request.id);
      expect(approvedRequest?.status).toBe('approved');
      expect(approvedRequest?.decidedBy).toBe('test-user');
      expect(approvedRequest?.decidedAt).toBeDefined();

      const stats = await approvalQueue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.approved).toBe(1);
    });

    it('should reject requests correctly', async () => {
      const request = await approvalQueue.createRequest(
        'npx',
        ['some-suspicious-package'],
        '/tmp/test',
        60000
      );

      await approvalQueue.rejectRequest(request.id, 'test-user', 'Suspicious package');

      const rejectedRequest = await approvalQueue.getRequest(request.id);
      expect(rejectedRequest?.status).toBe('rejected');
      expect(rejectedRequest?.decidedBy).toBe('test-user');

      const stats = await approvalQueue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.rejected).toBe(1);
    });

    it('should calculate risk scores appropriately', async () => {
      // Low risk command
      const lowRiskRequest = await approvalQueue.createRequest(
        'npx',
        ['prettier', '--check', '.'],
        '/tmp/test',
        60000
      );
      expect(lowRiskRequest.riskScore).toBeLessThanOrEqual(3);

      // High risk command
      const highRiskRequest = await approvalQueue.createRequest(
        'npx',
        ['unknown-package@latest'],
        '/tmp/test',
        60000
      );
      expect(highRiskRequest.riskScore).toBeGreaterThan(3);
    });

    it('should handle request timeouts', async () => {
      const request = await approvalQueue.createRequest(
        'npx',
        ['test-package'],
        '/tmp/test',
        100 // Very short timeout
      );

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const timedOutRequest = await approvalQueue.getRequest(request.id);
      expect(timedOutRequest?.status).toBe('timeout');
    });

    it('should emit events for request lifecycle', async () => {
      const events: string[] = [];
      
      approvalQueue.on('requestCreated', () => events.push('created'));
      approvalQueue.on('requestDecided', () => events.push('decided'));

      const request = await approvalQueue.createRequest(
        'npx',
        ['test-package'],
        '/tmp/test',
        60000
      );

      await approvalQueue.approveRequest(request.id, 'test-user');

      expect(events).toContain('created');
      expect(events).toContain('decided');
    });
  });

  describe('ApprovalManager', () => {
    it('should initialize and start server', async () => {
      const serverStatus = approvalManager.getServerStatus();
      expect(serverStatus.isRunning).toBe(true);
      expect(serverStatus.port).toBeGreaterThan(0);
      expect(serverStatus.url).toContain('localhost');
    });

    it('should handle approval workflow end-to-end', async () => {
      // Create a request through the manager
      const approvalPromise = approvalManager.requestApproval(
        'npx',
        ['prettier', '--check', '.'],
        '/tmp/test',
        5000 // 5 second timeout for test
      );

      // Wait a bit for the request to be created
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get pending requests and approve the first one
      const queue = (approvalManager as any).approvalQueue as ApprovalQueue;
      const pendingRequests = await queue.getPendingRequests();
      expect(pendingRequests).toHaveLength(1);

      const requestId = pendingRequests[0].id;
      await queue.approveRequest(requestId, 'test-user');

      // Wait for the approval promise to resolve
      const decision = await approvalPromise;
      expect(decision.decision).toBe('approve');
      expect(decision.decidedBy).toBe('test-user');
    });

    it('should handle rejection workflow', async () => {
      const approvalPromise = approvalManager.requestApproval(
        'npx',
        ['suspicious-package'],
        '/tmp/test',
        5000
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      const queue = (approvalManager as any).approvalQueue as ApprovalQueue;
      const pendingRequests = await queue.getPendingRequests();
      expect(pendingRequests).toHaveLength(1);

      const requestId = pendingRequests[0].id;
      await queue.rejectRequest(requestId, 'test-user', 'Security concern');

      const decision = await approvalPromise;
      expect(decision.decision).toBe('reject');
      expect(decision.decidedBy).toBe('test-user');
    });

    it('should handle timeout errors', async () => {
      const approvalPromise = approvalManager.requestApproval(
        'npx',
        ['test-package'],
        '/tmp/test',
        100 // Very short timeout
      );

      await expect(approvalPromise).rejects.toThrow(ApprovalTimeoutError);
    });

    it('should handle concurrent approval requests', async () => {
      const promises = [
        approvalManager.requestApproval('npx', ['package1'], '/tmp/test', 5000),
        approvalManager.requestApproval('npx', ['package2'], '/tmp/test', 5000),
        approvalManager.requestApproval('npx', ['package3'], '/tmp/test', 5000)
      ];

      await new Promise(resolve => setTimeout(resolve, 100));

      const queue = (approvalManager as any).approvalQueue as ApprovalQueue;
      const pendingRequests = await queue.getPendingRequests();
      expect(pendingRequests).toHaveLength(3);

      // Approve all requests
      for (const request of pendingRequests) {
        await queue.approveRequest(request.id, 'test-user');
      }

      const decisions = await Promise.all(promises);
      expect(decisions).toHaveLength(3);
      decisions.forEach(decision => {
        expect(decision.decision).toBe('approve');
      });
    });
  });

  describe('ApprovalServer', () => {
    let approvalServer: ApprovalServer;

    beforeEach(async () => {
      const serverConfig = {
        port: 0, // Auto-assign port
        autoLaunch: false, // Don't launch browser in tests
        timeout: 300000,
        authToken: 'test-token-123',
        logLevel: 'DEBUG',
        riskThreshold: 8
      };

      approvalServer = new ApprovalServer(approvalQueue, serverConfig, logger);
    });

    afterEach(async () => {
      if (approvalServer) {
        await approvalServer.stop();
      }
    });

    it('should start and stop server correctly', async () => {
      const serverInfo = await approvalServer.start();
      
      expect(serverInfo.port).toBeGreaterThan(0);
      expect(serverInfo.url).toContain('localhost');
      expect(serverInfo.authToken).toBe('test-token-123');

      const status = approvalServer.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.port).toBe(serverInfo.port);

      await approvalServer.stop();

      const statusAfterStop = approvalServer.getStatus();
      expect(statusAfterStop.isRunning).toBe(false);
    });

    it('should handle authentication correctly', async () => {
      const serverInfo = await approvalServer.start();
      
      // Test unauthorized request
      const unauthorizedResponse = await fetch(`http://localhost:${serverInfo.port}/api/stats`);
      expect(unauthorizedResponse.status).toBe(401);

      // Test authorized request
      const authorizedResponse = await fetch(
        `http://localhost:${serverInfo.port}/api/stats?token=test-token-123`
      );
      expect(authorizedResponse.status).toBe(200);
    });

    it('should serve approval UI', async () => {
      const serverInfo = await approvalServer.start();
      
      const response = await fetch(
        `http://localhost:${serverInfo.port}/?token=test-token-123`
      );
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');

      const html = await response.text();
      expect(html).toContain('Command Approval Center');
      expect(html).toContain('Utaba MCP Shell');
    });

    it('should provide health check endpoint', async () => {
      const serverInfo = await approvalServer.start();
      
      // Health check should not require auth
      const response = await fetch(`http://localhost:${serverInfo.port}/health`);
      
      expect(response.status).toBe(200);
      
      const health = await response.json();
      expect(health.status).toBe('ok');
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should complete full approval workflow with server', async () => {
      // Start the server
      const serverConfig = {
        port: 0,
        autoLaunch: false,
        timeout: 300000,
        authToken: 'integration-test-token',
        logLevel: 'DEBUG',
        riskThreshold: 8
      };

      const approvalServer = new ApprovalServer(approvalQueue, serverConfig, logger);
      const serverInfo = await approvalServer.start();

      try {
        // Start an approval request
        const approvalPromise = approvalManager.requestApproval(
          'npx',
          ['prettier', '--write', '.'],
          '/tmp/integration-test',
          10000
        );

        // Wait for request to be created
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get pending requests via API
        const pendingResponse = await fetch(
          `http://localhost:${serverInfo.port}/api/requests/pending?token=integration-test-token`
        );
        const pendingData = await pendingResponse.json();
        
        expect(pendingData.requests).toHaveLength(1);
        const requestId = pendingData.requests[0].id;

        // Approve via API
        const approveResponse = await fetch(
          `http://localhost:${serverInfo.port}/api/requests/${requestId}/approve?token=integration-test-token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decidedBy: 'integration-test' })
          }
        );

        expect(approveResponse.status).toBe(200);

        // Wait for approval to complete
        const decision = await approvalPromise;
        expect(decision.decision).toBe('approve');
        expect(decision.decidedBy).toBe('browser-user'); // Server normalizes this

      } finally {
        await approvalServer.stop();
      }
    });

    it('should handle approval system errors gracefully', async () => {
      // Test with invalid working directory
      await expect(
        approvalManager.requestApproval(
          'npx',
          ['test-package'],
          '', // Invalid working directory
          5000
        )
      ).rejects.toThrow(ApprovalError);
    });

    it('should clean up resources properly', async () => {
      // Create multiple requests
      await approvalQueue.createRequest('npx', ['package1'], '/tmp/test', 60000);
      await approvalQueue.createRequest('npx', ['package2'], '/tmp/test', 60000);
      await approvalQueue.createRequest('npx', ['package3'], '/tmp/test', 60000);

      let stats = await approvalQueue.getStats();
      expect(stats.pending).toBe(3);

      // Clean up
      await approvalQueue.cleanup();
      
      // Verify cleanup
      const cleanedQueue = new ApprovalQueue(testDir, logger);
      await cleanedQueue.initialize();
      
      stats = await cleanedQueue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.total).toBe(0);

      await cleanedQueue.cleanup();
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Create a queue with invalid directory
      const invalidQueue = new ApprovalQueue('/invalid/path/that/does/not/exist', logger);
      
      await expect(invalidQueue.initialize()).rejects.toThrow();
    });

    it('should handle server startup errors', async () => {
      const serverConfig = {
        port: 80, // Privileged port that should fail
        autoLaunch: false,
        timeout: 300000,
        authToken: 'test-token',
        logLevel: 'DEBUG',
        riskThreshold: 8
      };

      const server = new ApprovalServer(approvalQueue, serverConfig, logger);
      
      // Should fail to start on privileged port without permissions
      await expect(server.start()).rejects.toThrow();
    });

    it('should validate approval request parameters', async () => {
      await expect(
        approvalQueue.createRequest('', [], '/tmp/test', 60000)
      ).rejects.toThrow();

      await expect(
        approvalQueue.createRequest('npx', ['test'], '', 60000)
      ).rejects.toThrow();

      await expect(
        approvalQueue.createRequest('npx', ['test'], '/tmp/test', -1)
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const startTime = Date.now();
      
      // Create 50 concurrent requests
      const requests = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          approvalQueue.createRequest(
            'npx',
            [`package-${i}`],
            `/tmp/test-${i}`,
            60000
          )
        )
      );

      const creationTime = Date.now() - startTime;
      expect(creationTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(requests).toHaveLength(50);

      // Approve all requests
      const approvalStartTime = Date.now();
      await Promise.all(
        requests.map(request =>
          approvalQueue.approveRequest(request.id, 'performance-test')
        )
      );

      const approvalTime = Date.now() - approvalStartTime;
      expect(approvalTime).toBeLessThan(3000); // Should complete within 3 seconds

      const stats = await approvalQueue.getStats();
      expect(stats.approved).toBe(50);
      expect(stats.pending).toBe(0);
    });

    it('should maintain reasonable memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create and process many requests
      for (let i = 0; i < 100; i++) {
        const request = await approvalQueue.createRequest(
          'npx',
          [`memory-test-${i}`],
          `/tmp/test-${i}`,
          60000
        );
        await approvalQueue.approveRequest(request.id, 'memory-test');
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
