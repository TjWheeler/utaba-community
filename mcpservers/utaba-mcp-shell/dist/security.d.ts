import { Config, CommandPattern } from './config';
export declare class SecurityError extends Error {
    readonly reason: string;
    constructor(message: string, reason: string);
}
export interface ValidationResult {
    allowed: boolean;
    reason?: string;
    matchedPattern?: CommandPattern;
    sanitizedArgs?: string[];
}
/**
 * Security validator for command execution
 *
 * CRITICAL SECURITY NOTICE:
 * This validation provides workflow control, not security isolation.
 * npm commands can execute arbitrary code and provide full system access.
 * Use only in trusted development environments.
 */
export declare class SecurityValidator {
    private config;
    constructor(config: Config);
    /**
     * Validate if a command execution request is allowed
     */
    validateCommand(command: string, args?: string[], workingDirectory?: string): ValidationResult;
    /**
     * Find command pattern that matches the requested command
     */
    private findMatchingPattern;
    /**
     * Validate command arguments against pattern rules
     */
    private validateArguments;
    /**
     * Validate working directory against pattern restrictions
     */
    private validateWorkingDirectory;
    /**
     * Check for common injection patterns in arguments
     *
     * Note: This is basic detection and cannot prevent all attacks.
     * The security model relies on trusted environment assumption.
     */
    private containsInjectionPatterns;
    /**
     * Sanitize environment variables for command execution
     */
    sanitizeEnvironment(additionalEnv?: Record<string, string>): Record<string, string>;
    /**
     * Check if an environment variable is allowed
     */
    private isEnvironmentVarAllowed;
    /**
     * Validate that the environment is properly configured for trusted operation
     */
    validateTrustedEnvironment(): void;
    /**
     * Get timeout for a specific command pattern
     */
    getCommandTimeout(pattern: CommandPattern): number;
    /**
     * Check if command requires confirmation
     */
    requiresConfirmation(pattern: CommandPattern): boolean;
}
/**
 * Path validation utilities
 */
export declare class PathValidator {
    static isWithinDirectory(filePath: string, directory: string): boolean;
    static sanitizePath(inputPath: string): string;
    static isValidProjectPath(filePath: string, projectRoots: string[]): boolean;
}
//# sourceMappingURL=security.d.ts.map