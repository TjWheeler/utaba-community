import * as path from 'path';
import { SandboxConfig } from './config.js';
import { logger } from './logger.js';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Check if file extension is allowed based on config
 */
export function checkFileExtension(filename: string, config: SandboxConfig): void {
  if (typeof filename !== 'string') {
    const error = new SecurityError('Filename must be a string');
    logger.logSecurity('Security', 'extensionCheck', filename, true, 'Invalid filename type');
    throw error;
  }
  
  const ext = path.extname(filename).toLowerCase();
  
  // If no extension restrictions, allow
  if (config.allowedExtensions.length === 0 && config.blockedExtensions.length === 0) {
    logger.logSecurity('Security', 'extensionCheck', filename, false, 'No restrictions configured');
    return;
  }
  
  // If whitelist is set, only allow those extensions
  if (config.allowedExtensions.length > 0) {
    if (!config.allowedExtensions.includes(ext)) {
      const error = new SecurityError(
        `File extension "${ext}" is not in allowed list: ${config.allowedExtensions.join(', ')}`
      );
      logger.logSecurity('Security', 'extensionCheck', filename, true, `Extension ${ext} not in whitelist`);
      throw error;
    }
    logger.logSecurity('Security', 'extensionCheck', filename, false, `Extension ${ext} allowed by whitelist`);
    return;
  }
  
  // Otherwise, check blacklist
  if (config.blockedExtensions.includes(ext)) {
    const error = new SecurityError(
      `File extension "${ext}" is blocked for security reasons`
    );
    logger.logSecurity('Security', 'extensionCheck', filename, true, `Extension ${ext} in blacklist`);
    throw error;
  }
  
  logger.logSecurity('Security', 'extensionCheck', filename, false, `Extension ${ext} not in blacklist`);
}

/**
 * Check if binary operations are allowed for this file
 */
export function checkBinaryAllowed(filename: string, config: SandboxConfig, isBinaryData: boolean): void {
  if (!isBinaryData) {
    return; // Text operations always allowed
  }
  
  if (!config.allowBinary) {
    const error = new SecurityError('Binary file operations are not allowed');
    logger.logSecurity('Security', 'binaryCheck', filename, true, 'Binary operations disabled');
    throw error;
  }
  
  // Additional check: some extensions should always be treated as binary
  const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz'];
  const ext = path.extname(filename).toLowerCase();
  
  if (binaryExtensions.includes(ext) && !config.allowBinary) {
    const error = new SecurityError(`Binary operations required for ${ext} files but not allowed`);
    logger.logSecurity('Security', 'binaryCheck', filename, true, `Binary required for ${ext} but disabled`);
    throw error;
  }
  
  logger.logSecurity('Security', 'binaryCheck', filename, false, 'Binary operations allowed');
}

/**
 * Validates and normalizes a path within the sandbox
 * @param requestedPath - The path requested by the user
 * @param sandboxRoot - The sandbox root directory
 * @returns The full, normalized, safe path
 * @throws SecurityError if path validation fails
 */
export function validatePath(requestedPath: string, sandboxRoot: string): string {
  // Type check
  if (typeof requestedPath !== 'string') {
    const error = new SecurityError('Path must be a string');
    logger.logSecurity('Security', 'pathValidation', requestedPath, true, 'Invalid path type');
    throw error;
  }
  
  if (typeof sandboxRoot !== 'string') {
    const error = new SecurityError('Sandbox root must be a string');
    logger.logSecurity('Security', 'pathValidation', requestedPath, true, 'Invalid sandbox root type');
    throw error;
  }
  
  if (!requestedPath) {
    const error = new SecurityError('Path cannot be empty');
    logger.logSecurity('Security', 'pathValidation', requestedPath, true, 'Empty path');
    throw error;
  }

  // Normalize the sandbox root to handle Windows vs Unix paths
  const normalizedRoot = path.resolve(sandboxRoot);
  
  // Join the sandbox root with the requested path and resolve it
  // This handles any ../ or ./ in the path
  const resolvedPath = path.resolve(normalizedRoot, requestedPath);
  
  // Ensure the resolved path starts with the sandbox root
  // On Windows, we need case-insensitive comparison
  const pathStartsWithRoot = process.platform === 'win32'
    ? resolvedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase())
    : resolvedPath.startsWith(normalizedRoot);
    
  if (!pathStartsWithRoot) {
    const error = new SecurityError(
      `Path traversal attempt detected. Path must be within sandbox: ${sandboxRoot}`
    );
    logger.logSecurity('Security', 'pathValidation', requestedPath, true, 'Path traversal attempt');
    throw error;
  }
  
  // Additional checks for suspicious patterns
  const suspiciousPatterns = [
    /\0/, // Null bytes
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, // Windows reserved names
  ];
  
  const pathSegments = requestedPath.split(/[/\\]/);
  for (const segment of pathSegments) {
    if (suspiciousPatterns.some(pattern => pattern.test(segment))) {
      const error = new SecurityError(`Invalid path segment: ${segment}`);
      logger.logSecurity('Security', 'pathValidation', requestedPath, true, `Suspicious segment: ${segment}`);
      throw error;
    }
  }
  
  logger.logSecurity('Security', 'pathValidation', requestedPath, false, 'Path validated successfully');
  return resolvedPath;
}

/**
 * Gets the relative path from sandbox root for display purposes
 * @param fullPath - The full path
 * @param sandboxRoot - The sandbox root directory
 * @returns The relative path for safe display
 */
export function getRelativePath(fullPath: string, sandboxRoot: string): string {
  // Type checks
  if (typeof fullPath !== 'string') {
    throw new SecurityError('Full path must be a string');
  }
  
  if (typeof sandboxRoot !== 'string') {
    throw new SecurityError('Sandbox root must be a string');
  }
  
  return path.relative(sandboxRoot, fullPath).replace(/\\/g, '/');
}

/**
 * Validates a filename for write operations
 * @param filename - The filename to validate
 * @param config - The sandbox configuration for extension checking
 * @throws SecurityError if filename is invalid
 */
export function validateFilename(filename: string, config: SandboxConfig): void {
  // Type check
  if (typeof filename !== 'string') {
    const error = new SecurityError('Filename must be a string');
    logger.logSecurity('Security', 'filenameValidation', filename, true, 'Invalid filename type');
    throw error;
  }
  
  if (!filename || filename.trim().length === 0) {
    const error = new SecurityError('Filename cannot be empty');
    logger.logSecurity('Security', 'filenameValidation', filename, true, 'Empty filename');
    throw error;
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"|?*\0]/;
  if (invalidChars.test(filename)) {
    const error = new SecurityError('Filename contains invalid characters');
    logger.logSecurity('Security', 'filenameValidation', filename, true, 'Invalid characters in filename');
    throw error;
  }
  
  // Check for reserved names (Windows)
  const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  if (reservedNames.test(filename)) {
    const error = new SecurityError('Filename uses a reserved name');
    logger.logSecurity('Security', 'filenameValidation', filename, true, 'Reserved filename');
    throw error;
  }
  
  // Prevent hidden files unless explicitly allowed
  if (filename.startsWith('.') && filename !== '.mcp-quota.json') {
    const error = new SecurityError('Hidden files are not allowed');
    logger.logSecurity('Security', 'filenameValidation', filename, true, 'Hidden file blocked');
    throw error;
  }
  
  // Check file extension
  checkFileExtension(filename, config);
  
  logger.logSecurity('Security', 'filenameValidation', filename, false, 'Filename validated successfully');
}

/**
 * Checks if an operation is allowed based on config
 * @param operation - The operation type
 * @param config - The sandbox configuration
 * @throws SecurityError if operation is not allowed
 */
export function checkOperationAllowed(
  operation: 'delete' | 'createDir' | 'deleteDir',
  config: SandboxConfig
): void {
  if (operation === 'delete' && !config.allowDelete) {
    const error = new SecurityError('Delete operations are not allowed');
    logger.logSecurity('Security', 'operationCheck', operation, true, 'Delete operations disabled');
    throw error;
  }
  
  if ((operation === 'createDir' || operation === 'deleteDir') && !config.allowDirectoryOps) {
    const error = new SecurityError('Directory operations are not allowed');
    logger.logSecurity('Security', 'operationCheck', operation, true, 'Directory operations disabled');
    throw error;
  }
  
  logger.logSecurity('Security', 'operationCheck', operation, false, 'Operation allowed');
}
