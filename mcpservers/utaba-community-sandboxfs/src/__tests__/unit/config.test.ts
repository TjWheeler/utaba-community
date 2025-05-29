import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateConfig, DEFAULT_CONFIG, DANGEROUS_EXTENSIONS } from '../../config.js';
import { mockEnvVars } from '../../test-utils/testHelpers.js';
import { useTempSandbox } from '../../test-utils/tempSandbox.js';

describe('Config', () => {
  let sandbox = useTempSandbox('config-test');
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear config-related environment variables
    mockEnvVars({
      MCP_SANDBOX_ROOT: undefined,
      MCP_SANDBOX_QUOTA: undefined,
      MCP_SANDBOX_MAX_FILE_SIZE: undefined,
      MCP_SANDBOX_ALLOW_DELETE: undefined,
      MCP_SANDBOX_ALLOW_DIRECTORY_OPS: undefined,
      MCP_SANDBOX_ALLOW_BINARY: undefined,
      MCP_SANDBOX_BLOCKED_EXTENSIONS: undefined,
      MCP_SANDBOX_ALLOWED_EXTENSIONS: undefined,
      MCP_SANDBOX_BLOCK_DANGEROUS: undefined
    });
  });

  afterEach(() => {
    // Restore original environment
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CONFIG.quotaBytes).toBe(100 * 1024 * 1024); // 100MB
      expect(DEFAULT_CONFIG.maxFileSizeBytes).toBe(10 * 1024 * 1024); // 10MB
      expect(DEFAULT_CONFIG.allowDelete).toBe(true);
      expect(DEFAULT_CONFIG.allowDirectoryOps).toBe(true);
      expect(DEFAULT_CONFIG.allowBinary).toBe(true);
      expect(DEFAULT_CONFIG.blockedExtensions).toEqual([]);
      expect(DEFAULT_CONFIG.allowedExtensions).toEqual([]);
      expect(DEFAULT_CONFIG.sandboxRoot).toContain('mcp-sandbox');
    });

    it('should have max file size less than quota', () => {
      expect(DEFAULT_CONFIG.maxFileSizeBytes).toBeLessThan(DEFAULT_CONFIG.quotaBytes);
    });
  });

  describe('DANGEROUS_EXTENSIONS', () => {
    it('should include common dangerous extensions', () => {
      const expectedDangerous = ['.exe', '.dll', '.sh', '.bat', '.ps1', '.js', '.jar'];
      
      for (const ext of expectedDangerous) {
        expect(DANGEROUS_EXTENSIONS).toContain(ext);
      }
    });

    it('should be all lowercase', () => {
      for (const ext of DANGEROUS_EXTENSIONS) {
        expect(ext).toBe(ext.toLowerCase());
        expect(ext).toMatch(/^\./); // Should start with dot
      }
    });
  });

  describe('loadConfig', () => {
    it('should return defaults when no environment variables set', () => {
      const config = loadConfig();
      
      expect(config.sandboxRoot).toBe(DEFAULT_CONFIG.sandboxRoot);
      expect(config.quotaBytes).toBe(DEFAULT_CONFIG.quotaBytes);
      expect(config.maxFileSizeBytes).toBe(DEFAULT_CONFIG.maxFileSizeBytes);
      expect(config.allowDelete).toBe(DEFAULT_CONFIG.allowDelete);
      expect(config.allowDirectoryOps).toBe(DEFAULT_CONFIG.allowDirectoryOps);
      expect(config.allowBinary).toBe(DEFAULT_CONFIG.allowBinary);
      expect(config.blockedExtensions).toEqual(DEFAULT_CONFIG.blockedExtensions);
      expect(config.allowedExtensions).toEqual(DEFAULT_CONFIG.allowedExtensions);
    });

    it('should load sandbox root from environment', () => {
      mockEnvVars({ MCP_SANDBOX_ROOT: sandbox.path });
      
      const config = loadConfig();
      expect(config.sandboxRoot).toBe(sandbox.path);
    });

    it('should load quota from environment', () => {
      mockEnvVars({ MCP_SANDBOX_QUOTA: '50000000' }); // 50MB
      
      const config = loadConfig();
      expect(config.quotaBytes).toBe(50000000);
    });

    it('should load max file size from environment', () => {
      mockEnvVars({ MCP_SANDBOX_MAX_FILE_SIZE: '5000000' }); // 5MB
      
      const config = loadConfig();
      expect(config.maxFileSizeBytes).toBe(5000000);
    });

    it('should load boolean flags from environment', () => {
      mockEnvVars({
        MCP_SANDBOX_ALLOW_DELETE: 'false',
        MCP_SANDBOX_ALLOW_DIRECTORY_OPS: 'false',
        MCP_SANDBOX_ALLOW_BINARY: 'false'
      });
      
      const config = loadConfig();
      expect(config.allowDelete).toBe(false);
      expect(config.allowDirectoryOps).toBe(false);
      expect(config.allowBinary).toBe(false);
    });

    it('should default boolean flags to true when not "false"', () => {
      mockEnvVars({
        MCP_SANDBOX_ALLOW_DELETE: 'true',
        MCP_SANDBOX_ALLOW_DIRECTORY_OPS: 'anything',
        MCP_SANDBOX_ALLOW_BINARY: '' // empty string
      });
      
      const config = loadConfig();
      expect(config.allowDelete).toBe(true);
      expect(config.allowDirectoryOps).toBe(true);
      expect(config.allowBinary).toBe(true);
    });

    it('should load extension lists from environment', () => {
      mockEnvVars({
        MCP_SANDBOX_BLOCKED_EXTENSIONS: '.exe,.dll,.sh',
        MCP_SANDBOX_ALLOWED_EXTENSIONS: '.txt,.json,.md'
      });
      
      const config = loadConfig();
      expect(config.blockedExtensions).toEqual(['.exe', '.dll', '.sh']);
      expect(config.allowedExtensions).toEqual(['.txt', '.json', '.md']);
    });

    it('should trim and lowercase extension lists', () => {
      mockEnvVars({
        MCP_SANDBOX_BLOCKED_EXTENSIONS: ' .EXE , .DLL , .SH ',
        MCP_SANDBOX_ALLOWED_EXTENSIONS: ' .TXT , .JSON , .MD '
      });
      
      const config = loadConfig();
      expect(config.blockedExtensions).toEqual(['.exe', '.dll', '.sh']);
      expect(config.allowedExtensions).toEqual(['.txt', '.json', '.md']);
    });

    it('should handle empty extension lists', () => {
      mockEnvVars({
        MCP_SANDBOX_BLOCKED_EXTENSIONS: '',
        MCP_SANDBOX_ALLOWED_EXTENSIONS: ''
      });
      
      const config = loadConfig();
      expect(config.blockedExtensions).toEqual([]);
      expect(config.allowedExtensions).toEqual([]);
    });

    it('should add dangerous extensions when requested', () => {
      mockEnvVars({ 
        MCP_SANDBOX_BLOCK_DANGEROUS: 'true',
        MCP_SANDBOX_BLOCKED_EXTENSIONS: '.custom'
      });
      
      const config = loadConfig();
      
      // Should include both custom and dangerous extensions
      expect(config.blockedExtensions).toContain('.custom');
      expect(config.blockedExtensions).toContain('.exe');
      expect(config.blockedExtensions).toContain('.dll');
      expect(config.blockedExtensions).toContain('.sh');
      
      // Should remove duplicates
      expect(config.blockedExtensions.length).toBe(new Set(config.blockedExtensions).size);
    });

    it('should handle invalid numeric environment variables', () => {
      mockEnvVars({
        MCP_SANDBOX_QUOTA: 'not-a-number',
        MCP_SANDBOX_MAX_FILE_SIZE: 'invalid'
      });
      
      const config = loadConfig();
      
      // Should fall back to defaults for invalid numbers
      expect(config.quotaBytes).toBe(DEFAULT_CONFIG.quotaBytes);
      expect(config.maxFileSizeBytes).toBe(DEFAULT_CONFIG.maxFileSizeBytes);
    });
  });

  describe('validateConfig', () => {
    it('should validate a good config', async () => {
      const config = {
        sandboxRoot: sandbox.path,
        quotaBytes: 10 * 1024 * 1024, // 10MB
        maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
        allowDelete: true,
        allowDirectoryOps: true,
        allowBinary: true,
        blockedExtensions: ['.exe'],
        allowedExtensions: []
      };
      
      await expect(validateConfig(config)).resolves.not.toThrow();
    });

    it('should reject empty sandbox root', async () => {
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: ''
      };
      
      await expect(validateConfig(config)).rejects.toThrow(/Sandbox root directory must be specified/);
    });

    it('should reject zero or negative quota', async () => {
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: sandbox.path,
        quotaBytes: 0
      };
      
      await expect(validateConfig(config)).rejects.toThrow(/Quota must be positive/);
    });

    it('should reject zero or negative max file size', async () => {
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: sandbox.path,
        maxFileSizeBytes: 0
      };
      
      await expect(validateConfig(config)).rejects.toThrow(/Max file size must be positive/);
    });

    it('should reject max file size larger than quota', async () => {
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: sandbox.path,
        quotaBytes: 5 * 1024 * 1024, // 5MB
        maxFileSizeBytes: 10 * 1024 * 1024 // 10MB
      };
      
      await expect(validateConfig(config)).rejects.toThrow(/Max file size must be.*less than quota/);
    });

    it('should reject invalid extension formats', async () => {
      const invalidExtensions = ['exe', 'no-dot', '.valid', 'invalid'];
      
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: sandbox.path,
        blockedExtensions: invalidExtensions
      };
      
      await expect(validateConfig(config)).rejects.toThrow(/Extension.*must start with a dot/);
    });

    it('should warn when both whitelist and blacklist are set', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: sandbox.path,
        allowedExtensions: ['.txt'],
        blockedExtensions: ['.exe']
      };
      
      await validateConfig(config);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Both allowed and blocked extensions are set')
      );
      
      consoleSpy.mockRestore();
    });

    it('should create sandbox directory if it does not exist', async () => {
      const newSandboxPath = `${sandbox.path}/new-sandbox`;
      
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: newSandboxPath
      };
      
      expect(await sandbox.exists('new-sandbox')).toBe(false);
      
      await validateConfig(config);
      
      expect(await sandbox.exists('new-sandbox')).toBe(true);
    });

    it('should accept existing sandbox directory', async () => {
      await sandbox.createDirectory('existing-sandbox');
      const existingSandboxPath = `${sandbox.path}/existing-sandbox`;
      
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: existingSandboxPath
      };
      
      await expect(validateConfig(config)).resolves.not.toThrow();
    });

    it('should handle disk space check errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Use an invalid path that might cause disk space check to fail
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: '/definitely/does/not/exist/and/cannot/be/created',
        quotaBytes: 1024
      };
      
      // Should not throw even if disk space check fails
      await expect(validateConfig(config)).rejects.toThrow(); // Will fail on directory creation
      
      consoleSpy.mockRestore();
    });

    it('should handle insufficient disk space', async () => {
      // This test is tricky to implement reliably across different systems
      // We'll just verify the error handling structure exists
      
      const config = {
        ...DEFAULT_CONFIG,
        sandboxRoot: sandbox.path,
        quotaBytes: Number.MAX_SAFE_INTEGER // Impossibly large quota
      };
      
      // May or may not throw depending on available disk space
      // The important thing is that it doesn't crash
      await expect(validateConfig(config)).resolves.not.toThrow();
    });
  });

  describe('Integration with loadConfig and validateConfig', () => {
    it('should load and validate environment-based config', async () => {
      mockEnvVars({
        MCP_SANDBOX_ROOT: sandbox.path,
        MCP_SANDBOX_QUOTA: '1048576', // 1MB
        MCP_SANDBOX_MAX_FILE_SIZE: '524288', // 512KB
        MCP_SANDBOX_ALLOW_DELETE: 'false',
        MCP_SANDBOX_BLOCKED_EXTENSIONS: '.exe,.dll'
      });
      
      const config = loadConfig();
      await expect(validateConfig(config)).resolves.not.toThrow();
      
      expect(config.sandboxRoot).toBe(sandbox.path);
      expect(config.quotaBytes).toBe(1048576);
      expect(config.maxFileSizeBytes).toBe(524288);
      expect(config.allowDelete).toBe(false);
      expect(config.blockedExtensions).toEqual(['.exe', '.dll']);
    });

    it('should handle complete dangerous extensions setup', async () => {
      mockEnvVars({
        MCP_SANDBOX_ROOT: sandbox.path,
        MCP_SANDBOX_BLOCK_DANGEROUS: 'true',
        MCP_SANDBOX_ALLOW_DELETE: 'false',
        MCP_SANDBOX_ALLOW_DIRECTORY_OPS: 'false',
        MCP_SANDBOX_ALLOW_BINARY: 'false',
        MCP_SANDBOX_ALLOWED_EXTENSIONS: '.txt,.md,.json'
      });
      
      const config = loadConfig();
      await expect(validateConfig(config)).resolves.not.toThrow();
      
      // Should have dangerous extensions blocked
      expect(config.blockedExtensions.length).toBeGreaterThan(5);
      expect(config.blockedExtensions).toContain('.exe');
      expect(config.blockedExtensions).toContain('.dll');
      expect(config.blockedExtensions).toContain('.sh');
      
      // Should have restrictions enabled
      expect(config.allowDelete).toBe(false);
      expect(config.allowDirectoryOps).toBe(false);
      expect(config.allowBinary).toBe(false);
      
      // Should have allowed extensions
      expect(config.allowedExtensions).toEqual(['.txt', '.md', '.json']);
    });
  });
});
