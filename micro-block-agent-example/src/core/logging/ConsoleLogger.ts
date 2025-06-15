import { ILogger, ICommandLogger } from './ILogger';

/**
 * Basic console logger implementation
 */
export class ConsoleLogger implements ICommandLogger {
  private readonly context: string;

  constructor(context: string = 'App') {
    this.context = context;
  }

  info(message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] INFO: ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  warn(message: string, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [${this.context}] WARN: ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  error(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${this.context}] ERROR: ${message}`);
    if (error) {
      console.error('Error details:', error);
    }
    if (context) {
      console.error('Context:', JSON.stringify(context, null, 2));
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] [${this.context}] DEBUG: ${message}`, context ? JSON.stringify(context, null, 2) : '');
    }
  }

  commandStart(commandName: string, input?: Record<string, any>): () => void {
    const startTime = Date.now();
    this.info(`Command started: ${commandName}`, { input });
    
    return () => {
      const duration = Date.now() - startTime;
      this.debug(`Command timer stopped: ${commandName}`, { duration });
    };
  }

  commandSuccess(commandName: string, metrics?: Record<string, any>): void {
    this.info(`Command succeeded: ${commandName}`, metrics);
  }

  commandFailure(commandName: string, error: Error | unknown, metrics?: Record<string, any>): void {
    this.error(`Command failed: ${commandName}`, error, metrics);
  }
}