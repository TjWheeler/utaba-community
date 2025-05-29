import { describe, it, expect, beforeEach } from 'vitest';
import { 
  validatePath, 
  validateFilename,
  checkFileExtension,
  checkBinaryAllowed,
  checkOperationAllowed,
  getRelativePath,
  SecurityError 
} from '../../security.js';
import { createTestConfig, RESTRICTED_CONFIG } from '../../test-utils/testHelpers.js';
import { createMockLogger } from '../../test-utils/mockLogger.js';
import * as path from 'path';

describe('Security', () => {
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockLogger.clear();
  });

  describe('validatePath', () => {
    const sandboxRoot = '/tmp/sandbox';

    it('should validate safe paths within sandbox', () => {
      const safePaths = [
        'file.txt',
        'folder/file.txt',
        'deep/nested/path/file.txt',
        './file.txt',
        'folder/../file.txt'
      ];

      for (const safePath of safePaths) {
        expect(() => validatePath(safePath, sandboxRoot)).not.toThrow();
        const result = validatePath(safePath, sandboxRoot);
        expect(result.startsWith(sandboxRoot)).toBe(true);
      }
    });

    it('should block path traversal attempts', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '/etc/passwd',
        'C:\\Windows\\System32\\config',
        'folder/../../etc/passwd',
        '../../../../../../etc/shadow'
      ];

      for (const maliciousPath of maliciousPaths) {
        expect(() => validatePath(maliciousPath, sandboxRoot)).toThrow(SecurityError);
        expect(() => validatePath(maliciousPath, sandboxRoot)).toThrow(/Path traversal attempt/);
      }
    });

    it('should reject invalid path types', () => {
      expect(() => validatePath(null as any, sandboxRoot)).toThrow(SecurityError);
      expect(() => validatePath(undefined as any, sandboxRoot)).toThrow(SecurityError);
      expect(() => validatePath(123 as any, sandboxRoot)).toThrow(SecurityError);
      expect(() => validatePath({} as any, sandboxRoot)).toThrow(SecurityError);
    });

    it('should reject empty paths', () => {
      expect(() => validatePath('', sandboxRoot)).toThrow(SecurityError);
      expect(() => validatePath('   ', sandboxRoot)).toThrow(SecurityError);
    });

    it('should reject invalid sandbox root types', () => {
      expect(() => validatePath('file.txt', null as any)).toThrow(SecurityError);
      expect(() => validatePath('file.txt', undefined as any)).toThrow(SecurityError);
      expect(() => validatePath('file.txt', 123 as any)).toThrow(SecurityError);
    });

    it('should handle suspicious patterns', () => {
      const suspiciousPaths = [
        'file\0.txt',
        'con.txt',
        'prn.log',
        'aux',
        'nul.data',
        'com1.txt',
        'lpt9.config'
      ];

      for (const suspiciousPath of suspiciousPaths) {
        expect(() => validatePath(suspiciousPath, sandboxRoot)).toThrow(SecurityError);
      }
    });

    it('should work with Windows paths', () => {
      const windowsRoot = 'C:\\tmp\\sandbox';
      const validPath = validatePath('folder\\file.txt', windowsRoot);
      expect(validPath.includes(windowsRoot)).toBe(true);
    });

    it('should log security events', () => {
      try {
        validatePath('../../../etc/passwd', sandboxRoot);
      } catch {
        // Expected to throw
      }

      expect(mockLogger.logSecurity).toHaveBeenCalledWith(
        'Security',
        'pathValidation',
        '../../../etc/passwd',
        true,
        'Path traversal attempt'
      );
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path from sandbox root', () => {
      const sandboxRoot = '/tmp/sandbox';
      const fullPath = '/tmp/sandbox/folder/file.txt';
      
      const result = getRelativePath(fullPath, sandboxRoot);
      expect(result).toBe('folder/file.txt');
    });

    it('should normalize path separators', () => {
      const sandboxRoot = '/tmp/sandbox';
      const fullPath = '/tmp/sandbox/folder\\subfolder\\file.txt';
      
      const result = getRelativePath(fullPath, sandboxRoot);
      expect(result).toContain('/'); // Should be normalized to forward slashes
    });

    it('should handle root path', () => {
      const sandboxRoot = '/tmp/sandbox';
      const fullPath = '/tmp/sandbox';
      
      const result = getRelativePath(fullPath, sandboxRoot);
      expect(result).toBe('');
    });

    it('should reject invalid types', () => {
      expect(() => getRelativePath(null as any, '/tmp')).toThrow(SecurityError);
      expect(() => getRelativePath('/path', null as any)).toThrow(SecurityError);
    });
  });

  describe('validateFilename', () => {
    const config = createTestConfig();

    it('should validate safe filenames', () => {
      const safeFilenames = [
        'file.txt',
        'document.pdf',
        'image.jpg',
        'data.json',
        'script.js',
        'file-name.txt',
        'file_name.txt',
        'filename123.ext'
      ];

      for (const filename of safeFilenames) {
        expect(() => validateFilename(filename, config)).not.toThrow();
      }
    });

    it('should reject filenames with invalid characters', () => {
      const invalidFilenames = [
        'file<.txt',
        'file>.txt',
        'file:.txt',
        'file".txt',
        'file|.txt',
        'file?.txt',
        'file*.txt',
        'file\0.txt'
      ];

      for (const filename of invalidFilenames) {
        expect(() => validateFilename(filename, config)).toThrow(SecurityError);
        expect(() => validateFilename(filename, config)).toThrow(/invalid characters/);
      }
    });

    it('should reject reserved names', () => {
      const reservedNames = [
        'con',
        'con.txt',
        'PRN',
        'prn.log',
        'AUX.data',
        'nul',
        'com1',
        'COM9.txt',
        'lpt1',
        'LPT9.config'
      ];

      for (const reserved of reservedNames) {
        expect(() => validateFilename(reserved, config)).toThrow(SecurityError);
        expect(() => validateFilename(reserved, config)).toThrow(/reserved name/);
      }
    });

    it('should reject hidden files', () => {
      const hiddenFiles = [
        '.hidden',
        '.secret.txt',
        '.config',
        '..hidden'
      ];

      for (const hidden of hiddenFiles) {
        expect(() => validateFilename(hidden, config)).toThrow(SecurityError);
        expect(() => validateFilename(hidden, config)).toThrow(/Hidden files/);
      }
    });

    it('should allow .mcp-quota.json file', () => {
      expect(() => validateFilename('.mcp-quota.json', config)).not.toThrow();
    });

    it('should reject empty or invalid filenames', () => {
      expect(() => validateFilename('', config)).toThrow(SecurityError);
      expect(() => validateFilename('   ', config)).toThrow(SecurityError);
      expect(() => validateFilename(null as any, config)).toThrow(SecurityError);
      expect(() => validateFilename(undefined as any, config)).toThrow(SecurityError);
    });

    it('should check file extensions', () => {
      const restrictedConfig = createTestConfig({
        blockedExtensions: ['.exe', '.dll']
      });

      expect(() => validateFilename('virus.exe', restrictedConfig)).toThrow(SecurityError);
      expect(() => validateFilename('library.dll', restrictedConfig)).toThrow(SecurityError);
      expect(() => validateFilename('document.txt', restrictedConfig)).not.toThrow();
    });
  });

  describe('checkFileExtension', () => {
    it('should allow all extensions when no restrictions', () => {
      const config = createTestConfig();
      
      const filenames = ['file.txt', 'script.js', 'image.png', 'document.pdf'];
      for (const filename of filenames) {
        expect(() => checkFileExtension(filename, config)).not.toThrow();
      }
    });

    it('should enforce whitelist when provided', () => {
      const config = createTestConfig({
        allowedExtensions: ['.txt', '.json', '.md']
      });

      // Should allow whitelisted extensions
      expect(() => checkFileExtension('file.txt', config)).not.toThrow();
      expect(() => checkFileExtension('data.json', config)).not.toThrow();
      expect(() => checkFileExtension('readme.md', config)).not.toThrow();

      // Should block non-whitelisted extensions
      expect(() => checkFileExtension('script.js', config)).toThrow(SecurityError);
      expect(() => checkFileExtension('image.png', config)).toThrow(SecurityError);
      expect(() => checkFileExtension('document.pdf', config)).toThrow(SecurityError);
    });

    it('should enforce blacklist when no whitelist', () => {
      const config = createTestConfig({
        blockedExtensions: ['.exe', '.dll', '.sh']
      });

      // Should allow non-blacklisted extensions
      expect(() => checkFileExtension('file.txt', config)).not.toThrow();
      expect(() => checkFileExtension('script.js', config)).not.toThrow();

      // Should block blacklisted extensions
      expect(() => checkFileExtension('virus.exe', config)).toThrow(SecurityError);
      expect(() => checkFileExtension('library.dll', config)).toThrow(SecurityError);
      expect(() => checkFileExtension('script.sh', config)).toThrow(SecurityError);
    });

    it('should prioritize whitelist over blacklist', () => {
      const config = createTestConfig({
        allowedExtensions: ['.txt', '.exe'], // .exe is allowed in whitelist
        blockedExtensions: ['.exe'] // but blocked in blacklist
      });

      // Whitelist should take precedence
      expect(() => checkFileExtension('file.txt', config)).not.toThrow();
      expect(() => checkFileExtension('program.exe', config)).not.toThrow();
    });

    it('should be case insensitive', () => {
      const config = createTestConfig({
        blockedExtensions: ['.exe']
      });

      expect(() => checkFileExtension('program.EXE', config)).toThrow(SecurityError);
      expect(() => checkFileExtension('program.Exe', config)).toThrow(SecurityError);
    });

    it('should handle files without extensions', () => {
      const config = createTestConfig({
        allowedExtensions: ['.txt']
      });

      // File without extension should be blocked when whitelist is active
      expect(() => checkFileExtension('makefile', config)).toThrow(SecurityError);
    });

    it('should reject invalid filename types', () => {
      const config = createTestConfig();
      
      expect(() => checkFileExtension(null as any, config)).toThrow(SecurityError);
      expect(() => checkFileExtension(undefined as any, config)).toThrow(SecurityError);
      expect(() => checkFileExtension(123 as any, config)).toThrow(SecurityError);
    });
  });

  describe('checkBinaryAllowed', () => {
    it('should always allow text operations', () => {
      const restrictedConfig = createTestConfig({ allowBinary: false });
      
      expect(() => checkBinaryAllowed('file.txt', restrictedConfig, false)).not.toThrow();
      expect(() => checkBinaryAllowed('script.js', restrictedConfig, false)).not.toThrow();
    });

    it('should block binary operations when disabled', () => {
      const restrictedConfig = createTestConfig({ allowBinary: false });
      
      expect(() => checkBinaryAllowed('image.jpg', restrictedConfig, true)).toThrow(SecurityError);
      expect(() => checkBinaryAllowed('document.pdf', restrictedConfig, true)).toThrow(SecurityError);
    });

    it('should allow binary operations when enabled', () => {
      const config = createTestConfig({ allowBinary: true });
      
      expect(() => checkBinaryAllowed('image.jpg', config, true)).not.toThrow();
      expect(() => checkBinaryAllowed('document.pdf', config, true)).not.toThrow();
    });

    it('should check binary extensions even when allowBinary is false', () => {
      const restrictedConfig = createTestConfig({ allowBinary: false });
      
      const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip'];
      for (const ext of binaryExtensions) {
        expect(() => checkBinaryAllowed(`file${ext}`, restrictedConfig, false)).toThrow(SecurityError);
      }
    });
  });

  describe('checkOperationAllowed', () => {
    it('should allow all operations with default config', () => {
      const config = createTestConfig();
      
      expect(() => checkOperationAllowed('delete', config)).not.toThrow();
      expect(() => checkOperationAllowed('createDir', config)).not.toThrow();
      expect(() => checkOperationAllowed('deleteDir', config)).not.toThrow();
    });

    it('should block delete operations when disabled', () => {
      const config = createTestConfig({ allowDelete: false });
      
      expect(() => checkOperationAllowed('delete', config)).toThrow(SecurityError);
      expect(() => checkOperationAllowed('delete', config)).toThrow(/Delete operations/);
    });

    it('should block directory operations when disabled', () => {
      const config = createTestConfig({ allowDirectoryOps: false });
      
      expect(() => checkOperationAllowed('createDir', config)).toThrow(SecurityError);
      expect(() => checkOperationAllowed('deleteDir', config)).toThrow(SecurityError);
      expect(() => checkOperationAllowed('createDir', config)).toThrow(/Directory operations/);
    });

    it('should log security events for blocked operations', () => {
      const config = createTestConfig({ allowDelete: false });
      
      try {
        checkOperationAllowed('delete', config);
      } catch {
        // Expected to throw
      }

      expect(mockLogger.logSecurity).toHaveBeenCalledWith(
        'Security',
        'operationCheck',
        'delete',
        true,
        'Delete operations disabled'
      );
    });
  });

  describe('Integration with RESTRICTED_CONFIG', () => {
    it('should enforce all restrictions', () => {
      // Delete operations blocked
      expect(() => checkOperationAllowed('delete', RESTRICTED_CONFIG)).toThrow();
      
      // Directory operations blocked
      expect(() => checkOperationAllowed('createDir', RESTRICTED_CONFIG)).toThrow();
      expect(() => checkOperationAllowed('deleteDir', RESTRICTED_CONFIG)).toThrow();
      
      // Binary operations blocked
      expect(() => checkBinaryAllowed('image.jpg', RESTRICTED_CONFIG, true)).toThrow();
      
      // Only specific extensions allowed
      expect(() => checkFileExtension('script.js', RESTRICTED_CONFIG)).toThrow();
      expect(() => checkFileExtension('document.txt', RESTRICTED_CONFIG)).not.toThrow();
      
      // Blocked extensions rejected
      expect(() => checkFileExtension('program.exe', RESTRICTED_CONFIG)).toThrow();
    });
  });
});
