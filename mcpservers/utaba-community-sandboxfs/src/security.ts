import * as path from 'path';
import { SandboxConfig } from './config.js';

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
    throw new SecurityError('Filename must be a string');
  }
  
  const ext = path.extname(filename).toLowerCase();
  
  // If no extension restrictions, allow
  if (config.allowedExtensions.length === 0 && config.blockedExtensions.length === 0) {
    return;
  }
  
  // If whitelist is set, only allow those extensions
  if (config.allowedExtensions.length > 0) {
    if (!config.allowedExtensions.includes(ext)) {
      throw new SecurityError(
        `File extension "${ext}" is not in allowed list: ${config.allowedExtensions.join(', ')}`
      );
    }
    return;
  }
  
  // Otherwise, check blacklist
  if (config.blockedExtensions.includes(ext)) {
    throw new SecurityError(
      `File extension "${ext}" is blocked for security reasons`
    );
  }
}

/**
 * Check if binary operations are allowed for this file
 */
export function checkBinaryAllowed(filename: string, config: SandboxConfig, isBinaryData: boolean): void {
  if (!isBinaryData) {
    return; // Text operations always allowed
  }
  
  if (!config.allowBinary) {
    throw new SecurityError('Binary file operations are not allowed');
  }
  
  // Additional check: some extensions should always be treated as binary
  const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz'];
  const ext = path.extname(filename).toLowerCase();
  
  if (binaryExtensions.includes(ext) && !config.allowBinary) {
    throw new SecurityError(`Binary operations required for ${ext} files but not allowed`);
  }
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
    throw new SecurityError('Path must be a string');
  }
  
  if (typeof sandboxRoot !== 'string') {
    throw new SecurityError('Sandbox root must be a string');
  }
  
  if (!requestedPath) {
    throw new SecurityError('Path cannot be empty');
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
    throw new SecurityError(
      `Path traversal attempt detected. Path must be within sandbox: ${sandboxRoot}`
    );
  }
  
  // Additional checks for suspicious patterns
  const suspiciousPatterns = [
    /\0/, // Null bytes
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, // Windows reserved names
  ];
  
  const pathSegments = requestedPath.split(/[/\\]/);
  for (const segment of pathSegments) {
    if (suspiciousPatterns.some(pattern => pattern.test(segment))) {
      throw new SecurityError(`Invalid path segment: ${segment}`);
    }
  }
  
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
    throw new SecurityError('Filename must be a string');
  }
  
  if (!filename || filename.trim().length === 0) {
    throw new SecurityError('Filename cannot be empty');
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"|?*\0]/;
  if (invalidChars.test(filename)) {
    throw new SecurityError('Filename contains invalid characters');
  }
  
  // Check for reserved names (Windows)
  const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  if (reservedNames.test(filename)) {
    throw new SecurityError('Filename uses a reserved name');
  }
  
  // Prevent hidden files unless explicitly allowed
  if (filename.startsWith('.') && filename !== '.mcp-quota.json') {
    throw new SecurityError('Hidden files are not allowed');
  }
  
  // Check file extension
  checkFileExtension(filename, config);
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
    throw new SecurityError('Delete operations are not allowed');
  }
  
  if ((operation === 'createDir' || operation === 'deleteDir') && !config.allowDirectoryOps) {
    throw new SecurityError('Directory operations are not allowed');
  }
}