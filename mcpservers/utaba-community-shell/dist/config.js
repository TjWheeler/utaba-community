import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
/**
 * Configuration schema and types for MCP Shell
 */
// Working directory restriction types
export const WorkingDirRestriction = z.enum(['none', 'project-only', 'specific']);
// Log level schema
export const LogLevel = z.enum(['error', 'warn', 'info', 'debug']);
// Command configuration schema
export const CommandConfigSchema = z.object({
    command: z.string().min(1),
    allowedArgs: z.array(z.string()).optional(),
    argPatterns: z.array(z.string()).optional(),
    description: z.string().optional(),
    timeout: z.number().min(1000).max(300000).optional(), // 1s to 5min
    workingDirRestriction: WorkingDirRestriction.optional().default('project-only'),
    allowedWorkingDirs: z.array(z.string()).optional(),
    environment: z.record(z.string()).optional(),
    requiresConfirmation: z.boolean().optional().default(false)
});
// Main configuration schema
export const ConfigSchema = z.object({
    projectRoots: z.array(z.string()),
    defaultProjectRoot: z.string().optional(),
    approvalQueueBaseDir: z.string().optional(),
    asyncQueueBaseDir: z.string().optional(),
    trustedEnvironment: z.boolean(),
    defaultTimeout: z.number().min(1000).max(300000).default(30000),
    maxConcurrentCommands: z.number().min(1).max(10).default(3),
    allowedCommands: z.array(CommandConfigSchema),
    logLevel: LogLevel.default('info'),
    logToFile: z.boolean().default(false),
    logFilePath: z.string().optional(),
    startDirectory: z.string().optional(),
    blockedEnvironmentVars: z.array(z.string()).default([]),
    allowedEnvironmentVars: z.array(z.string()).optional()
}).refine(data => {
    // Validate that commands with 'specific' working dir restriction have allowedWorkingDirs
    for (const cmd of data.allowedCommands) {
        if (cmd.workingDirRestriction === 'specific' && (!cmd.allowedWorkingDirs || cmd.allowedWorkingDirs.length === 0)) {
            return false;
        }
    }
    return true;
}, {
    message: "Commands with 'specific' workingDirRestriction require allowedWorkingDirs to be specified"
});
// Default configuration templates
export const DEFAULT_CONFIGS = {
    minimal: {
        projectRoots: [],
        trustedEnvironment: true,
        defaultTimeout: 30000,
        maxConcurrentCommands: 3,
        asyncQueueBaseDir: "",
        allowedCommands: [
            {
                command: 'npm',
                allowedArgs: ['test', 'run', 'install', 'ci', 'build'],
                description: 'Node Package Manager',
                timeout: 60000,
                workingDirRestriction: 'project-only'
            },
            {
                command: 'echo',
                allowedArgs: [],
                argPatterns: ['^[\\w\\s-_.]+$'],
                description: 'Echo command for testing',
                timeout: 5000,
                workingDirRestriction: 'project-only'
            }
        ],
        logLevel: 'info',
        logToFile: false,
        blockedEnvironmentVars: ['HOME', 'PATH', 'USER'],
        startDirectory: "",
    },
    nodejs: {
        projectRoots: [],
        trustedEnvironment: true,
        defaultTimeout: 30000,
        maxConcurrentCommands: 3,
        asyncQueueBaseDir: "",
        allowedCommands: [
            {
                command: 'npm',
                allowedArgs: ['test', 'run', 'install', 'ci', 'audit', 'outdated', 'list', 'build'],
                description: 'Node Package Manager',
                timeout: 60000,
                workingDirRestriction: 'project-only'
            },
            {
                command: 'npx',
                allowedArgs: ['tsc', 'eslint', 'prettier', 'jest', 'vitest'],
                description: 'NPX package runner',
                timeout: 60000,
                workingDirRestriction: 'project-only'
            },
            {
                command: 'tsc',
                allowedArgs: ['--build', '--watch', '--noEmit', '--listFiles'],
                description: 'TypeScript compiler',
                timeout: 120000,
                workingDirRestriction: 'project-only'
            },
            {
                command: 'eslint',
                allowedArgs: ['--fix', '--cache', '--ext'],
                argPatterns: ['^--ext\\s+\\.(js|ts|jsx|tsx)$', '^\\.\\/', '^src/', '^\\*\\*/*\\.(js|ts|jsx|tsx)$'],
                description: 'ESLint linter',
                timeout: 60000,
                workingDirRestriction: 'project-only'
            },
            {
                command: 'prettier',
                allowedArgs: ['--write', '--check', '--list-different'],
                argPatterns: ['^\\*\\*/*\\.(js|ts|jsx|tsx|json|md)$', '^\\./', '^src/'],
                description: 'Prettier code formatter',
                timeout: 30000,
                workingDirRestriction: 'project-only'
            },
            {
                command: 'git',
                allowedArgs: ['status', 'diff', 'log', 'branch', 'add', 'commit', 'push', 'pull', '-F'],
                description: 'Git version control',
                timeout: 30000,
                workingDirRestriction: 'project-only'
            },
            {
                command: 'echo',
                allowedArgs: [],
                argPatterns: ['^[\\w\\s-_.]+$'],
                description: 'Echo command for testing',
                timeout: 5000,
                workingDirRestriction: 'project-only'
            }
        ],
        logLevel: 'info',
        logToFile: false,
        blockedEnvironmentVars: ['HOME', 'PATH', 'USER'],
        startDirectory: "",
    }
};
/**
 * Load configuration from file or use defaults
 */
export async function loadConfig(configPath) {
    const defaultPath = process.env.MCP_SHELL_CONFIG_PATH || './mcp-shell-config.json';
    const finalPath = configPath || defaultPath;
    try {
        const configFile = await fs.readFile(finalPath, 'utf-8');
        const rawConfig = JSON.parse(configFile);
        // Apply environment overrides
        const envOverrides = getEnvironmentOverrides();
        const configWithOverrides = { ...rawConfig, ...envOverrides };
        const config = ConfigSchema.parse(configWithOverrides);
        if (!config.asyncQueueBaseDir) {
            config.asyncQueueBaseDir = path.join(process.cwd(), 'async-queue');
        }
        if (!config.approvalQueueBaseDir) {
            config.approvalQueueBaseDir = path.join(process.cwd(), 'approval-queue');
        }
        // if (config.startDirectory) { 
        //   console.log(`Setting start dir as project root ${config.startDirectory}`);
        //   config.projectRoots = config.projectRoots.concat([config.startDirectory]);
        // }
        await validateConfig(config);
        return config;
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            // Configuration file not found - use nodejs template as default
            const config = ConfigSchema.parse(DEFAULT_CONFIGS.nodejs);
            await validateConfig(config);
            return config;
        }
        if (error instanceof z.ZodError) {
            const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
            throw new Error(`Configuration validation failed: ${issues}`);
        }
        throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export async function startDirectory() {
    const startDir = process.env.MCP_SHELL_START_DIRECTORY || process.cwd();
    try {
        process.chdir(startDir);
        const stat = await fs.stat(startDir);
        if (!stat.isDirectory()) {
            throw new Error(`Start directory ${startDir} is not a directory`);
        }
        return startDir;
    }
    catch (error) {
        throw new Error(`Start directory ${startDir} is not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Validate configuration beyond schema validation
 */
export async function validateConfig(config) {
    // Validate project roots exist and are accessible
    for (const root of config.projectRoots) {
        try {
            await fs.access(root);
            const stat = await fs.stat(root);
            if (!stat.isDirectory()) {
                throw new Error(`Project root ${root} is not a directory`);
            }
        }
        catch (error) {
            throw new Error(`Project root ${root} is not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // Validate regex patterns in commands
    for (const cmd of config.allowedCommands) {
        if (cmd.argPatterns) {
            for (const pattern of cmd.argPatterns) {
                try {
                    new RegExp(pattern);
                }
                catch (error) {
                    throw new Error(`Invalid regex pattern in command ${cmd.command}: ${pattern}`);
                }
            }
        }
        // Validate specific working directory requirements
        if (cmd.workingDirRestriction === 'specific') {
            if (!cmd.allowedWorkingDirs || cmd.allowedWorkingDirs.length === 0) {
                throw new Error(`Command ${cmd.command} with 'specific' workingDirRestriction requires allowedWorkingDirs to be specified`);
            }
        }
    }
    // Validate log file path if specified
    if (config.logToFile && config.logFilePath) {
        const logDir = path.dirname(config.logFilePath);
        try {
            await fs.access(logDir);
        }
        catch (error) {
            throw new Error(`Log file directory ${logDir} is not accessible`);
        }
    }
}
/**
 * Create a configuration file from a template
 */
export async function createConfigFile(template, configPath) {
    if (!(template in DEFAULT_CONFIGS)) {
        throw new Error(`Unknown template: ${template}`);
    }
    const config = DEFAULT_CONFIGS[template];
    const configJson = JSON.stringify(config, null, 2);
    // Ensure directory exists
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, configJson, 'utf-8');
    return configPath;
}
/**
 * Get environment variable overrides
 */
export function getEnvironmentOverrides() {
    const overrides = {};
    // Log level override
    const logLevel = process.env.MCP_SHELL_LOG_LEVEL;
    if (logLevel && ['error', 'warn', 'info', 'debug'].includes(logLevel)) {
        overrides.logLevel = logLevel;
    }
    // Max concurrent commands override
    const maxConcurrent = process.env.MCP_SHELL_MAX_CONCURRENT;
    if (maxConcurrent) {
        const parsed = parseInt(maxConcurrent, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
            overrides.maxConcurrentCommands = parsed;
        }
    }
    // Default timeout override
    const timeout = process.env.MCP_SHELL_TIMEOUT;
    if (timeout) {
        const parsed = parseInt(timeout, 10);
        if (!isNaN(parsed) && parsed >= 1000 && parsed <= 300000) {
            overrides.defaultTimeout = parsed;
        }
    }
    const startDirectory = process.env.MCP_SHELL_START_DIRECTORY;
    if (startDirectory) {
        overrides.startDirectory = startDirectory;
    }
    return overrides;
}
/**
 * Get configuration file path
 */
export function getConfigPath() {
    return process.env.MCP_SHELL_CONFIG_PATH || './mcp-shell-config.json';
}
/**
 * Check if a command is allowed by configuration
 */
export function isCommandAllowed(config, command) {
    return config.allowedCommands.some(cmd => cmd.command === command);
}
/**
 * Get command configuration
 */
export function getCommandConfig(config, command) {
    return config.allowedCommands.find(cmd => cmd.command === command);
}
//# sourceMappingURL=config.js.map