/**
 * Approval Queue Types and Interfaces
 *
 * File-based approval system for command execution confirmations
 */
export class ApprovalError extends Error {
    code;
    requestId;
    constructor(message, code, requestId) {
        super(message);
        this.code = code;
        this.requestId = requestId;
        this.name = 'ApprovalError';
    }
}
export class ApprovalTimeoutError extends ApprovalError {
    constructor(requestId, timeout) {
        super(`Approval request ${requestId} timed out after ${timeout}ms`, 'APPROVAL_TIMEOUT', requestId);
    }
}
export class ApprovalServerError extends ApprovalError {
    constructor(message, code = 'SERVER_ERROR') {
        super(message, code);
    }
}
//# sourceMappingURL=types.js.map