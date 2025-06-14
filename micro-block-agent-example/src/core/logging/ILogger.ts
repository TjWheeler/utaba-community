/**
 * Base logging interface
 */
export interface ILogger {
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error | unknown, context?: Record<string, any>): void;
  debug(message: string, context?: Record<string, any>): void;
}

/**
 * Enhanced logger interface for command execution tracking
 */
export interface ICommandLogger extends ILogger {
  commandStart(commandName: string, input?: Record<string, any>): () => void;
  commandSuccess(commandName: string, metrics?: Record<string, any>): void;
  commandFailure(commandName: string, error: Error | unknown, metrics?: Record<string, any>): void;
}