/**
 * Async Job Queue Types and Interfaces
 *
 * Comprehensive type system for asynchronous command execution with conversation context
 */
// Type Guards for runtime validation
export function isJobStatus(value) {
    const validStatuses = [
        "pending_approval", "approved", "executing", "completed",
        "rejected", "approval_timeout", "execution_timeout",
        "execution_failed", "cancelled", "expired"
    ];
    return validStatuses.includes(value);
}
export function isOperationType(value) {
    const validTypes = [
        "package_install", "build_compile", "docker_build",
        "test_suite", "code_generation", "deployment",
        "database", "other"
    ];
    return validTypes.includes(value);
}
// Constants for configuration
export const DEFAULT_POLLING_INTERVALS = {
    approval: {
        initial: 10000, // 10 seconds
        max: 30000, // 30 seconds
        backoff: 1.5
    },
    execution: {
        initial: 120000, // 2 minutes
        max: 900000, // 15 minutes
        backoff: 2.0
    }
};
export const JOB_EXPIRATION = {
    results: 24 * 60 * 60 * 1000, // 24 hours
    archive: 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanup: 30 * 24 * 60 * 60 * 1000 // 30 days
};
export const MAX_OUTPUT_SIZE = {
    inline: 10 * 1024, // 10KB inline in job record
    file: 100 * 1024 * 1024 // 100MB in separate files
};
export const DEFAULT_PROCESSOR_CONFIG = {
    maxConcurrentJobs: 5,
    processingInterval: 5000, // 5 seconds
    shutdownTimeout: 30000, // 30 seconds
    progressUpdateInterval: 10000, // 10 seconds
    resultFileThreshold: 10 * 1024 // 10KB
};
//# sourceMappingURL=types.js.map