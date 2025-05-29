/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Environment setup
    globals: true,
    environment: 'node',
    
    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '**/*.d.ts'],
    
    // TypeScript configuration for tests
    typecheck: {
      tsconfig: './tsconfig.test.json'
    },
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test-utils/',
        '**/*.d.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // Test timeout
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Reporter configuration
    reporters: ['verbose', 'json', 'html'],
    
    // Setup files
    setupFiles: ['./src/test-utils/setup.ts'],
    
    // Resolve aliases to match TypeScript paths
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './src/__tests__'),
      '@test-utils': path.resolve(__dirname, './src/test-utils')
    }
  }
});
