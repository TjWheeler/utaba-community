/**
 * Approval System - Main Export Module
 * 
 * File-based workflow approval system for MCP Shell commands
 */

export * from './types.js';
export { ApprovalQueue } from './queue.js';
export { ApprovalServer } from './server.js';
export { ApprovalManager } from './manager.js';

// Re-export main classes for convenience
import { ApprovalManager } from './manager.js';
import { ApprovalQueue } from './queue.js';
import { ApprovalServer } from './server.js';

export {
  ApprovalManager as Manager,
  ApprovalQueue as Queue,
  ApprovalServer as Server
};

// Default export is the main manager
export default ApprovalManager;
