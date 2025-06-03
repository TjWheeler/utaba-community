/**
 * Approval Queue Types and Interfaces
 *
 * File-based approval system for command execution confirmations
 */
export interface ApprovalRequest {
    id: string;
    timestamp: string;
    command: string;
    args: string[];
    workingDirectory: string;
    packageName?: string;
    riskScore: number;
    riskFactors: string[];
    requestedBy: string;
    timeout: number;
    status: 'pending' | 'approved' | 'rejected' | 'timeout';
    createdAt: number;
    decidedAt?: number;
    decidedBy?: string;
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
    port: number;
    autoLaunch: boolean;
    timeout: number;
    authToken: string;
    logLevel: string;
    riskThreshold: number;
}
export interface RiskRule {
    pattern: string;
    score: number;
    description: string;
    autoReject?: boolean;
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
export declare class ApprovalError extends Error {
    readonly code: string;
    readonly requestId?: string | undefined;
    constructor(message: string, code: string, requestId?: string | undefined);
}
export declare class ApprovalTimeoutError extends ApprovalError {
    constructor(requestId: string, timeout: number);
}
export declare class ApprovalServerError extends ApprovalError {
    constructor(message: string, code?: string);
}
//# sourceMappingURL=types.d.ts.map