import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityValidator, SecurityError } from '../security';
import { createMockConfig, DANGEROUS_COMMAND_PATTERNS, SAFE_COMMAND_PATTERNS } from '../test-utils/helpers';

describe('SecurityValidator', () => {
  let validator: SecurityValidator;

  beforeEach(() => {
    const config = createMockConfig();
    validator = new SecurityValidator(config);
  });

  describe('command validation', () => {
    it('should allow whitelisted commands', () => {
      const result = validator.validateCommand('echo', ['test']);
      
      expect(result.allowed).toBe(true);
      expect(result.matchedPattern).toBeDefined();
      expect(result.matchedPattern?.command).toBe('echo');
    });

    it('should reject non-whitelisted commands', () => {
      const result = validator.validateCommand('rm', ['-rf', '/']);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in the whitelist');
    });

    it('should validate arguments against allowed list', () => {
      const result = validator.validateCommand('echo', ['forbidden']);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in allowed list');
    });

    it('should allow valid arguments', () => {
      const result = validator.validateCommand('echo', ['test']);
      
      expect(result.allowed).toBe(true);
      expect(result.sanitizedArgs).toEqual(['test']);
    });
  });

  describe('injection protection', () => {
    it('should detect command injection patterns', () => {
      const dangerousPatterns = [
        'echo $(whoami)',
        'echo `id`',
        'echo test; rm -rf /',
        'echo test | cat',
        'echo test && malicious'
      ];

      for (const pattern of dangerousPatterns) {
        const [cmd, ...args] = pattern.split(' ');
        const result = validator.validateCommand(cmd, args);
        
        // Should be blocked either by whitelist or injection detection
        expect(result.allowed).toBe(false);
      }
    });

    it('should allow safe command patterns', () => {
      // Override config to allow more flexible patterns for testing
      const flexibleConfig = createMockConfig({
        allowedCommands: [{
          command: 'echo',
          argPatterns: ['^[a-zA-Z0-9\\s\\-_\\.]+$'], // Allow safe characters
          description: 'Echo command with pattern validation'
        }]
      });
      
      const flexibleValidator = new SecurityValidator(flexibleConfig);
      
      const safePatterns = [
        'echo hello',
        'echo test-file.txt',
        'echo build_output'
      ];

      for (const pattern of safePatterns) {
        const [cmd, ...args] = pattern.split(' ');
        const result = flexibleValidator.validateCommand(cmd, args);
        
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('working directory validation', () => {
    it('should allow project-only commands within project root', () => {
      const projectRoot = process.cwd();
      const result = validator.validateCommand('echo', ['test'], projectRoot);
      
      expect(result.allowed).toBe(true);
    });

    it('should reject commands outside project root', () => {
      const result = validator.validateCommand('echo', ['test'], '/tmp');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not within allowed project roots');
    });

    it('should handle specific directory restrictions', () => {
      const config = createMockConfig({
        allowedCommands: [{
          command: 'npm',
          allowedArgs: ['test'],
          workingDirRestriction: 'specific',
          allowedWorkingDirs: ['/allowed/path']
        }]
      });
      
      const specificValidator = new SecurityValidator(config);
      
      const result = specificValidator.validateCommand('npm', ['test'], '/forbidden/path');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in the allowed list');
    });
  });

  describe('environment variable sanitization', () => {
    it('should filter blocked environment variables', () => {
      const env = validator.sanitizeEnvironment({ 
        HOME: '/home/user',
        SAFE_VAR: 'value',
        PATH: '/usr/bin'
      });
      
      expect(env).not.toHaveProperty('HOME');
      expect(env).not.toHaveProperty('PATH');
      expect(env).toHaveProperty('SAFE_VAR');
    });

    it('should respect allowed environment variables list', () => {
      const config = createMockConfig({
        allowedEnvironmentVars: ['NODE_ENV', 'DEBUG'],
        blockedEnvironmentVars: []
      });
      
      const restrictiveValidator = new SecurityValidator(config);
      const env = restrictiveValidator.sanitizeEnvironment({
        NODE_ENV: 'test',
        DEBUG: '1',
        FORBIDDEN: 'value'
      });
      
      expect(env).toHaveProperty('NODE_ENV');
      expect(env).toHaveProperty('DEBUG');
      expect(env).not.toHaveProperty('FORBIDDEN');
    });
  });

  describe('trusted environment validation', () => {
    it('should pass when trustedEnvironment is true', () => {
      expect(() => validator.validateTrustedEnvironment()).not.toThrow();
    });

    it('should throw when trustedEnvironment is false', () => {
      const untrustedConfig = createMockConfig({ trustedEnvironment: false });
      const untrustedValidator = new SecurityValidator(untrustedConfig);
      
      expect(() => untrustedValidator.validateTrustedEnvironment()).toThrow(SecurityError);
    });
  });

  describe('timeout and confirmation settings', () => {
    it('should return correct timeout for command pattern', () => {
      const result = validator.validateCommand('echo', ['test']);
      const timeout = validator.getCommandTimeout(result.matchedPattern!);
      
      expect(timeout).toBe(5000); // From mock config
    });

    it('should return default timeout when pattern has none', () => {
      const config = createMockConfig({
        defaultTimeout: 15000,
        allowedCommands: [{
          command: 'test',
          description: 'Test command without timeout'
        }]
      });
      
      const testValidator = new SecurityValidator(config);
      const result = testValidator.validateCommand('test', []);
      const timeout = testValidator.getCommandTimeout(result.matchedPattern!);
      
      expect(timeout).toBe(15000);
    });

    it('should correctly identify commands requiring confirmation', () => {
      const config = createMockConfig({
        allowedCommands: [{
          command: 'dangerous',
          requiresConfirmation: true,
          description: 'Dangerous command'
        }]
      });
      
      const confirmValidator = new SecurityValidator(config);
      const result = confirmValidator.validateCommand('dangerous', []);
      const requiresConfirm = confirmValidator.requiresConfirmation(result.matchedPattern!);
      
      expect(requiresConfirm).toBe(true);
    });
  });
});
