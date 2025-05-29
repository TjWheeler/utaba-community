import { z } from 'zod';
/**
 * Configuration schema and types for MCP Shell
 */
export declare const WorkingDirRestriction: z.ZodEnum<["none", "project-only", "specific"]>;
export type WorkingDirRestriction = z.infer<typeof WorkingDirRestriction>;
export declare const LogLevel: z.ZodEnum<["error", "warn", "info", "debug"]>;
export type LogLevel = z.infer<typeof LogLevel>;
export declare const CommandConfigSchema: z.ZodObject<{
    command: z.ZodString;
    allowedArgs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    argPatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    description: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
    workingDirRestriction: z.ZodDefault<z.ZodOptional<z.ZodEnum<["none", "project-only", "specific"]>>>;
    allowedWorkingDirs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    requiresConfirmation: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    command: string;
    workingDirRestriction: "none" | "project-only" | "specific";
    requiresConfirmation: boolean;
    allowedArgs?: string[] | undefined;
    argPatterns?: string[] | undefined;
    description?: string | undefined;
    timeout?: number | undefined;
    allowedWorkingDirs?: string[] | undefined;
    environment?: Record<string, string> | undefined;
}, {
    command: string;
    allowedArgs?: string[] | undefined;
    argPatterns?: string[] | undefined;
    description?: string | undefined;
    timeout?: number | undefined;
    workingDirRestriction?: "none" | "project-only" | "specific" | undefined;
    allowedWorkingDirs?: string[] | undefined;
    environment?: Record<string, string> | undefined;
    requiresConfirmation?: boolean | undefined;
}>;
export type CommandConfig = z.infer<typeof CommandConfigSchema>;
export type CommandPattern = CommandConfig;
export declare const ConfigSchema: z.ZodEffects<z.ZodObject<{
    projectRoots: z.ZodArray<z.ZodString, "many">;
    trustedEnvironment: z.ZodBoolean;
    defaultTimeout: z.ZodDefault<z.ZodNumber>;
    maxConcurrentCommands: z.ZodDefault<z.ZodNumber>;
    allowedCommands: z.ZodArray<z.ZodObject<{
        command: z.ZodString;
        allowedArgs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        argPatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        timeout: z.ZodOptional<z.ZodNumber>;
        workingDirRestriction: z.ZodDefault<z.ZodOptional<z.ZodEnum<["none", "project-only", "specific"]>>>;
        allowedWorkingDirs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        requiresConfirmation: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        command: string;
        workingDirRestriction: "none" | "project-only" | "specific";
        requiresConfirmation: boolean;
        allowedArgs?: string[] | undefined;
        argPatterns?: string[] | undefined;
        description?: string | undefined;
        timeout?: number | undefined;
        allowedWorkingDirs?: string[] | undefined;
        environment?: Record<string, string> | undefined;
    }, {
        command: string;
        allowedArgs?: string[] | undefined;
        argPatterns?: string[] | undefined;
        description?: string | undefined;
        timeout?: number | undefined;
        workingDirRestriction?: "none" | "project-only" | "specific" | undefined;
        allowedWorkingDirs?: string[] | undefined;
        environment?: Record<string, string> | undefined;
        requiresConfirmation?: boolean | undefined;
    }>, "many">;
    logLevel: z.ZodDefault<z.ZodEnum<["error", "warn", "info", "debug"]>>;
    logToFile: z.ZodDefault<z.ZodBoolean>;
    logFilePath: z.ZodOptional<z.ZodString>;
    blockedEnvironmentVars: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    allowedEnvironmentVars: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    projectRoots: string[];
    trustedEnvironment: boolean;
    defaultTimeout: number;
    maxConcurrentCommands: number;
    allowedCommands: {
        command: string;
        workingDirRestriction: "none" | "project-only" | "specific";
        requiresConfirmation: boolean;
        allowedArgs?: string[] | undefined;
        argPatterns?: string[] | undefined;
        description?: string | undefined;
        timeout?: number | undefined;
        allowedWorkingDirs?: string[] | undefined;
        environment?: Record<string, string> | undefined;
    }[];
    logLevel: "error" | "warn" | "info" | "debug";
    logToFile: boolean;
    blockedEnvironmentVars: string[];
    logFilePath?: string | undefined;
    allowedEnvironmentVars?: string[] | undefined;
}, {
    projectRoots: string[];
    trustedEnvironment: boolean;
    allowedCommands: {
        command: string;
        allowedArgs?: string[] | undefined;
        argPatterns?: string[] | undefined;
        description?: string | undefined;
        timeout?: number | undefined;
        workingDirRestriction?: "none" | "project-only" | "specific" | undefined;
        allowedWorkingDirs?: string[] | undefined;
        environment?: Record<string, string> | undefined;
        requiresConfirmation?: boolean | undefined;
    }[];
    defaultTimeout?: number | undefined;
    maxConcurrentCommands?: number | undefined;
    logLevel?: "error" | "warn" | "info" | "debug" | undefined;
    logToFile?: boolean | undefined;
    logFilePath?: string | undefined;
    blockedEnvironmentVars?: string[] | undefined;
    allowedEnvironmentVars?: string[] | undefined;
}>, {
    projectRoots: string[];
    trustedEnvironment: boolean;
    defaultTimeout: number;
    maxConcurrentCommands: number;
    allowedCommands: {
        command: string;
        workingDirRestriction: "none" | "project-only" | "specific";
        requiresConfirmation: boolean;
        allowedArgs?: string[] | undefined;
        argPatterns?: string[] | undefined;
        description?: string | undefined;
        timeout?: number | undefined;
        allowedWorkingDirs?: string[] | undefined;
        environment?: Record<string, string> | undefined;
    }[];
    logLevel: "error" | "warn" | "info" | "debug";
    logToFile: boolean;
    blockedEnvironmentVars: string[];
    logFilePath?: string | undefined;
    allowedEnvironmentVars?: string[] | undefined;
}, {
    projectRoots: string[];
    trustedEnvironment: boolean;
    allowedCommands: {
        command: string;
        allowedArgs?: string[] | undefined;
        argPatterns?: string[] | undefined;
        description?: string | undefined;
        timeout?: number | undefined;
        workingDirRestriction?: "none" | "project-only" | "specific" | undefined;
        allowedWorkingDirs?: string[] | undefined;
        environment?: Record<string, string> | undefined;
        requiresConfirmation?: boolean | undefined;
    }[];
    defaultTimeout?: number | undefined;
    maxConcurrentCommands?: number | undefined;
    logLevel?: "error" | "warn" | "info" | "debug" | undefined;
    logToFile?: boolean | undefined;
    logFilePath?: string | undefined;
    blockedEnvironmentVars?: string[] | undefined;
    allowedEnvironmentVars?: string[] | undefined;
}>;
export type Config = z.infer<typeof ConfigSchema>;
export interface EnvironmentOverrides {
    logLevel?: LogLevel;
    maxConcurrentCommands?: number;
    defaultTimeout?: number;
}
export declare const DEFAULT_CONFIGS: {
    readonly minimal: {
        readonly projectRoots: readonly [string];
        readonly trustedEnvironment: false;
        readonly defaultTimeout: 30000;
        readonly maxConcurrentCommands: 3;
        readonly allowedCommands: readonly [{
            readonly command: "npm";
            readonly allowedArgs: readonly ["test", "run", "install", "ci"];
            readonly description: "Node Package Manager";
            readonly timeout: 60000;
            readonly workingDirRestriction: "project-only";
        }, {
            readonly command: "echo";
            readonly allowedArgs: readonly [];
            readonly argPatterns: readonly ["^[\\w\\s-_.]+$"];
            readonly description: "Echo command for testing";
            readonly timeout: 5000;
            readonly workingDirRestriction: "project-only";
        }];
        readonly logLevel: "info";
        readonly logToFile: false;
        readonly blockedEnvironmentVars: readonly ["HOME", "PATH", "USER"];
    };
    readonly nodejs: {
        readonly projectRoots: readonly [string];
        readonly trustedEnvironment: false;
        readonly defaultTimeout: 30000;
        readonly maxConcurrentCommands: 3;
        readonly allowedCommands: readonly [{
            readonly command: "npm";
            readonly allowedArgs: readonly ["test", "run", "install", "ci", "audit", "outdated", "list"];
            readonly description: "Node Package Manager";
            readonly timeout: 60000;
            readonly workingDirRestriction: "project-only";
        }, {
            readonly command: "npx";
            readonly allowedArgs: readonly ["tsc", "eslint", "prettier", "jest", "vitest"];
            readonly description: "NPX package runner";
            readonly timeout: 60000;
            readonly workingDirRestriction: "project-only";
        }, {
            readonly command: "tsc";
            readonly allowedArgs: readonly ["--build", "--watch", "--noEmit", "--listFiles"];
            readonly description: "TypeScript compiler";
            readonly timeout: 120000;
            readonly workingDirRestriction: "project-only";
        }, {
            readonly command: "eslint";
            readonly allowedArgs: readonly ["--fix", "--cache", "--ext"];
            readonly argPatterns: readonly ["^--ext\\s+\\.(js|ts|jsx|tsx)$", "^\\.\\/", "^src/", "^\\*\\*/*\\.(js|ts|jsx|tsx)$"];
            readonly description: "ESLint linter";
            readonly timeout: 60000;
            readonly workingDirRestriction: "project-only";
        }, {
            readonly command: "prettier";
            readonly allowedArgs: readonly ["--write", "--check", "--list-different"];
            readonly argPatterns: readonly ["^\\*\\*/*\\.(js|ts|jsx|tsx|json|md)$", "^\\./", "^src/"];
            readonly description: "Prettier code formatter";
            readonly timeout: 30000;
            readonly workingDirRestriction: "project-only";
        }, {
            readonly command: "git";
            readonly allowedArgs: readonly ["status", "diff", "log", "branch", "add", "commit", "push", "pull"];
            readonly description: "Git version control";
            readonly timeout: 30000;
            readonly workingDirRestriction: "project-only";
        }, {
            readonly command: "echo";
            readonly allowedArgs: readonly [];
            readonly argPatterns: readonly ["^[\\w\\s-_.]+$"];
            readonly description: "Echo command for testing";
            readonly timeout: 5000;
            readonly workingDirRestriction: "project-only";
        }];
        readonly logLevel: "info";
        readonly logToFile: false;
        readonly blockedEnvironmentVars: readonly ["HOME", "PATH", "USER"];
    };
};
/**
 * Load configuration from file or use defaults
 */
export declare function loadConfig(configPath?: string): Promise<Config>;
/**
 * Validate configuration beyond schema validation
 */
export declare function validateConfig(config: Config): Promise<void>;
/**
 * Create a configuration file from a template
 */
export declare function createConfigFile(template: 'minimal' | 'nodejs', configPath: string): Promise<string>;
/**
 * Get environment variable overrides
 */
export declare function getEnvironmentOverrides(): EnvironmentOverrides;
/**
 * Get configuration file path
 */
export declare function getConfigPath(): string;
/**
 * Check if a command is allowed by configuration
 */
export declare function isCommandAllowed(config: Config, command: string): boolean;
/**
 * Get command configuration
 */
export declare function getCommandConfig(config: Config, command: string): CommandConfig | undefined;
//# sourceMappingURL=config.d.ts.map