/**
 * Base interfaces for Micro-Block Architecture commands
 * All commands in the system implement one of these interfaces
 */

/**
 * Metadata for command discovery and documentation
 */
export interface CommandMetadata {
  name: string;
  description: string;
  category: string;
  inputType: string;
  outputType: string;
  errorType: string;
  version: string;                 // Command implementation version
  contractVersion: string;         // Input/output contract version
  permissions?: string[];
  timeout?: number;
  dataFlow?: {
    inputs: string[];
    outputs: string[];
    sideEffects: string[];
  };
  performance?: {
    expectedDuration: string;
    scaling: string;
  };
  /**
   * Dependencies required by this command
   */
  dependencies?: {
     /** Service dependencies (e.g., IQueueService, IDatabaseService) */
    services?: string[];
    /** Command dependencies (e.g., CreateJobCommand) */
    commands?: string[];
    /** External package dependencies (e.g., openai) */
    external?: string[];
  };
}

/**
 * Base interface that all commands must implement.
 * Provides metadata access and basic validation.
 */
export interface BaseCommand {
  /** Validate that the command can execute with current configuration */
  validate(): boolean;
  execute(): Promise<any>;
  /** Get the static metadata for this command */
  getMetadata(): CommandMetadata;
}

/**
 * Commands that return data (queries, transformations, calculations)
 */
export interface OutputCommand<TInput, TOutput, TError extends Error> extends BaseCommand {
  input?: TInput;
  setInput(input: TInput): void;
  execute(): Promise<TOutput>;
  validate(): boolean;
  onError(handler: (error: TError) => void): void;
  getMetadata(): CommandMetadata;
}

/**
 * Commands that perform side effects without returning data
 */
export interface InputOnlyCommand<TInput, TError extends Error> extends BaseCommand {
  input?: TInput;
  setInput(input: TInput): void;
  execute(): Promise<void>;
  validate(): boolean;
  onError(handler: (error: TError) => void): void;
  getMetadata(): CommandMetadata;
}

/**
 * Base error class for all command errors
 */
export class ErrorBase extends Error {
  public readonly timestamp: Date;
  public readonly code?: string;
  public readonly details?: Record<string, any>;

  constructor(message: string, code?: string, details?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.code = code;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown
    Object.setPrototypeOf(this, new.target.prototype);
    
    // Captures stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}