/**
 * Approval System - Main Export Module
 *
 * File-based workflow approval system for MCP Shell commands
 */
export * from './types.js';
export { ApprovalQueue } from './queue.js';
export { ApprovalServer } from './server.js';
export { ApprovalBridge } from './bridge.js';
export { ApprovalManager } from './manager.js';
// Re-export main classes for convenience
import { ApprovalManager } from './manager.js';
import { ApprovalQueue } from './queue.js';
import { ApprovalServer } from './server.js';
import { ApprovalBridge } from './bridge.js';
export { ApprovalManager as Manager, ApprovalQueue as Queue, ApprovalServer as Server, ApprovalBridge as Bridge };
// Default export is the main manager
export default ApprovalManager;
//# sourceMappingURL=index.js.map