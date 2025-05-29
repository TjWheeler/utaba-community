#!/usr/bin/env node

/**
 * Test runner script to verify the test setup
 * This can be run to check if all tests pass
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Running MCP Sandbox FS Test Suite...\n');

// Run the tests
const testProcess = spawn('npm', ['run', 'test:run'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ All tests passed!');
    console.log('🎉 Test suite setup is working correctly.');
    
    console.log('\n📋 Available test commands:');
    console.log('  npm test              - Run tests in watch mode');
    console.log('  npm run test:run      - Run tests once');
    console.log('  npm run test:coverage - Run with coverage report');
    console.log('  npm run test:ui       - Open test UI in browser');
    console.log('  npm run test:debug    - Debug tests with breakpoints');
    
  } else {
    console.log(`\n❌ Tests failed with exit code ${code}`);
    console.log('💡 Try running individual test files to debug issues.');
    process.exit(code);
  }
});

testProcess.on('error', (error) => {
  console.error('❌ Failed to run tests:', error.message);
  console.log('💡 Make sure you have run "npm install" first.');
  process.exit(1);
});
