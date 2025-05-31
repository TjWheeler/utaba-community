/**
 * Approval Queue Types and Interfaces
 * 
 * File-based approval system for command execution confirmations
 */

export interface ApprovalRequest {
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
  createdAt: number;            // Unix timestamp
  decidedAt?: number;           // Unix timestamp when decision was made
  decidedBy?: string;           // User who made the decision
}

export interface ApprovalQueueManifest {
  version: string;
  createdAt: number;
  lastUpdated: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  serverConfig?: {
    port?: number;
    authToken?: string;
    isRunning: boolean;
  };
}

export interface ApprovalServerConfig {
  port: number;                 // Server port (default: auto-assigned)
  autoLaunch: boolean;         // Auto-launch browser (default: true)
  timeout: number;             // Default approval timeout (default: 300000ms)
  authToken: string;           // Required authentication token
  logLevel: string;            // Logging level for approval server
  riskThreshold: number;       // Auto-reject threshold (1-10, default: 9)
}

export interface RiskRule {
  pattern: string;             // Command/package pattern to match
  score: number;              // Risk score contribution (1-10)
  description: string;        // Human-readable risk explanation
  autoReject?: boolean;       // Automatically reject without user input
}

export interface ApprovalDecision {
  requestId: string;
  decision: 'approve' | 'reject';
  reason?: string;
  timestamp: number;
  decidedBy: string;
}

export interface ApprovalQueueStats {
  pending: number;
  approved: number;
  rejected: number;
  timedOut: number;
  total: number;
  averageDecisionTime: number;
  fastestDecision: number;
  slowestDecision: number;
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'ApprovalError';
  }
}

export class ApprovalTimeoutError extends ApprovalError {
  constructor(requestId: string, timeout: number) {
    super(
      `Approval request ${requestId} timed out after ${timeout}ms`,
      'APPROVAL_TIMEOUT',
      requestId
    );
  }
}

export class ApprovalServerError extends ApprovalError {
  constructor(message: string, code: string = 'SERVER_ERROR') {
    super(message, code);
  }
}
