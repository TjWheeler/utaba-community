# Micro-block Architecture Pattern Guide

## Overview

The Micro-block Architecture is a command-based pattern designed for AI-collaborative development. It breaks complex systems into small, discrete, contract-driven building blocks that can be discovered, composed, and substituted automatically.

This architecture pattern is implementation-agnostic and can be applied across different technologies and frameworks.

## Core Principles

1. **Contract-First Design**: All commands implement explicit Input, Output, and Error contracts
2. **Self-Describing Components**: Commands include rich metadata for AI understanding
3. **Loose Coupling**: Commands are isolated and interact only through well-defined interfaces
4. **Dynamic Discovery**: Registry enables automatic command discovery and composition
5. **Substitutability**: Commands with identical contracts are interchangeable
6. **Hierarchical Composition**: Commands can include other commands, enabling complex workflow orchestration
7. **Self-Contained Modularity**: Each command is a portable, independent unit
8. **Service Abstraction**: Commands depend on service interfaces, not concrete implementations
9. **Lazy Loading**: Commands are loaded on-demand, services are registered at startup

## Architecture Components

### Core Concepts

The micro-block architecture consists of these fundamental components:

- **Commands**: Self-contained units of business logic with explicit contracts
- **Service Interfaces**: Abstract definitions of capabilities (data access, external APIs, etc.)
- **Service Implementations**: Concrete implementations of service interfaces
- **Command Registry**: Discovery mechanism for finding and composing commands (with lazy loading)
- **Service Registry**: Lightweight registry for managing service instances
- **Application Initializer**: Startup orchestration for registration and configuration

### Structural Organization

```
{project-root}/
  core/
    interfaces/          # Base command interfaces and error types
    logging/            # Logging abstractions and implementations
    registry/           # Service and command registries
  services/
    interfaces/         # Service interface definitions
    implementations/    # Concrete service implementations
  commands/
    {category}/         # Commands organized by functional area
```

## Command Structure & Metadata

### Command Metadata

Commands must include comprehensive metadata for discovery and dependency injection:

```typescript
interface CommandMetadata {
  name: string;                    // Unique command identifier
  description: string;             // Human-readable description
  category: string;                // Grouping category
  inputType: string;               // Input contract type name
  outputType: string;              // Output contract type name
  errorType: string;               // Error contract type name
  version: string;                 // Command implementation version
  contractVersion: string;         // Input/output contract version
  permissions?: string[];          // Required permissions
  timeout?: number;                // Execution timeout in milliseconds
  dataFlow?: {
    inputs: string[];              // Input data fields
    outputs: string[];             // Output data fields
    sideEffects: string[];         // Side effects performed
  };
  performance?: {
    expectedDuration: string;      // Expected execution time
    scaling: string;               // Performance scaling characteristics
  };
  dependencies?: {
    /** Service dependencies (e.g., IQueueService, IDatabaseService) */
    services?: string[];
    /** Command dependencies (e.g., CreateProcessingJobCommand) */
    commands?: string[];
    /** External package dependencies (e.g., ytdl-core, openai) */
    external?: string[];
  }; 
}
```

### Contract Patterns

#### Input/Output Contracts
```typescript
// Input Contract
interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

// Output Contract  
interface CreateUserOutput {
  userId: string;
  email: string;
  createdAt: Date;
}

// Error Contract
class CreateUserError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, any>) {
    super(message, code, details);
    this.name = "CreateUserError";
  }
}
```

#### Self-Contained Command Structure
Each command file contains all related types and implementations:

```typescript
// Command Implementation
export class CreateUserCommand implements OutputCommand<CreateUserInput, CreateUserOutput, CreateUserError> {
  static readonly metadata: CommandMetadata = {
    name: 'CreateUserCommand',
    description: 'Creates a new user account in the system',
    category: 'user',
    inputType: 'CreateUserInput',
    outputType: 'CreateUserOutput', 
    errorType: 'CreateUserError',
    version: '1.0.0',
    contractVersion: '1.0',
    dependencies: ['IDatabaseService'],
    dataFlow: {
      inputs: ['email', 'password', 'name'],
      outputs: ['userId', 'email', 'createdAt'],
      sideEffects: ['database-write']
    }
  };

  constructor(input?: CreateUserInput, logger?: ICommandLogger, services?: Record<string, any>) {
    // Implementation with dependency injection
  }

  async execute(): Promise<CreateUserOutput> {
    // Business logic implementation
  }

  getMetadata(): CommandMetadata {
    return CreateUserCommand.metadata;
  }
}
```

## Service Architecture

### Service Interface Pattern

All services must have corresponding interfaces:

```typescript
// Service Interface
export interface ICacheService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSeconds?: number): void;
  delete(key: string): boolean;
  flush(): void;
}
```

### Service Metadata

Services include comprehensive metadata for AI-driven discovery and selection:

```typescript
interface ServiceMetadata {
  name: string;                    // Unique service identifier
  displayName: string;             // Human-readable name
  description: string;             // Detailed description of capabilities
  contract: string;                // Interface name this service implements
  implementation: string;          // Implementation class name
  version: string;                 // Service version
  contractVersion: string;         // Interface version compatibility
  features: string[];              // Key features and capabilities
  limitations: string[];           // Known limitations or constraints
  requirements: string[];          // External dependencies required
  recommendations: string[];       // Optimal use cases
  configurationSchema?: object;    // Optional configuration schema
}
```

### Multiple Implementations Pattern

Multiple services can implement the same contract with different metadata:

```typescript
// In-Memory Cache Service
class MemoryCacheService implements ICacheService {
  static readonly metadata: ServiceMetadata = {
    name: 'MemoryCacheService',
    contract: 'ICacheService',
    features: ['In-memory storage', 'TTL expiration'],
    limitations: ['Memory-bound storage', 'Single-process scope'],
    recommendations: ['Ideal for MVP', 'Development environments']
  };
}

// Redis Cache Service
class RedisCacheService implements ICacheService {
  static readonly metadata: ServiceMetadata = {
    name: 'RedisCacheService', 
    contract: 'ICacheService',
    features: ['Distributed caching', 'Data persistence'],
    limitations: ['Requires Redis server', 'Network latency'],
    recommendations: ['Production environments', 'Multi-instance applications']
  };
}
```

## Discovery & Registry Patterns

### Command Registry

The CommandRegistry provides lazy loading and sophisticated command discovery:

```typescript
interface CommandRegistry {
  // Lazy loading with automatic service injection
  get<T extends BaseCommand>(commandClass: CommandConstructor, input?: any, logger?: ICommandLogger): Promise<T>;
  createCommand<T extends BaseCommand>(commandClass: CommandConstructor, input?: any, logger?: ICommandLogger): T;
  
  // Service integration
  setServiceResolver(resolver: (serviceName: string) => any): void;
  
  // Explicit registration (optional - commands can be lazy loaded)
  registerCommand(commandClass: CommandConstructor): void;
  
  // Discovery by metadata
  findByCategory(category: string): CommandMetadata[];
  findByDependency(serviceName: string): CommandMetadata[];
  findByDataFlow(inputType?: string, outputType?: string): CommandMetadata[];
  
  // Contract-based discovery
  findNextCommands(producingCommandName: string): CommandMetadata[];
  findPreviousCommands(consumingCommandName: string): CommandMetadata[];
  findAlternativeCommands(commandName: string): CommandMetadata[];
  
  // Workflow composition
  findWorkflowChains(startContract: string, endContract: string): WorkflowChain[];
  getContractAnalysis(): ContractAnalysis;
}
```

### Service Registry

The ServiceRegistry manages service instances with a singleton pattern:

```typescript
interface ServiceRegistry {
  // Singleton access
  static getInstance(): ServiceRegistry;
  
  // Service management
  register<T>(serviceName: string, factory: () => T): void;
  get<T>(serviceName: string): T;
  
  // Special accessors
  getCommandRegistry(): CommandRegistry;
  getLogger<T>(serviceName: string): ILogger;
}
```

## Dependency Injection Patterns

### Service Registry Pattern

The ServiceRegistry provides a lightweight approach to service management:

```typescript
export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null;
  private serviceFactories = new Map<string, any>();
  private services = new Map<string, any>();
  
  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      const instance = new ServiceRegistry();
      instance.initialize();
      ServiceRegistry.instance = instance;
    }
    return ServiceRegistry.instance;
  }
  
  register<T>(serviceName: string, factory: any): void {
    this.serviceFactories.set(serviceName, factory);
  }
  
  get<T>(serviceName: string): T {
    // Return cached instance if exists
    if (this.services.has(serviceName)) {
      return this.services.get(serviceName);
    }
    
    // Create and cache service
    const factory = this.serviceFactories.get(serviceName);
    const service = factory(this);
    this.services.set(serviceName, service);
    return service;
  }
}
```

### Service Dependencies

Commands MUST specify dependencies using service interface names:

```typescript
// ✅ CORRECT - Interface references
static readonly metadata: CommandMetadata = {
  dependencies: [
    'IDatabaseService',    // Database operations
    'ICacheService',       // Caching layer
    'IEmailService'        // Email notifications
  ]
};

// ❌ INCORRECT - Concrete class references
static readonly metadata: CommandMetadata = {
  dependencies: [
    'DatabaseService',     // Don't reference concrete classes
    'SQL Server',         // Don't use generic descriptions
    'Redis Cache'         // Don't reference specific technologies
  ]
};
```

### Dependency Resolution Pattern

Commands receive services through constructor injection:

```typescript
export class LoginUserCommand implements OutputCommand<LoginUserInput, LoginUserResult, LoginUserError> {
  private databaseService: IDatabaseService;

  constructor(
    public input?: LoginUserInput,
    private logger?: ICommandLogger,
    private services?: Record<string, any>
  ) {
    this.databaseService = services?.['IDatabaseService'] as IDatabaseService;
    if (!this.databaseService) {
      throw new LoginUserError('IDatabaseService not provided', 'MISSING_SERVICE');
    }
  }
}
```

## Application Initialization Patterns


### Service Registration Pattern

```typescript
private initialize(): void {
  // Register service factories
  this.register('IDatabaseService', () => {
    const { DatabaseService } = require('@/services/DatabaseService');
    return new DatabaseService(this.config.database);
  });
  
  this.register('ICacheService', () => {
    const { MemoryCacheService } = require('@/services/MemoryCacheService');
    return MemoryCacheService.getInstance(this.config.cache);
  });
  
  this.register('IEmailService', () => {
    const { EmailService } = require('@/services/EmailService');
    return new EmailService(this.config.email);
  });
  
  // Register CommandRegistry with service resolver
  this.register('CommandRegistry', () => {
    const { CommandRegistry } = require('@/core/registry/CommandRegistry');
    const registry = CommandRegistry.createInstance();
    
    registry.setServiceResolver((serviceName: string) => {
      return this.get(serviceName);
    });
    
    return registry;
  });
}
```

### Command Registration Pattern

Commands are lazy-loaded on demand by the CommandRegistry:

```typescript
export class CommandRegistry {
  private serviceResolver?: (serviceName: string) => any;
  
  setServiceResolver(resolver: (serviceName: string) => any): void {
    this.serviceResolver = resolver;
  }
  
  async get<T extends BaseCommand>(commandClass: CommandConstructor, input?: any, logger?: ICommandLogger): Promise<T> {
    const metadata = commandClass.metadata;
    
    // Check if command is already registered, if not lazy load it
    if (!this.commands.has(metadata.name)) {
      const registration = await this.resolveCommand(metadata);
      this.commands.set(metadata.name, registration);
    }
    
    // Create command with automatic service injection
    return this.createCommand<T>(commandClass, input, logger);
  }
  
  private async resolveCommand<T extends BaseCommand>(metadata: CommandMetadata): Promise<CommandRegistration> {
    // Lazy load the command module based on metadata
    const module = await import(`../../commands/${metadata.category}/${metadata.name}`);
    const commandConstructor = Object.values(module)[0] as CommandConstructor;
    
    return {
      constructor: commandConstructor,
      metadata,
      registeredAt: new Date()
    };
  }
  
  private resolveServiceDependencies(dependencies: string[]): Record<string, any> {
    const services: Record<string, any> = {};
    
    for (const dependencyName of dependencies) {
      services[dependencyName] = this.serviceResolver(dependencyName);
    }
    
    return services;
  }
}
```

## Workflow Composition Patterns

### Sequential Workflows

```typescript
export class VideoProcessingWorkflow {
  async execute(input: VideoInput): Promise<VideoOutput> {
    const serviceRegistry = ServiceRegistry.getInstance();
    const commandRegistry = serviceRegistry.getCommandRegistry();
    
    // Step 1: Extract metadata (lazy loaded via get method)
    const metadataCommand = await commandRegistry.get<ExtractMetadataCommand>(
      ExtractMetadataCommand, 
      { videoUrl: input.url }
    );
    const metadata = await metadataCommand.execute();
    
    // Step 2: Process audio (using output from step 1)
    const audioCommand = await commandRegistry.get<ProcessAudioCommand>(
      ProcessAudioCommand,
      { videoId: metadata.videoId }
    );
    const audio = await audioCommand.execute();
    
    // Step 3: Generate summary (using outputs from steps 1 & 2)
    const summaryCommand = await commandRegistry.get<GenerateSummaryCommand>(
      GenerateSummaryCommand,
      { 
        title: metadata.title,
        transcript: audio.transcript 
      }
    );
    const summary = await summaryCommand.execute();
    
    return { summary: summary.text, metadata };
  }
}
```

### Parallel Workflows

```typescript
export class ParallelProcessingWorkflow {
  async execute(input: ProcessingInput): Promise<ProcessingOutput> {
    // Execute multiple commands in parallel
    const [validation, enrichment, analysis] = await Promise.all([
      this.validateData(input.data),
      this.enrichData(input.data),
      this.analyzeData(input.data)
    ]);
    
    // Combine results
    return this.combineResults(validation, enrichment, analysis);
  }
}
```

## Testing Patterns

### Command Testing

```typescript
describe('CreateUserCommand', () => {
  beforeEach(() => {
    // Setup test services
    const mockDbService = new MockDatabaseService();
    serviceContainer.register('IDatabaseService', mockDbService);
  });

  it('should create user with valid input', async () => {
    const command = new CreateUserCommand({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    });

    const result = await command.execute();
    expect(result.userId).toBeDefined();
  });
});
```

### Service Testing

```typescript
describe('CacheService', () => {
  it('should implement ICacheService contract', () => {
    const service = new CacheService();
    expect(service).toImplementInterface('ICacheService');
  });

  it('should provide correct metadata', () => {
    const metadata = CacheService.metadata;
    expect(metadata.contract).toBe('ICacheService');
    expect(metadata.features).toContain('TTL expiration');
  });
});
```

## Error Handling Patterns

### Error Contract Design

```typescript
export class CreateUserError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, any>) {
    super(message, code, details);
    Object.setPrototypeOf(this, CreateUserError.prototype);
    this.name = "CreateUserError";
  }
}
```

### Error Recovery Patterns

```typescript
export class ResilientWorkflow {
  async execute(input: WorkflowInput): Promise<WorkflowOutput> {
    try {
      return await this.primaryExecution(input);
    } catch (error) {
      // Try alternative command
      const alternativeCommands = registry.findAlternativeCommands('PrimaryCommand');
      for (const altCommand of alternativeCommands) {
        try {
          return await this.executeAlternative(altCommand, input);
        } catch (altError) {
          continue; // Try next alternative
        }
      }
      throw error; // All alternatives failed
    }
  }
}
```

## AI-Driven Selection Patterns

### Service Selection

```typescript
function selectOptimalCacheService(useCase: string): string {
  const serviceRegistry = ServiceRegistry.getInstance();
  
  // Find all cache implementations
  const cacheServices = serviceRegistry.findServicesByContract('ICacheService');
  
  // Find services recommended for specific use case
  const recommendedServices = serviceRegistry.recommendServiceForUseCase(useCase);
  
  // AI can analyze metadata to choose optimal implementation
  return recommendedServices.length > 0 ? recommendedServices[0].name : cacheServices[0].name;
}
```

### Command Selection

```typescript
function findOptimalWorkflow(startType: string, endType: string): CommandMetadata[] {
  const commandRegistry = CommandRegistry.getInstance();
  
  // Find possible workflow chains
  const workflows = commandRegistry.findWorkflowChains(startType, endType);
  
  // Select optimal based on performance, cost, etc.
  return workflows
    .sort((a, b) => a.complexity - b.complexity)
    .map(w => w.commands)[0];
}
```

## Best Practices

### Command Design

1. **Static Metadata**: Always provide static metadata accessible before instantiation
2. **Self-Contained**: Keep all command-related types in the same file
3. **Interface Dependencies**: Use service interfaces, not concrete implementations
4. **Contract Naming**: Use domain-focused names, not platform-specific ones
5. **Error Handling**: Extend ErrorBase for all command-specific errors

### Service Design

1. **Rich Metadata**: Provide comprehensive metadata for AI-driven selection decisions
2. **Clear Recommendations**: Specify optimal use cases and environments
3. **Honest Limitations**: Document constraints and boundaries clearly
4. **Version Compatibility**: Track both service and contract versions
5. **Feature Clarity**: List specific capabilities, not vague descriptions

### Registry Integration

1. **Auto-Registration**: Let ApplicationInitializer handle command registration
2. **Category Organization**: Group commands by functional categories
3. **Dependency Analysis**: Use registry to validate service availability
4. **Workflow Discovery**: Leverage registry for automatic workflow construction

### Testing Strategy

1. **Contract Testing**: Verify commands implement their declared interfaces
2. **Metadata Validation**: Test that metadata accurately describes capabilities
3. **Dependency Mocking**: Use service container for clean dependency injection
4. **Workflow Testing**: Test command composition and chain execution
5. **Error Scenario Testing**: Verify error contracts and recovery mechanisms

## Implementation Guidelines

The micro-block architecture pattern can be implemented in various technologies and frameworks. The key is maintaining the core principles regardless of implementation details:

- **Contract-first design** with explicit interfaces
- **Rich metadata** for AI-driven discovery and composition
- **Dependency injection** using service interfaces
- **Registry-based discovery** for commands and services
- **Self-contained modularity** with clear boundaries

This architecture creates a robust foundation for AI-collaborative development where components are discoverable, composable, and properly abstracted through well-defined interfaces. The comprehensive metadata system enables AI to make informed decisions about component selection and composition, while maintaining clear dependency tracking and automatic registration.