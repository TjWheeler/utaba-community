# Micro-block Architecture Summary

*Essential patterns for AI developers working on this codebase*

## Core Concept

Business logic is implemented as **Commands** - self-contained units that declare their contracts and dependencies explicitly. Commands are discovered and instantiated via registries, enabling automatic dependency injection and composition.

## Command Structure Template

```typescript
// All types in same file
export interface MyCommandInput { /* explicit input contract */ }
export interface MyCommandOutput { /* explicit output contract */ }
export class MyCommandError extends ErrorBase { /* custom errors */ }

export class MyCommand implements OutputCommand<MyCommandInput, MyCommandOutput, MyCommandError> {
  // Static metadata for discovery
  static readonly metadata: CommandMetadata = {
    name: "MyCommand",
    category: "folder-name",  // MUST match parent folder exactly
    inputType: "MyCommandInput",
    outputType: "MyCommandOutput", 
    errorType: "MyCommandError",
    dependencies: {
      services: ["IDatabaseService", "ICacheService"],
      commands: ["catagory/SomeOtherCommand"], 
      external: ["youtube-api"]
    }
  };

  constructor(
    public input?: MyCommandInput,
    private logger?: any,
    private services?: Record<string, any>,
    private commands?: Record<string, any>
  ) {
    // Resolve dependencies with validation
    this.dbService = services?.['IDatabaseService'];
    this.otherCommand = commands?.['other/SomeOtherCommand'];
    
    if (!this.dbService) {
      throw new MyCommandError('IDatabaseService required', 'MISSING_SERVICE');
    }
  }

  validate(): boolean { /* input validation */ }
  async execute(): Promise<MyCommandOutput> { /* business logic */ }
  getMetadata(): CommandMetadata { return MyCommand.metadata; }
}
```

## Critical Rules

### 1. Never Direct Instantiation
```typescript
// ❌ WRONG
const command = new CreateUserCommand(input);

// ✅ CORRECT  
const command = await commandRegistry.get<CreateUserCommand>(
  CreateUserCommand, input, logger
);
```

### 2. Category = Folder Name
```
src/commands/user/CreateUserCommand.ts → category: "user"
src/commands/cache/SetCacheCommand.ts → category: "cache"
```

### 3. Dependencies Object Structure
```typescript
dependencies: {
  services: ["IServiceName"],           // Interface names
  commands: ["category/CommandName"],   // Path format
  external: ["api-name"]                // External dependencies
}
```

### 4. Constructor Parameters Order
```typescript
constructor(
  input?: InputType,
  logger?: any,
  services?: Record<string, any>,    // Services by interface name
  commands?: Record<string, any>     // Commands by path
)
```

## Service Patterns

### Service Interface
```typescript
export interface IMyService extends BaseService {
  doSomething(param: string): Promise<Result>;
}
```

### Service Registration
```typescript
// In ServiceRegistry.initialize()
this.register('IMyService', () => {
  const { MyService } = require('@/services/MyService');
  return new MyService(this.config);
});
```

### Service Usage in Commands
```typescript
static readonly metadata: CommandMetadata = {
  dependencies: { services: ["IMyService"] }
};

constructor(/* ... */, private services?: Record<string, any>) {
  this.myService = services?.['IMyService'] as IMyService;
}
```

## Command Composition

### Workflow Commands
```typescript
export class WorkflowCommand {
  async execute(): Promise<WorkflowOutput> {
    // Step 1: Get command from registry
    const stepOne = await this.commandRegistry.get<StepOneCommand>(
      StepOneCommand, { data: this.input.data }
    );
    const result1 = await stepOne.execute();
    
    // Step 2: Use result from step 1
    const stepTwo = await this.commandRegistry.get<StepTwoCommand>(
      StepTwoCommand, { processedData: result1.output }
    );
    const result2 = await stepTwo.execute();
    
    return { finalResult: result2.value };
  }
}
```

### Registry Access Pattern
```typescript
// In API routes or higher-level components
const serviceRegistry = getServiceRegistry();
const commandRegistry = serviceRegistry.getCommandRegistry();

const command = await commandRegistry.get<MyCommand>(MyCommand, input, logger);
const result = await command.execute();
```

## Configuration Integration

### System Config (AppConfig)
```typescript
import { config } from '@/config';

// Use established config, never hardcode
const dbConnection = config.database.connectionString;
const cacheProvider = config.cache.provider;
```
## Testing Pattern

```typescript
describe('MyCommand', () => {
  let command: MyCommand;
  let mockServices: Record<string, any>;
  let mockCommands: Record<string, any>;
  
  beforeEach(() => {
    mockServices = {
      'IDatabaseService': createMockService({ query: vi.fn() })
    };
    mockCommands = {
      'other/SomeCommand': createMockCommand({ execute: vi.fn() })
    };
    
    command = new MyCommand(undefined, undefined, mockServices, mockCommands);
  });
});
```

## Key Benefits for AI Development

1. **Granular Focus**: Each command has single responsibility
2. **Explicit Contracts**: Input/Output types make requirements clear  
3. **Dependency Clarity**: Metadata declares exactly what's needed
4. **Composition Over Inheritance**: Build complex workflows from simple parts
5. **Testability**: Mock dependencies easily via constructor injection
6. **Discoverability**: Registry patterns enable automatic discovery

## Common Patterns

### Error Handling
```typescript
export class MyCommandError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, any>) {
    super(message, code, details);
  }
}
```

### Validation
```typescript
validate(): boolean {
  if (!this.input) return false;
  if (!this.input.requiredField) return false;
  return true;
}
```

### Dependency Validation
```typescript
constructor(/* ... */) {
  this.service = services?.['IServiceName'];
  if (!this.service) {
    throw new MyCommandError('IServiceName required', 'MISSING_SERVICE');
  }
}
```

## Architecture Principles

- **Self-Describing**: Metadata makes components discoverable
- **Loosely Coupled**: Components interact only through contracts
- **Composable**: Commands can orchestrate other commands  
- **Portable**: Commands work across different systems
- **Cacheable**: Registry enables lazy loading and reuse
- **AI-Friendly**: Granular, focused responsibilities