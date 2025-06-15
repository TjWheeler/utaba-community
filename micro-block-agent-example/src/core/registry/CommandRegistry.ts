import { BaseCommand, CommandMetadata } from '../interfaces/BaseCommand';
import { ILogger, ICommandLogger } from '../logging/ILogger';
import { ConsoleLogger } from '../logging/ConsoleLogger';

/**
 * Registration information for a command.
 * Links the command class with its metadata.
 */
export interface CommandRegistration {
  /** Constructor function for creating command instances */
  constructor: CommandConstructor;
  
  /** Static metadata from the command class */
  metadata: CommandMetadata;
  
  /** When this command was registered */
  registeredAt: Date;
}

/**
 * Constructor type for command classes.
 * All command classes must have a static metadata property.
 */
export interface CommandConstructor {
  new(input?: any, logger?: ICommandLogger): BaseCommand;
  new(...args: any[]): BaseCommand; // For backward compatibility
  readonly metadata: CommandMetadata;
}

/**
 * Simplified Command Registry for the URL Summarizer demo.
 * Manages command discovery and instantiation without service dependencies.
 */
export class SimpleCommandRegistry {
  private commands = new Map<string, CommandRegistration>();
  private static instance: SimpleCommandRegistry;
  private logger: ILogger;

  constructor() {
    this.logger = new ConsoleLogger('CommandRegistry');
  }

  public static getInstance(): SimpleCommandRegistry {
    if (!SimpleCommandRegistry.instance) {
      SimpleCommandRegistry.instance = new SimpleCommandRegistry();
    }
    return SimpleCommandRegistry.instance;
  }

  /**
   * Create a new isolated CommandRegistry instance
   */
  public static createInstance(): SimpleCommandRegistry {
    return new SimpleCommandRegistry();
  }

  /**
   * Get a command instance with automatic lazy loading
   */
  public async get<T extends BaseCommand>(
    commandClass: CommandConstructor, 
    input?: any, 
    logger?: ICommandLogger
  ): Promise<T> {
    const metadata = commandClass.metadata;
    
    if (!metadata || !metadata.name) {
      const error = `Command class must have static metadata with name property`;
      this.logger.error(error);
      throw new Error(error);
    }

    // Register the command if not already registered
    if (!this.commands.has(metadata.name)) {
      this.registerCommand(commandClass);
    }
    
    return this.createCommand<T>(commandClass, input, logger);
  }

  /**
   * Register a command class with the registry.
   * Command must have static metadata property.
   */
  public registerCommand(commandClass: CommandConstructor): void {
    const metadata = commandClass.metadata;
    
    if (!metadata || !metadata.name) {
      const error = `Command class must have static metadata with name property`;
      this.logger.error(error);
      throw new Error(error);
    }
    
    if (this.commands.has(metadata.name)) {
      this.logger.debug(`Command '${metadata.name}' already registered, skipping`);
      return;
    }
    
    this.commands.set(metadata.name, {
      constructor: commandClass,
      metadata,
      registeredAt: new Date()
    });
    
    this.logger.info(`Registered command: ${metadata.name}`, {
      category: metadata.category,
      inputType: metadata.inputType,
      outputType: metadata.outputType
    });
  }
  
  /**
   * Create a command instance
   */
  private createCommand<T extends BaseCommand>(
    commandClass: CommandConstructor, 
    input?: any, 
    logger?: ICommandLogger
  ): T {
    const metadata = commandClass.metadata;
    
    this.logger.debug(`Creating command '${metadata.name}'`, {
      commandName: metadata.name,
      hasInput: !!input
    });
    
    return new commandClass(input, logger) as T;
  }

  /**
   * Get command metadata without instantiating.
   * Useful for analysis and orchestration planning.
   */
  public getCommandMetadata(name: string): CommandMetadata {
    const registration = this.commands.get(name);
    
    if (!registration) {
      throw new Error(`Command '${name}' not found in registry`);
    }
    
    return registration.metadata;
  }
  
  /**
   * Find commands by category.
   * Useful for grouping related functionality.
   */
  public findByCategory(category: string): CommandMetadata[] {
    return Array.from(this.commands.values())
      .filter(reg => reg.metadata.category === category)
      .map(reg => reg.metadata);
  }
  
  /**
   * Get all registered commands.
   * Useful for system analysis and debugging.
   */
  public getAllCommands(): CommandMetadata[] {
    return Array.from(this.commands.values()).map(reg => reg.metadata);
  }
  
  /**
   * Check if a command is registered.
   */
  public hasCommand(name: string): boolean {
    return this.commands.has(name);
  }
  
  /**
   * Clear all registered commands.
   * Mainly useful for testing.
   */
  public clear(): void {
    this.commands.clear();
  }
}