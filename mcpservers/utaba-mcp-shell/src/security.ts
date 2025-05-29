import path from 'path';
import { Config, CommandPattern } from './config';

export class SecurityError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = 'SecurityError';
  }
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
export class SecurityValidator {
  constructor(private config: Config) {}
  
  /**
   * Validate if a command execution request is allowed
   */
  validateCommand(
    command: string,
    args: string[] = [],
    workingDirectory?: string
  ): ValidationResult {
    // Find matching command pattern
    const pattern = this.findMatchingPattern(command);
    if (!pattern) {
      return {
        allowed: false,
        reason: `Command '${command}' is not in the whitelist`
      };
    }
    
    // Validate arguments
    const argValidation = this.validateArguments(pattern, args);
    if (!argValidation.allowed) {
      return argValidation;
    }
    
    // Validate working directory
    const dirValidation = this.validateWorkingDirectory(pattern, workingDirectory);
    if (!dirValidation.allowed) {
      return dirValidation;
    }
    
    return {
      allowed: true,
      matchedPattern: pattern,
      sanitizedArgs: argValidation.sanitizedArgs
    };
  }
  
  /**
   * Find command pattern that matches the requested command
   */
  private findMatchingPattern(command: string): CommandPattern | null {
    return this.config.allowedCommands.find(pattern => 
      pattern.command === command
    ) || null;
  }
  
  /**
   * Validate command arguments against pattern rules
   */
  private validateArguments(pattern: CommandPattern, args: string[]): ValidationResult {
    const sanitizedArgs: string[] = [];
    
    for (const arg of args) {
      // Basic injection prevention
      if (this.containsInjectionPatterns(arg)) {
        return {
          allowed: false,
          reason: `Argument contains potential injection pattern: ${arg}`
        };
      }
      
      // Check against allowed args if specified
      if (pattern.allowedArgs && pattern.allowedArgs.length > 0) {
        if (!pattern.allowedArgs.includes(arg)) {
          return {
            allowed: false,
            reason: `Argument '${arg}' is not in allowed list for command '${pattern.command}'`
          };
        }
      }
      
      // Check against regex patterns if specified
      if (pattern.argPatterns && pattern.argPatterns.length > 0) {
        const matchesPattern = pattern.argPatterns.some(regexPattern => {
          try {
            const regex = new RegExp(regexPattern);
            return regex.test(arg);
          } catch (error) {
            // Invalid regex - log and reject
            return false;
          }
        });
        
        if (!matchesPattern) {
          return {
            allowed: false,
            reason: `Argument '${arg}' does not match allowed patterns for command '${pattern.command}'`
          };
        }
      }
      
      sanitizedArgs.push(arg);
    }
    
    return {
      allowed: true,
      sanitizedArgs
    };
  }
  
  /**
   * Validate working directory against pattern restrictions
   */
  private validateWorkingDirectory(
    pattern: CommandPattern,
    workingDirectory?: string
  ): ValidationResult {
    const restriction = pattern.workingDirRestriction || 'project-only';
    
    // if (restriction === 'any') {
    //   return { allowed: true };
    // }
    
    if (!workingDirectory) {
      // Use current directory as default
      workingDirectory = process.cwd();
    }
    
    // Resolve to absolute path for comparison
    const absoluteWorkingDir = path.resolve(workingDirectory);
    
    if (restriction === 'project-only') {
      // Must be within one of the configured project roots
      const isWithinProject = this.config.projectRoots.some(root => {
        const absoluteRoot = path.resolve(root);
        return absoluteWorkingDir.startsWith(absoluteRoot);
      });
      
      if (!isWithinProject) {
        return {
          allowed: false,
          reason: `Working directory '${workingDirectory}' is not within allowed project roots`
        };
      }
    }
    
    if (restriction === 'specific') {
      // Must be in the specifically allowed directories
      const allowedDirs = pattern.allowedWorkingDirs || [];
      const isAllowed = allowedDirs.some(allowedDir => {
        const absoluteAllowedDir = path.resolve(allowedDir);
        return absoluteWorkingDir === absoluteAllowedDir ||
               absoluteWorkingDir.startsWith(absoluteAllowedDir + path.sep);
      });
      
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Working directory '${workingDirectory}' is not in the allowed list for command '${pattern.command}'`
        };
      }
    }
    
    return { allowed: true };
  }
  
  /**
   * Check for common injection patterns in arguments
   * 
   * Note: This is basic detection and cannot prevent all attacks.
   * The security model relies on trusted environment assumption.
   */
  private containsInjectionPatterns(arg: string): boolean {
    const dangerousPatterns = [
      // Command substitution
      /`[^`]*`/,
      /\$\([^)]*\)/,
      
      // Command chaining
      /[;&|]/,
      
      // Redirection (be careful with legitimate uses)
      /[<>]/,
      
      // Null bytes
      /\x00/,
      
      // Potential script injection
      /(^|\s)(sudo|su|chmod|chown|rm\s+-rf|eval|exec)\s/i,
      
      // Environment variable manipulation that could be dangerous
      /^\$\{.*\}$/,
      
      // Path traversal (basic)
      /\.\.\//
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(arg));
  }
  
  /**
   * Sanitize environment variables for command execution
   */
  sanitizeEnvironment(additionalEnv: Record<string, string> = {}): Record<string, string> {
    const sanitizedEnv: Record<string, string> = {};
    
    // Start with current environment
    for (const [key, value] of Object.entries(process.env)) {
      if (this.isEnvironmentVarAllowed(key)) {
        sanitizedEnv[key] = value || '';
      }
    }
    
    // Add additional environment variables if allowed
    for (const [key, value] of Object.entries(additionalEnv)) {
      if (this.isEnvironmentVarAllowed(key)) {
        sanitizedEnv[key] = value;
      }
    }
    
    return sanitizedEnv;
  }
  
  /**
   * Check if an environment variable is allowed
   */
  private isEnvironmentVarAllowed(varName: string): boolean {
    // Check blocked list first
    if (this.config.blockedEnvironmentVars?.includes(varName)) {
      return false;
    }
    
    // If there's an allowed list, use it
    if (this.config.allowedEnvironmentVars && this.config.allowedEnvironmentVars.length > 0) {
      return this.config.allowedEnvironmentVars.includes(varName);
    }
    
    // Default: allow all except blocked ones
    return true;
  }
  
  /**
   * Validate that the environment is properly configured for trusted operation
   */
  validateTrustedEnvironment(): void {
    if (!this.config.trustedEnvironment) {
      throw new SecurityError(
        'Configuration indicates untrusted environment',
        'trustedEnvironment flag is false'
      );
    }
    
    // Additional environment checks could go here
    // For example, checking for development vs production indicators
  }
  
  /**
   * Get timeout for a specific command pattern
   */
  getCommandTimeout(pattern: CommandPattern): number {
    return pattern.timeout || this.config.defaultTimeout;
  }
  
  /**
   * Check if command requires confirmation
   */
  requiresConfirmation(pattern: CommandPattern): boolean {
    return pattern.requiresConfirmation || false;
  }
}

/**
 * Path validation utilities
 */
export class PathValidator {
  static isWithinDirectory(filePath: string, directory: string): boolean {
    const absoluteFilePath = path.resolve(filePath);
    const absoluteDirectory = path.resolve(directory);
    
    return absoluteFilePath.startsWith(absoluteDirectory + path.sep) ||
           absoluteFilePath === absoluteDirectory;
  }
  
  static sanitizePath(inputPath: string): string {
    // Remove null bytes and normalize
    return path.normalize(inputPath.replace(/\x00/g, ''));
  }
  
  static isValidProjectPath(filePath: string, projectRoots: string[]): boolean {
    const sanitizedPath = PathValidator.sanitizePath(filePath);
    
    return projectRoots.some(root => 
      PathValidator.isWithinDirectory(sanitizedPath, root)
    );
  }
}
