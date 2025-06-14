import { OutputCommand, CommandMetadata, ErrorBase } from '@/core/interfaces/BaseCommand';
import { ICommandLogger } from '@/core/logging/ILogger';
import { ConsoleLogger } from '@/core/logging/ConsoleLogger';
import { SummarizeContentOutput } from '@/commands/ai/SummarizeContentCommand';

export interface SaveSummaryInput {
  /** The URL that was summarized */
  url: string;
  
  /** The summary data to save */
  summary: SummarizeContentOutput;
  
  /** Additional metadata to store */
  metadata?: Record<string, any>;
  
  /** Storage type (for future extensibility) */
  storageType?: 'memory' | 'file' | 'database';
}

export interface SaveSummaryOutput {
  /** Unique identifier for the saved summary */
  id: string;
  
  /** URL to access the saved summary */
  shareUrl: string;
  
  /** When the summary was saved */
  savedAt: Date;
  
  /** Storage location/path */
  storagePath: string;
  
  /** Size of saved data in bytes */
  dataSize: number;
}

export class SaveSummaryError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
  url?: string;
  storageType?: string;
}

/**
 * Simple in-memory storage for the demo.
 * In a real application, this would integrate with a database or file system.
 */
class MemoryStorage {
  private static instance: MemoryStorage;
  private storage = new Map<string, any>();

  static getInstance(): MemoryStorage {
    if (!MemoryStorage.instance) {
      MemoryStorage.instance = new MemoryStorage();
    }
    return MemoryStorage.instance;
  }

  save(id: string, data: any): void {
    this.storage.set(id, {
      ...data,
      savedAt: new Date()
    });
  }

  get(id: string): any {
    return this.storage.get(id);
  }

  has(id: string): boolean {
    return this.storage.has(id);
  }

  list(): string[] {
    return Array.from(this.storage.keys());
  }

  size(): number {
    return this.storage.size;
  }
}

export class SaveSummaryCommand implements OutputCommand<SaveSummaryInput, SaveSummaryOutput, SaveSummaryError> {
  public input?: SaveSummaryInput;
  private errorHandler?: (error: SaveSummaryError) => void;
  private logger: ICommandLogger;
  private storage: MemoryStorage;

  static readonly metadata: CommandMetadata = {
    name: 'SaveSummaryCommand',
    description: 'Saves a summary with a unique ID and provides a shareable URL',
    category: 'storage',
    inputType: 'SaveSummaryInput',
    outputType: 'SaveSummaryOutput',
    errorType: 'SaveSummaryError',
    version: '1.0.0',
    contractVersion: '1.0',
    timeout: 5000, // 5 seconds
    dataFlow: {
      inputs: ['url', 'summary', 'metadata?', 'storageType?'],
      outputs: ['id', 'shareUrl', 'savedAt', 'storagePath', 'dataSize'],
      sideEffects: ['storage-write']
    },
    performance: {
      expectedDuration: '10ms-100ms',
      scaling: 'O(1) for memory storage'
    },
    dependencies: {
      external: []
    }
  };

  constructor(
    input?: SaveSummaryInput,
    logger?: ICommandLogger
  ) {
    this.input = input;
    this.logger = logger || new ConsoleLogger('SaveSummary');
    this.storage = MemoryStorage.getInstance();
  }

  setInput(input: SaveSummaryInput): void {
    this.input = input;
  }

  onError(handler: (error: SaveSummaryError) => void): void {
    this.errorHandler = handler;
  }

  validate(): boolean {
    if (!this.input) return false;
    if (!this.input.url || typeof this.input.url !== 'string') return false;
    if (!this.input.summary || typeof this.input.summary !== 'object') return false;
    
    // Validate that summary has required fields
    const summary = this.input.summary;
    if (!summary.summary || !summary.keyPoints || !summary.intent || !summary.sentiment) {
      return false;
    }
    
    return true;
  }

  getMetadata(): CommandMetadata {
    return SaveSummaryCommand.metadata;
  }

  async execute(): Promise<SaveSummaryOutput> {
    if (!this.input) {
      const error = new SaveSummaryError("No input provided. Call setInput() before execute()", 'MISSING_INPUT');
      this.logger.error('SaveSummary validation failed', error);
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    if (!this.validate()) {
      const error = new SaveSummaryError("Invalid input provided - URL and summary are required", 'VALIDATION_ERROR');
      error.url = this.input.url;
      
      this.logger.error('SaveSummary input validation failed', {
        hasUrl: !!this.input.url,
        hasSummary: !!this.input.summary,
        error
      });
      
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    const startTime = Date.now();
    const { url, summary, metadata = {}, storageType = 'memory' } = this.input;

    try {
      this.logger.info('Starting summary save', {
        url,
        storageType,
        summaryLength: summary.summary.length,
        keyPointsCount: summary.keyPoints.length
      });

      // Generate unique ID
      const id = this.generateId(url);
      
      // Prepare data to save
      const dataToSave = {
        id,
        url,
        summary,
        metadata: {
          ...metadata,
          savedWith: 'SaveSummaryCommand',
          version: SaveSummaryCommand.metadata.version
        },
        savedAt: new Date()
      };

      // Calculate data size
      const dataSize = JSON.stringify(dataToSave).length;

      // Save based on storage type
      let storagePath: string;
      let shareUrl: string;
      
      switch (storageType) {
        case 'memory':
          this.storage.save(id, dataToSave);
          storagePath = `memory://summaries/${id}`;
          shareUrl = `/api/summaries/${id}`;
          break;
          
        case 'file':
          // For future implementation
          throw new SaveSummaryError('File storage not yet implemented', 'STORAGE_NOT_IMPLEMENTED');
          
        case 'database':
          // For future implementation
          throw new SaveSummaryError('Database storage not yet implemented', 'STORAGE_NOT_IMPLEMENTED');
          
        default:
          throw new SaveSummaryError(`Unknown storage type: ${storageType}`, 'INVALID_STORAGE_TYPE');
      }

      const result: SaveSummaryOutput = {
        id,
        shareUrl,
        savedAt: dataToSave.savedAt,
        storagePath,
        dataSize
      };

      const processingTime = Date.now() - startTime;

      this.logger.info('Summary save completed successfully', {
        id,
        url,
        shareUrl,
        storagePath,
        dataSize,
        storageType,
        processingTime: `${processingTime}ms`
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof SaveSummaryError) {
        if (this.errorHandler) this.errorHandler(error);
        throw error;
      }

      const saveError = new SaveSummaryError(
        `Summary save failed: ${error instanceof Error ? error.message : String(error)}`,
        'SAVE_ERROR'
      );
      saveError.url = url;
      saveError.storageType = storageType;

      this.logger.error('SaveSummary unexpected error', {
        url,
        storageType,
        processingTime: `${processingTime}ms`,
        underlyingError: error instanceof Error ? error.message : String(error)
      });

      if (this.errorHandler) this.errorHandler(saveError);
      throw saveError;
    }
  }

  private generateId(url: string): string {
    // Simple ID generation based on URL and timestamp
    const urlHash = this.simpleHash(url);
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    
    return `${urlHash}-${timestamp}-${random}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Static method to retrieve a saved summary by ID
   * This would typically be used by an API endpoint
   */
  static getSummaryById(id: string): any {
    const storage = MemoryStorage.getInstance();
    return storage.get(id);
  }

  /**
   * Static method to list all saved summaries
   * This would typically be used by an API endpoint
   */
  static listSummaries(): string[] {
    const storage = MemoryStorage.getInstance();
    return storage.list();
  }

  /**
   * Static method to check if a summary exists
   */
  static hasSummary(id: string): boolean {
    const storage = MemoryStorage.getInstance();
    return storage.has(id);
  }

  /**
   * Static method to get storage statistics
   */
  static getStorageStats(): { count: number; totalSize: number } {
    const storage = MemoryStorage.getInstance();
    const ids = storage.list();
    let totalSize = 0;
    
    for (const id of ids) {
      const data = storage.get(id);
      if (data) {
        totalSize += JSON.stringify(data).length;
      }
    }
    
    return {
      count: ids.length,
      totalSize
    };
  }
}