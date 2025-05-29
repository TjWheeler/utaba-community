import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateConfig, createConfigFile, DEFAULT_CONFIGS, getEnvironmentOverrides } from '../config';
import { withTempDirectory, withEnvironmentVariable } from '../test-utils/helpers';
import { promises as fs } from 'fs';
import path from 'path';

describe('Configuration System', () => {
  describe('config loading', () => {
    it('should load valid configuration file', async () => {
      await withTempDirectory(async (tempDir) => {
        const configPath = path.join(tempDir, 'test-config.json');
        const testConfig = {
          projectRoots: [tempDir],
          trustedEnvironment: true,
          allowedCommands: [
            {
              command: 'echo',
              allowedArgs: ['test'],
              description: 'Test echo'
            }
          ]
        };

        await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

        const config = await loadConfig(configPath);
        expect(config.projectRoots).toEqual([tempDir]);
        expect(config.trustedEnvironment).toBe(true);
        expect(config.allowedCommands).toHaveLength(1);
      });
    });

    it('should validate config schema', async () => {
      await withTempDirectory(async (tempDir) => {
        const configPath = path.join(tempDir, 'invalid-config.json');
        const invalidConfig = {
          // Missing required fields
          trustedEnvironment: 'not-boolean',
          allowedCommands: 'not-array'
        };

        await fs.writeFile(configPath, JSON.stringify(invalidConfig));

        await expect(loadConfig(configPath)).rejects.toThrow(/validation failed/);
      });
    });
  });

  describe('config validation', () => {
    it('should validate project roots exist', async () => {
      const config = {
        projectRoots: ['/nonexistent/path'],
        trustedEnvironment: true,
        allowedCommands: []
      } as any;

      await expect(validateConfig(config)).rejects.toThrow(/not accessible/);
    });

    it('should validate regex patterns in commands', async () => {
      await withTempDirectory(async (tempDir) => {
        const config = {
          projectRoots: [tempDir],
          trustedEnvironment: true,
          allowedCommands: [
            {
              command: 'test',
              argPatterns: ['[invalid regex']
            }
          ]
        } as any;

        await expect(validateConfig(config)).rejects.toThrow(/Invalid regex pattern/);
      });
    });

    it('should validate working directory requirements', async () => {
      await withTempDirectory(async (tempDir) => {
        const config = {
          projectRoots: [tempDir],
          trustedEnvironment: true,
          allowedCommands: [
            {
              command: 'test',
              workingDirRestriction: 'specific'
              // Missing allowedWorkingDirs
            }
          ]
        } as any;

        await expect(validateConfig(config)).rejects.toThrow(/requires allowedWorkingDirs/);
      });
    });
  });

  describe('config templates', () => {
    it('should create nodejs template config', async () => {
      await withTempDirectory(async (tempDir) => {
        const configPath = path.join(tempDir, 'nodejs-config.json');
        
        const createdPath = await createConfigFile('nodejs', configPath);
        expect(createdPath).toBe(configPath);

        const config = await loadConfig(configPath);
        expect(config.allowedCommands.some(cmd => cmd.command === 'npm')).toBe(true);
        expect(config.allowedCommands.some(cmd => cmd.command === 'tsc')).toBe(true);
        expect(config.allowedCommands.some(cmd => cmd.command === 'eslint')).toBe(true);
      });
    });

    it('should create minimal template config', async () => {
      await withTempDirectory(async (tempDir) => {
        const configPath = path.join(tempDir, 'minimal-config.json');
        
        await createConfigFile('minimal', configPath);
        const config = await loadConfig(configPath);
        
        // Minimal should have fewer commands
        expect(config.allowedCommands.length).toBeLessThan(DEFAULT_CONFIGS.nodejs.allowedCommands.length);
        expect(config.allowedCommands.some(cmd => cmd.command === 'npm')).toBe(true);
      });
    });
  });

  describe('environment overrides', () => {
    it('should override log level from environment', async () => {
      await withEnvironmentVariable('UTABA_MCP_SHELL_LOG_LEVEL', 'debug', async () => {
        const overrides = getEnvironmentOverrides();
        
        expect(overrides.logLevel).toBe('debug');
      });
    });

    it('should override max concurrent commands', async () => {
      await withEnvironmentVariable('UTABA_MCP_SHELL_MAX_CONCURRENT', '5', async () => {
        const overrides = getEnvironmentOverrides();
        
        expect(overrides.maxConcurrentCommands).toBe(5);
      });
    });

    it('should ignore invalid environment values', async () => {
      await withEnvironmentVariable('UTABA_MCP_SHELL_MAX_CONCURRENT', 'invalid', async () => {
        const overrides = getEnvironmentOverrides();
        
        expect(overrides.maxConcurrentCommands).toBeUndefined();
      });
    });
  });

  describe('config schema validation', () => {
    it('should enforce timeout limits', async () => {
      await withTempDirectory(async (tempDir) => {
        const configPath = path.join(tempDir, 'timeout-config.json');
        const invalidConfig = {
          projectRoots: [tempDir],
          trustedEnvironment: true,
          defaultTimeout: 500, // Too low
          allowedCommands: []
        };

        await fs.writeFile(configPath, JSON.stringify(invalidConfig));
        await expect(loadConfig(configPath)).rejects.toThrow();
      });
    });

    it('should enforce project root requirements', async () => {
      await withTempDirectory(async (tempDir) => {
        const configPath = path.join(tempDir, 'no-roots-config.json');
        const invalidConfig = {
          projectRoots: [], // Empty array not allowed
          trustedEnvironment: true,
          allowedCommands: []
        };

        await fs.writeFile(configPath, JSON.stringify(invalidConfig));
        await expect(loadConfig(configPath)).rejects.toThrow();
      });
    });
  });
});
