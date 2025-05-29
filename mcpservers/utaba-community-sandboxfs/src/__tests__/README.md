# Test Suite Documentation

This directory contains comprehensive tests for the MCP Sandbox File System server.

## Test Structure

```
src/__tests__/
├── unit/                    # Unit tests for individual components
│   ├── config.test.ts      # Configuration loading and validation
│   ├── fileOperations.test.ts # File operations functionality
│   ├── logger.test.ts      # Logging system
│   ├── performanceTimer.test.ts # Performance timing utilities
│   ├── quota.test.ts       # Quota management
│   └── security.test.ts    # Security validation
├── integration/            # Integration tests
│   └── server.test.ts     # End-to-end server functionality
└── fixtures/              # Test data and mock files
    └── test-files/        # Sample files for testing
```

## Test Utilities

The `test-utils/` directory provides reusable testing utilities:

- **`mockLogger.ts`** - Mock logger for capturing log entries
- **`tempSandbox.ts`** - Temporary filesystem for isolated testing
- **`testHelpers.ts`** - Common test configurations and utilities
- **`setup.ts`** - Global test setup and configuration

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests once and exit
npm run test:run

# Run with coverage reporting
npm run test:coverage

# Run with UI for debugging
npm run test:ui

# Debug tests with breakpoints
npm run test:debug
```

### IDE Integration

The test suite is configured for excellent IDE debugging support:

- **VS Code**: Use the built-in debugger with breakpoints
- **IntelliJ/WebStorm**: Native Vitest integration
- **Other IDEs**: Use `npm run test:debug` and attach debugger

### Filtering Tests

```bash
# Run specific test file
npx vitest src/__tests__/unit/logger.test.ts

# Run tests matching pattern
npx vitest --grep "should validate paths"

# Run tests for specific component
npx vitest --grep "Security"
```

## Test Categories

### Unit Tests

Each component has comprehensive unit tests covering:

- **Happy path scenarios** - Normal operation
- **Error conditions** - Invalid inputs, system failures
- **Edge cases** - Boundary conditions, unusual inputs
- **Security scenarios** - Malicious inputs, attack vectors

### Integration Tests

End-to-end tests covering:

- **Complete workflows** - Full file operation cycles
- **Component interactions** - How modules work together
- **Real-world scenarios** - Typical usage patterns
- **Performance characteristics** - Speed and efficiency

## Test Patterns

### Isolated Testing

Each test uses temporary sandboxes to ensure isolation:

```typescript
let sandbox = useTempSandbox('test-name');
// Automatically cleaned up after each test
```

### Mock Logger

Capture and verify logging behavior:

```typescript
let mockLogger = createMockLogger();
// Verify log entries, security events, performance metrics
```

### Configuration Testing

Use predefined test configurations:

```typescript
const config = createTestConfig({
  quotaBytes: 1024 * 1024,
  allowDelete: false
});
```

## Coverage Goals

The test suite aims for high coverage:

- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+
- **Statements**: 80%+

## Writing New Tests

### File Naming

- Unit tests: `componentName.test.ts`
- Integration tests: `featureName.test.ts`
- Test utilities: `utilityName.ts`

### Test Structure

```typescript
describe('ComponentName', () => {
  let sandbox = useTempSandbox('component-test');
  let mockLogger = createMockLogger();

  beforeEach(async () => {
    mockLogger.clear();
    // Setup component
  });

  describe('Feature Group', () => {
    it('should handle specific scenario', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Best Practices

1. **Descriptive test names** - Clear what is being tested
2. **AAA pattern** - Arrange, Act, Assert
3. **Single responsibility** - One concept per test
4. **Independent tests** - No dependencies between tests
5. **Clean up resources** - Use proper teardown
6. **Meaningful assertions** - Test the right things

## Common Test Scenarios

### Security Testing

```typescript
it('should reject malicious paths', async () => {
  await expect(fileOps.readFile('../../../etc/passwd'))
    .rejects.toThrow(SecurityError);
});
```

### Quota Testing

```typescript
it('should enforce quota limits', async () => {
  const largeContent = createTestContent(quotaLimit + 1);
  await expect(fileOps.writeFile('large.txt', largeContent))
    .rejects.toThrow(QuotaError);
});
```

### Performance Testing

```typescript
it('should complete operations efficiently', async () => {
  const start = Date.now();
  await fileOps.performOperation();
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(1000);
});
```

### Error Handling

```typescript
it('should handle system errors gracefully', async () => {
  // Simulate system failure
  await expect(fileOps.operationThatFails())
    .rejects.toThrow(/specific error message/);
});
```

## Debugging Tests

### Using VS Code

1. Set breakpoints in test files
2. Run "Debug Test" from command palette
3. Step through code execution

### Using Browser DevTools

```bash
npm run test:ui
# Opens browser interface for test debugging
```

### Console Debugging

```typescript
it('should debug issue', async () => {
  console.log('Debug info:', someVariable);
  // Use console.log for quick debugging
});
```

## Test Maintenance

### Adding New Features

1. Write tests first (TDD approach)
2. Ensure good coverage of new code
3. Update integration tests for new workflows
4. Document any new test utilities

### Updating Existing Tests

1. Keep tests in sync with code changes
2. Update test data when formats change
3. Maintain test performance
4. Fix flaky tests promptly

### Performance Considerations

- Keep test execution fast
- Use minimal test data when possible
- Clean up resources properly
- Avoid unnecessary async operations

## Troubleshooting

### Common Issues

1. **Tests timing out** - Increase timeout in vitest.config.ts
2. **File permission errors** - Check temp directory permissions
3. **Port conflicts** - Ensure no conflicting services
4. **Memory leaks** - Verify proper cleanup in afterEach

### Test Flakiness

- Use deterministic test data
- Avoid timing-dependent assertions
- Properly wait for async operations
- Clean up shared resources

### Performance Issues

- Profile slow tests with `--reporter=verbose`
- Use smaller test datasets
- Optimize test setup/teardown
- Run tests in parallel when possible
