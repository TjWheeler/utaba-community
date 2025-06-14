import { OutputCommand, CommandMetadata, ErrorBase } from '@/core/interfaces/BaseCommand';
import { ICommandLogger } from '@/core/logging/ILogger';
import { ConsoleLogger } from '@/core/logging/ConsoleLogger';
import { SimpleCommandRegistry } from '@/core/registry/CommandRegistry';
import { FetchWebPageCommand } from '@/commands/web/FetchWebPageCommand';
import { ExtractTextContentCommand } from '@/commands/web/ExtractTextContentCommand';
import { SummarizeContentCommand } from '@/commands/ai/SummarizeContentCommand';
import { SaveSummaryCommand } from '@/commands/storage/SaveSummaryCommand';
import { AIModelConfig } from '@/services/OpenAIService';

export interface ProcessUrlInput {
  /** The URL to process */
  url: string;
  
  /** AI model configuration for summarization */
  modelConfig: AIModelConfig;
  
  /** Options for content extraction */
  extractionOptions?: {
    preserveFormatting?: boolean;
    excludeSelectors?: string[];
  };
  
  /** Options for summarization */
  summaryOptions?: {
    maxLength?: number;
    style?: 'bullet' | 'paragraph' | 'detailed';
    customPrompt?: string;
  };
  
  /** Whether to save the summary (default: true) */
  saveSummary?: boolean;
  
  /** Additional metadata to include */
  metadata?: Record<string, any>;
}

export interface ProcessUrlOutput {
  /** The final summary result */
  summary: {
    id?: string;
    shareUrl?: string;
    summary: string;
    keyPoints: string[];
    intent: string;
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    metadata: {
      originalUrl: string;
      title?: string;
      contentLength: number;
      summaryLength: number;
      keyPointsCount: number;
      aiModel: string;
      actualModelUsed?: string;
      generatedAt: Date;
    };
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
  
  /** Processing pipeline results */
  pipeline: {
    fetch: {
      success: boolean;
      statusCode?: number;
      contentLength?: number;
      contentType?: string;
      duration: number;
    };
    extraction: {
      success: boolean;
      wordCount?: number;
      characterCount?: number;
      duration: number;
    };
    summarization: {
      success: boolean;
      aiModel?: string;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
      duration: number;
    };
    storage?: {
      success: boolean;
      storageType?: string;
      dataSize?: number;
      duration: number;
    };
  };
  
  /** Total processing time */
  totalDuration: number;
  
  /** When processing completed */
  processedAt: Date;
}

export class ProcessUrlError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
  url?: string;
  stage?: 'fetch' | 'extract' | 'summarize' | 'save';
}

export class ProcessUrlCommand implements OutputCommand<ProcessUrlInput, ProcessUrlOutput, ProcessUrlError> {
  public input?: ProcessUrlInput;
  private errorHandler?: (error: ProcessUrlError) => void;
  private logger: ICommandLogger;
  private commandRegistry: SimpleCommandRegistry;

  static readonly metadata: CommandMetadata = {
    name: 'ProcessUrlCommand',
    description: 'Complete workflow to fetch, extract, summarize, and optionally save web content',
    category: 'workflow',
    inputType: 'ProcessUrlInput',
    outputType: 'ProcessUrlOutput',
    errorType: 'ProcessUrlError',
    version: '1.0.0',
    contractVersion: '1.0',
    timeout: 180000, // 3 minutes for the entire workflow
    dataFlow: {
      inputs: ['url', 'modelConfig', 'extractionOptions?', 'summaryOptions?', 'saveSummary?', 'metadata?'],
      outputs: ['summary', 'pipeline', 'totalDuration', 'processedAt'],
      sideEffects: ['http-request', 'openai-api-call', 'storage-write?']
    },
    performance: {
      expectedDuration: '10s-60s',
      scaling: 'Depends on content size and AI model performance'
    },
    dependencies: {
      external: ['openai', 'cheerio'],
      /* These are the commands that this workflow commands orchestrates.  These are typically injected into the command via the constructor via a 'commands' array. */
      commands: [
        'web/FetchWebPageCommand',
        'web/ExtractTextContentCommand',
        'ai/SummarizeContentCommand',
        'storage/SaveSummaryCommand'
      ],
      /* A list of services that this command depends on.  These are typically injected into the command via the constructor. */
      services: [
        'HttpService',
        'OpenAIService',
        'InMemoryStorage',
        'ConsoleLogger',
        'SimpleCommandRegistry'
      ]
    }
  };
  /* 
    In this example the constuctor parameters are minimal.  In a real-world application, you would typically inject dependencies such as services or other commands.
    For example:
        private services?: Record<string, any>,
        private commands?: Record<string, any>
    You can then use a more advance Service and Command Registry to resolve these dependencies dynamically and automatically inject the dependancies based on the metadata.
    Make sure you give instructions to you AI to keep the metatadata up to date and to use the rules you define for your commands.
  */
  constructor(
    input?: ProcessUrlInput,
    logger?: ICommandLogger
  ) {
    this.input = input;
    this.logger = logger || new ConsoleLogger('ProcessUrl');
    this.commandRegistry = SimpleCommandRegistry.getInstance();
  }

  setInput(input: ProcessUrlInput): void {
    this.input = input;
  }

  onError(handler: (error: ProcessUrlError) => void): void {
    this.errorHandler = handler;
  }

  validate(): boolean {
    if (!this.input) return false;
    if (!this.input.url || typeof this.input.url !== 'string') return false;
    if (!this.input.modelConfig || typeof this.input.modelConfig !== 'object') return false;
    
    // Validate URL format
    try {
      new URL(this.input.url);
    } catch {
      return false;
    }
    
    // Validate model config
    const { modelConfig } = this.input;
    if (!modelConfig.url || !modelConfig.apiKey || !modelConfig.modelName || !modelConfig.modelVersion) {
      return false;
    }
    
    return true;
  }

  getMetadata(): CommandMetadata {
    return ProcessUrlCommand.metadata;
  }

  async execute(): Promise<ProcessUrlOutput> {
    if (!this.input) {
      const error = new ProcessUrlError("No input provided. Call setInput() before execute()", 'MISSING_INPUT');
      this.logger.error('ProcessUrl validation failed', error);
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    if (!this.validate()) {
      const error = new ProcessUrlError("Invalid input provided", 'VALIDATION_ERROR');
      error.url = this.input.url;
      
      this.logger.error('ProcessUrl input validation failed', {
        hasUrl: !!this.input.url,
        hasModelConfig: !!this.input.modelConfig,
        error
      });
      
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    const overallStartTime = Date.now();
    const { 
      url, 
      modelConfig, 
      extractionOptions = {}, 
      summaryOptions = {}, 
      saveSummary = true,
      metadata = {}
    } = this.input;

    this.logger.info('Starting URL processing workflow', {
      url,
      modelConfig: {
        provider: modelConfig.provider,
        modelName: modelConfig.modelName
      },
      saveSummary
    });

    // Initialize pipeline tracking
    const pipeline: ProcessUrlOutput['pipeline'] = {
      fetch: { success: false, duration: 0 },
      extraction: { success: false, duration: 0 },
      summarization: { success: false, duration: 0 }
    };

    try {
      // Step 1: Fetch web page
      this.logger.info('Step 1: Fetching web page', { url });
      const fetchStartTime = Date.now();
      
      const fetchCommand = await this.commandRegistry.get<FetchWebPageCommand>(
        FetchWebPageCommand,
        { url },
        this.logger
      );
      
      const fetchResult = await fetchCommand.execute();
      pipeline.fetch.duration = Date.now() - fetchStartTime;
      pipeline.fetch.success = true;
      pipeline.fetch.statusCode = fetchResult.statusCode;
      pipeline.fetch.contentLength = fetchResult.contentLength;
      pipeline.fetch.contentType = fetchResult.contentType;

      this.logger.info('Step 1 completed: Web page fetched', {
        statusCode: fetchResult.statusCode,
        contentLength: fetchResult.contentLength,
        duration: pipeline.fetch.duration
      });

      // Step 2: Extract text content
      this.logger.info('Step 2: Extracting text content');
      const extractStartTime = Date.now();
      
      const extractCommand = await this.commandRegistry.get<ExtractTextContentCommand>(
        ExtractTextContentCommand,
        {
          html: fetchResult.html,
          url: fetchResult.url,
          ...extractionOptions
        },
        this.logger
      );
      
      const extractResult = await extractCommand.execute();
      pipeline.extraction.duration = Date.now() - extractStartTime;
      pipeline.extraction.success = true;
      pipeline.extraction.wordCount = extractResult.wordCount;
      pipeline.extraction.characterCount = extractResult.characterCount;

      this.logger.info('Step 2 completed: Text content extracted', {
        title: extractResult.title,
        wordCount: extractResult.wordCount,
        characterCount: extractResult.characterCount,
        duration: pipeline.extraction.duration
      });

      // Step 3: Summarize content
      this.logger.info('Step 3: Generating AI summary');
      const summarizeStartTime = Date.now();
      
      const summarizeCommand = await this.commandRegistry.get<SummarizeContentCommand>(
        SummarizeContentCommand,
        {
          text: extractResult.text,
          url: extractResult.originalUrl,
          title: extractResult.title,
          modelConfig,
          ...summaryOptions
        },
        this.logger
      );
      
      const summaryResult = await summarizeCommand.execute();
      pipeline.summarization.duration = Date.now() - summarizeStartTime;
      pipeline.summarization.success = true;
      pipeline.summarization.aiModel = summaryResult.metadata.aiModel;
      pipeline.summarization.usage = summaryResult.usage;

      this.logger.info('Step 3 completed: AI summary generated', {
        summaryLength: summaryResult.summary.length,
        keyPointsCount: summaryResult.keyPoints.length,
        sentiment: summaryResult.sentiment,
        usage: summaryResult.usage,
        duration: pipeline.summarization.duration
      });

      // Step 4: Save summary (optional)
      let saveResult: any = null;
      if (saveSummary) {
        this.logger.info('Step 4: Saving summary');
        const saveStartTime = Date.now();
        
        const saveCommand = await this.commandRegistry.get<SaveSummaryCommand>(
          SaveSummaryCommand,
          {
            url,
            summary: summaryResult,
            metadata
          },
          this.logger
        );
        
        saveResult = await saveCommand.execute();
        
        pipeline.storage = {
          success: true,
          storageType: 'memory',
          dataSize: saveResult.dataSize,
          duration: Date.now() - saveStartTime
        };

        this.logger.info('Step 4 completed: Summary saved', {
          id: saveResult.id,
          shareUrl: saveResult.shareUrl,
          dataSize: saveResult.dataSize,
          duration: pipeline.storage.duration
        });
      }

      // Compile final result
      const totalDuration = Date.now() - overallStartTime;
      const result: ProcessUrlOutput = {
        summary: {
          ...summaryResult,
          id: saveResult?.id,
          shareUrl: saveResult?.shareUrl
        },
        pipeline,
        totalDuration,
        processedAt: new Date()
      };

      this.logger.info('URL processing workflow completed successfully', {
        url,
        totalDuration,
        pipelineSteps: Object.keys(pipeline).filter(key => (pipeline as any)[key].success).length,
        summaryId: saveResult?.id
      });

      return result;

    } catch (error) {
      const totalDuration = Date.now() - overallStartTime;

      // Determine which stage failed
      let stage: ProcessUrlError['stage'] = 'fetch';
      if (pipeline.fetch.success && !pipeline.extraction.success) stage = 'extract';
      else if (pipeline.extraction.success && !pipeline.summarization.success) stage = 'summarize';
      else if (pipeline.summarization.success && saveSummary) stage = 'save';

      if (error instanceof ProcessUrlError) {
        error.stage = stage;
        if (this.errorHandler) this.errorHandler(error);
        throw error;
      }

      const processError = new ProcessUrlError(
        `URL processing failed at ${stage} stage: ${error instanceof Error ? error.message : String(error)}`,
        'WORKFLOW_ERROR'
      );
      processError.url = url;
      processError.stage = stage;

      this.logger.error('ProcessUrl workflow failed', {
        url,
        stage,
        totalDuration,
        pipeline,
        underlyingError: error instanceof Error ? error.message : String(error)
      });

      if (this.errorHandler) this.errorHandler(processError);
      throw processError;
    }
  }
}