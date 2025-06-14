import OpenAI, { AzureOpenAI } from 'openai';

/**
 * Configuration for AI model providers
 */
export interface AIModelConfig {
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

/**
 * Simple OpenAI service for the demo project.
 * Handles both OpenAI and Azure OpenAI configurations.
 */
export class OpenAIService {
  private client: OpenAI | AzureOpenAI;
  private config: AIModelConfig;

  constructor(config: AIModelConfig) {
    this.config = config;
    this.client = this.createClient(config);
  }

  private createClient(config: AIModelConfig): OpenAI | AzureOpenAI {
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