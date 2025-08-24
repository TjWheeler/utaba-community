// ===== DEPENDENCY INJECTION: Base Command Interfaces =====
// NOTE TO AI AGENTS: These interfaces (CommandMetadata, OutputCommand, ErrorBase) are shared
// and should be moved to a common types file or adapted to use existing types in the target system

/**
 * Configuration for AI model providers
 */
interface AIModelConfig {
  /** Unique identifier for this model configuration */
  modelName: string;
  
  /** API endpoint URL for the model */
  url: string;
  
  /** API key for authentication */
  apiKey: string;
  
  /** Model version/deployment name (e.g., 'gpt-4', 'gpt-3.5-turbo') */
  modelVersion: string;
  
  /** Provider type */
  provider?: 'openai' | 'azure-openai' | 'custom';
  
  /** Optional additional configuration */
  options?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

// NOTE: OpenAI service dependency is injected here
// This would normally be imported from 'openai' package
// For portability, assuming OpenAI types are available in target environment
declare const OpenAI: any;
declare const AzureOpenAI: any;

/**
 * Simple OpenAI service for the demo project.
 * Handles both OpenAI and Azure OpenAI configurations.
 */
class OpenAIService {
  private client: any; // OpenAI | AzureOpenAI
  private config: AIModelConfig;

  constructor(config: AIModelConfig) {
    this.config = config;
    this.client = this.createClient(config);
  }

  private createClient(config: AIModelConfig): any {
    if (config.provider === 'azure-openai') {
      // Use Azure OpenAI
      return new AzureOpenAI({
        endpoint: config.url,
        apiKey: config.apiKey,
        deployment: config.modelName, // Azure uses deployment name
        apiVersion: config.modelVersion // Fixed API version for Azure
      });
    } else {
      // Use regular OpenAI or custom endpoint
      return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.url
      });
    }
  }

  /**
   * Generate a chat completion using the configured model
   */
  async generateCompletion(
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: 'json_object' | 'text' };
    }
  ): Promise<{
    content: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    model?: string;
  }> {
    const requestOptions: any = {
      messages,
      temperature: options?.temperature ?? this.config.options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? this.config.options?.maxTokens ?? 2000,
    };

    // Add response format if specified
    if (options?.responseFormat) {
      requestOptions.response_format = options.responseFormat;
    }

    // Only add model parameter for non-Azure providers
    if (this.config.provider !== 'azure-openai') {
      requestOptions.model = this.config.modelVersion;
    }

    const response = await this.client.chat.completions.create(requestOptions);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content returned from AI API');
    }

    return {
      content,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens || 0,
        completionTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0
      } : undefined,
      model: response.model
    };
  }

  /**
   * Get the current model configuration
   */
  getConfig(): AIModelConfig {
    return { ...this.config };
  }
}

// ===== MAIN COMMAND IMPLEMENTATION =====

// NOTE TO FUTURE SELF: SummarizeContentInput and SummarizeContentOutput interfaces are shared
// and should be moved to a common types file or adapted to use existing content analysis types

export interface SummarizeContentInput {
  /** The text content to summarize */
  text: string;
  
  /** Original URL for context */
  url: string;
  
  /** Page title for context */
  title?: string;
  
  /** AI model configuration */
  modelConfig: AIModelConfig;
  
  /** Maximum length for summary (optional) */
  maxLength?: number;
  
  /** Summary style preference (optional) */
  style?: 'bullet' | 'paragraph' | 'detailed';
  
  /** Optional custom prompt for summarization */
  customPrompt?: string;
}

// NOTE TO FUTURE SELF: SummarizeContentOutput interface is shared
// and should be moved to a common types file or adapted to use existing content analysis output types

export interface SummarizeContentOutput {
  /** Main summary of the content */
  summary: string;
  
  /** Key points extracted from the content */
  keyPoints: string[];
  
  /** Primary intent/purpose of the content */
  intent: string;
  
  /** Overall sentiment analysis */
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  
  /** Content metadata */
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
  
  /** API usage metrics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class SummarizeContentError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
  url?: string;
  aiModel?: string;
}

export class SummarizeContentCommand implements OutputCommand<SummarizeContentInput, SummarizeContentOutput, SummarizeContentError> {
  public input?: SummarizeContentInput;
  private errorHandler?: (error: SummarizeContentError) => void;
  private logger: ICommandLogger;
  private openaiService?: OpenAIService;

  static readonly metadata: CommandMetadata = {
    name: 'SummarizeContentCommand',
    description: 'Uses AI to generate summary, key points, intent analysis, and sentiment analysis from web content',
    category: 'ai',
    inputType: 'SummarizeContentInput',
    outputType: 'SummarizeContentOutput',
    errorType: 'SummarizeContentError',
    version: '1.0.0',
    contractVersion: '1.0',
    permissions: ['ai:summarize'],
    timeout: 120000, // 2 minutes for AI processing
    dataFlow: {
      inputs: ['text', 'url', 'title?', 'modelConfig', 'maxLength?', 'style?', 'customPrompt?'],
      outputs: ['summary', 'keyPoints', 'intent', 'sentiment', 'metadata', 'usage?'],
      sideEffects: ['openai-api-call']
    },
    performance: {
      expectedDuration: '5s-30s',
      scaling: 'Linear with content length and AI model complexity'
    },
    dependencies: {
      external: ['openai']
    }
  };

  private static readonly MAX_CONTENT_LENGTH = 100000; // ~100k chars to stay within token limits
  
  private static readonly DEFAULT_SYSTEM_PROMPT = `
Analyze this web content and provide a comprehensive summary in JSON format.

Requirements:
1. Create a concise but informative summary (2-4 paragraphs based on content length)
2. Extract 5-8 key points as bullet points
3. Determine the primary intent or purpose of the content
4. Analyze the overall sentiment

Respond with valid JSON in this exact format:
{
  "summary": "Your comprehensive summary here...",
  "keyPoints": [
    "Key point 1",
    "Key point 2",
    "Key point 3"
  ],
  "intent": "What is the main purpose/goal of this content?",
  "sentiment": "positive|negative|neutral|mixed"
}
  `.trim();

  constructor(
    input?: SummarizeContentInput,
    logger?: ICommandLogger
  ) {
    this.input = input;
    this.logger = logger || new ConsoleLogger('SummarizeContent');
  }

  setInput(input: SummarizeContentInput): void {
    this.input = input;
  }

  onError(handler: (error: SummarizeContentError) => void): void {
    this.errorHandler = handler;
  }

  validate(): boolean {
    if (!this.input) return false;
    if (!this.input.text || !this.input.url) return false;
    if (!this.input.modelConfig) return false;
    if (!this.input.modelConfig.url || !this.input.modelConfig.apiKey) return false;
    if (!this.input.modelConfig.modelName || !this.input.modelConfig.modelVersion) return false;
    
    // Provider validation - if provided, must be valid
    if (this.input.modelConfig.provider && 
        !['openai', 'azure-openai', 'custom'].includes(this.input.modelConfig.provider)) {
      return false;
    }
    
    return true;
  }

  getMetadata(): CommandMetadata {
    return SummarizeContentCommand.metadata;
  }

  async execute(): Promise<SummarizeContentOutput> {
    if (!this.input) {
      const error = new SummarizeContentError("No input provided. Call setInput() before execute()", 'MISSING_INPUT');
      this.logger.error('SummarizeContent validation failed', error);
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    if (!this.validate()) {
      const error = new SummarizeContentError("Invalid input provided", 'VALIDATION_ERROR');
      error.url = this.input.url;
      
      this.logger.error('SummarizeContent input validation failed', {
        hasText: !!this.input.text,
        hasModelConfig: !!this.input.modelConfig,
        error
      });
      
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    const startTime = Date.now();
    const { text, url, title, modelConfig } = this.input;

    try {
      // Initialize the OpenAI service with the provided model config
      this.logger.info('Initializing AI service', { 
        provider: modelConfig.provider,
        url: modelConfig.url,
        modelName: modelConfig.modelName,
        modelVersion: modelConfig.modelVersion
      });
      
      this.openaiService = new OpenAIService(modelConfig);

      this.logger.info('Starting AI summarization', {
        url,
        title: title || 'No Title',
        contentLength: text.length,
        provider: modelConfig.provider,
        modelName: modelConfig.modelName
      });

      // Generate AI summary
      const aiAnalysis = await this.generateAISummary(text, url, title);

      // Create summary result
      const result: SummarizeContentOutput = {
        summary: aiAnalysis.summary,
        keyPoints: aiAnalysis.keyPoints,
        intent: aiAnalysis.intent,
        sentiment: aiAnalysis.sentiment,
        
        metadata: {
          originalUrl: url,
          title,
          contentLength: text.length,
          summaryLength: aiAnalysis.summary.length,
          keyPointsCount: aiAnalysis.keyPoints.length,
          aiModel: `${modelConfig.provider || 'unknown'}:${modelConfig.modelName}`,
          actualModelUsed: aiAnalysis.actualModelUsed,
          generatedAt: new Date()
        },
        
        usage: aiAnalysis.usage
      };

      const processingTime = Date.now() - startTime;

      this.logger.info('AI summarization completed successfully', {
        url,
        provider: modelConfig.provider,
        modelName: modelConfig.modelName,
        actualModelUsed: result.metadata.actualModelUsed,
        summaryLength: result.summary.length,
        keyPointsCount: result.keyPoints.length,
        sentiment: result.sentiment,
        usage: result.usage,
        processingTime: `${processingTime}ms`
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof SummarizeContentError) {
        if (this.errorHandler) this.errorHandler(error);
        throw error;
      }

      const summaryError = new SummarizeContentError(
        `AI summarization failed: ${error instanceof Error ? error.message : String(error)}`,
        'AI_PROCESSING_ERROR'
      );
      summaryError.url = url;
      summaryError.aiModel = `${modelConfig.provider || 'unknown'}:${modelConfig.modelName}`;

      this.logger.error('SummarizeContent unexpected error', {
        processingTime: `${processingTime}ms`,
        url,
        provider: modelConfig.provider,
        modelName: modelConfig.modelName,
        underlyingError: error instanceof Error ? error.message : String(error)
      });

      if (this.errorHandler) this.errorHandler(summaryError);
      throw summaryError;
    }
  }

  private truncateContent(content: string): string {
    if (content.length <= SummarizeContentCommand.MAX_CONTENT_LENGTH) {
      return content;
    }

    this.logger.warn('Truncating content for AI processing', {
      originalLength: content.length,
      truncatedLength: SummarizeContentCommand.MAX_CONTENT_LENGTH
    });

    return content.substring(0, SummarizeContentCommand.MAX_CONTENT_LENGTH) + '... [truncated]';
  }

  private async generateAISummary(
    text: string,
    url: string,
    title?: string
  ): Promise<{
    summary: string;
    keyPoints: string[];
    intent: string;
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    actualModelUsed?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    if (!this.openaiService) {
      throw new SummarizeContentError('OpenAI service not initialized', 'SERVICE_NOT_INITIALIZED');
    }

    const systemPrompt = this.input?.customPrompt || SummarizeContentCommand.DEFAULT_SYSTEM_PROMPT;
    
    // Truncate content if too long before sending to AI
    const processedContent = this.truncateContent(text);
    
    const userPrompt = `URL: ${url}
${title ? `Title: ${title}` : ''}

Content:
${processedContent}`.trim();

    try {
      const response = await this.openaiService.generateCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        temperature: this.input?.modelConfig.options?.temperature,
        maxTokens: this.input?.modelConfig.options?.maxTokens,
        responseFormat: { type: 'json_object' }
      });

      // Parse JSON response
      let analysis;
      try {
        analysis = JSON.parse(response.content);
      } catch (parseError) {
        this.logger.error('Failed to parse AI response as JSON', {
          content: response.content.substring(0, 500), // Log first 500 chars for debugging
          parseError: parseError instanceof Error ? parseError.message : String(parseError)
        });
        throw new Error(`Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      // Validate response structure
      if (!analysis.summary || !analysis.keyPoints || !analysis.intent || !analysis.sentiment) {
        throw new Error(`AI response missing required fields. Got: ${Object.keys(analysis).join(', ')}`);
      }

      if (!Array.isArray(analysis.keyPoints)) {
        throw new Error('keyPoints must be an array');
      }

      if (!['positive', 'negative', 'neutral', 'mixed'].includes(analysis.sentiment)) {
        this.logger.warn('Invalid sentiment returned, using neutral fallback', { 
          received: analysis.sentiment 
        });
        analysis.sentiment = 'neutral'; // Default fallback
      }

      return {
        summary: String(analysis.summary),
        keyPoints: analysis.keyPoints.map((point: any) => String(point)),
        intent: String(analysis.intent),
        sentiment: analysis.sentiment,
        actualModelUsed: response.model,
        usage: response.usage
      };

    } catch (error) {
      throw new SummarizeContentError(
        `AI API call failed: ${error instanceof Error ? error.message : String(error)}`,
        'AI_API_ERROR',
        { 
          provider: this.input?.modelConfig.provider,
          modelName: this.input?.modelConfig.modelName,
          modelVersion: this.input?.modelConfig.modelVersion,
          error 
        }
      );
    }
  }
}