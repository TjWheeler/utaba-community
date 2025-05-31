import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import checkDiskSpace from 'check-disk-space';

export interface SandboxConfig {
  // Root directory for the sandbox
  sandboxRoot: string;
  
  // Maximum total size in bytes (default: 100MB)
  quotaBytes: number;
  
  // Maximum single file size in bytes (default: 10MB)
  maxFileSizeBytes: number;
  
  // Whether to allow delete operations
  allowDelete: boolean;
  
  // Whether to allow directory operations
  allowDirectoryOps: boolean;
  
  // Whether to allow binary file operations
  allowBinary: boolean;
  
  // Blocked file extensions (blacklist) - e.g., ['.exe', '.dll']
  blockedExtensions: string[];
  
  // Allowed file extensions (whitelist) - if set, only these are allowed
  // Empty array means all extensions allowed (except blocked ones)
  allowedExtensions: string[];

  // NEW: Operation size limits
  maxFileSize?: number;          // Max individual file size (bytes)
  maxContentLength?: number;     // Max content length per operation (bytes)
  
  // Optional: Operation-specific limits
  limits?: {
    writeFile?: number;
    appendFile?: number;
    readFile?: number;
  };

  // NEW: Disable quota system entirely
  noQuota: boolean;
}

// Default limits for operations
export const DEFAULT_LIMITS = {
  maxFileSize: 50 * 1024 * 1024,      // 50MB
  maxContentLength: 10 * 1024 * 1024, // 10MB per operation
  limits: {
    writeFile: 10 * 1024 * 1024,      // 10MB
    appendFile: 5 * 1024 * 1024,      // 5MB  
    readFile: 100 * 1024 * 1024       // 100MB (reads can be larger)
  }
};

// Default configuration
export const DEFAULT_CONFIG: SandboxConfig = {
  sandboxRoot: path.join(os.homedir(), 'mcp-sandbox'),
  quotaBytes: 100 * 1024 * 1024, // 100MB
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  allowDelete: true,
  allowDirectoryOps: true,
  allowBinary: true,
  blockedExtensions: [],
  allowedExtensions: [],
  noQuota: false, // Quota enabled by default for safety
  // Apply default limits
  maxFileSize: DEFAULT_LIMITS.maxFileSize,
  maxContentLength: DEFAULT_LIMITS.maxContentLength,
  limits: DEFAULT_LIMITS.limits
};

// Common dangerous extensions for different platforms
export const DANGEROUS_EXTENSIONS = [
  '.exe', '.com', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.jar',
  '.app', '.dmg', '.pkg', '.deb', '.rpm', '.sh', '.bash',
  '.dll', '.so', '.dylib'
];

// Load configuration from environment variables or use defaults
export function loadConfig(): SandboxConfig {
  const config: SandboxConfig = {
    sandboxRoot: process.env.MCP_SANDBOX_ROOT || DEFAULT_CONFIG.sandboxRoot,
    quotaBytes: process.env.MCP_SANDBOX_QUOTA 
      ? parseInt(process.env.MCP_SANDBOX_QUOTA) 
      : DEFAULT_CONFIG.quotaBytes,
    maxFileSizeBytes: process.env.MCP_SANDBOX_MAX_FILE_SIZE 
      ? parseInt(process.env.MCP_SANDBOX_MAX_FILE_SIZE) 
      : DEFAULT_CONFIG.maxFileSizeBytes,
    allowDelete: process.env.MCP_SANDBOX_ALLOW_DELETE !== 'false',
    allowDirectoryOps: process.env.MCP_SANDBOX_ALLOW_DIRECTORY_OPS !== 'false',
    allowBinary: process.env.MCP_SANDBOX_ALLOW_BINARY !== 'false',
    noQuota: process.env.MCP_SANDBOX_NOQUOTA === 'true', // Explicit opt-in only
    blockedExtensions: process.env.MCP_SANDBOX_BLOCKED_EXTENSIONS
      ? process.env.MCP_SANDBOX_BLOCKED_EXTENSIONS.split(',').map(ext => ext.trim().toLowerCase())
      : DEFAULT_CONFIG.blockedExtensions,
    allowedExtensions: process.env.MCP_SANDBOX_ALLOWED_EXTENSIONS
      ? process.env.MCP_SANDBOX_ALLOWED_EXTENSIONS.split(',').map(ext => ext.trim().toLowerCase())
      : DEFAULT_CONFIG.allowedExtensions,
    
    // NEW: Load size limits from environment
    maxFileSize: parseInt(process.env.MCP_SANDBOX_MAX_FILE_SIZE || '52428800'), // 50MB
    maxContentLength: parseInt(process.env.MCP_SANDBOX_CONTENT_LENGTH || '10485760'), // 10MB
    
    limits: {
      writeFile: parseInt(process.env.MCP_SANDBOX_WRITE_LIMIT || '10485760'),
      appendFile: parseInt(process.env.MCP_SANDBOX_APPEND_LIMIT || '5242880'),
      readFile: parseInt(process.env.MCP_SANDBOX_READ_LIMIT || '104857600')
    }
  };
  
  // If user wants extra safety, they can set this env var
  if (process.env.MCP_SANDBOX_BLOCK_DANGEROUS === 'true') {
    config.blockedExtensions = [
      ...new Set([...config.blockedExtensions, ...DANGEROUS_EXTENSIONS])
    ];
  }
  
  return config;
}

// Validate configuration
export async function validateConfig(config: SandboxConfig): Promise<void> {
  if (!config.sandboxRoot) {
    throw new Error('Sandbox root directory must be specified');
  }
  
  // Skip quota-related validations when quota is disabled
  if (!config.noQuota) {
    if (config.quotaBytes <= 0) {
      throw new Error('Quota must be positive');
    }
    
    if (config.maxFileSizeBytes <= 0 || config.maxFileSizeBytes > config.quotaBytes) {
      throw new Error('Max file size must be positive and less than quota');
    }
  }
  
  // Validate new size limits
  if (config.maxFileSize && config.maxFileSize <= 0) {
    throw new Error('Max file size must be positive');
  }
  
  if (config.maxContentLength && config.maxContentLength <= 0) {
    throw new Error('Max content length must be positive');
  }
  
  // Validate extension lists
  for (const ext of [...config.blockedExtensions, ...config.allowedExtensions]) {
    if (!ext.startsWith('.')) {
      throw new Error(`Extension "${ext}" must start with a dot`);
    }
  }
  
  // Warn if both whitelist and blacklist are set
  if (config.allowedExtensions.length > 0 && config.blockedExtensions.length > 0) {
    console.warn('Both allowed and blocked extensions are set. Allowed list takes precedence.');
  }

  // Check if sandbox root exists, create if not
  try {
    await fs.promises.access(config.sandboxRoot);
  } catch (error) {
    try {
      await fs.promises.mkdir(config.sandboxRoot, { recursive: true });
      console.log(`Created sandbox directory: ${config.sandboxRoot}`);
    } catch (mkdirError) {
      throw new Error(`Cannot create sandbox directory: ${mkdirError}`);
    }
  }

  // Check available disk space using check-disk-space (skip if quota disabled)
  if (!config.noQuota) {
    try {
      const diskSpace = await checkDiskSpace(config.sandboxRoot);
      
      if (diskSpace.free < config.quotaBytes) {
        throw new Error(
          `Insufficient disk space. Required: ${(config.quotaBytes / 1024 / 1024).toFixed(2)} MB, ` +
          `Available: ${(diskSpace.free / 1024 / 1024).toFixed(2)} MB`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient disk space')) {
        throw error;
      }
      // Log but don't fail if we can't check disk space
      console.warn(`Could not verify disk space: ${error}`);
    }
  }
}