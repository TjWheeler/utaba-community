import { OutputCommand, CommandMetadata, ErrorBase } from '@/core/interfaces/BaseCommand';
import { ICommandLogger } from '@/core/logging/ILogger';
import { ConsoleLogger } from '@/core/logging/ConsoleLogger';

export interface FetchWebPageInput {
  /** The URL to fetch */
  url: string;
  
  /** Optional request headers */
  headers?: Record<string, string>;
  
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  
  /** User agent string (default: reasonable browser UA) */
  userAgent?: string;
}

export interface FetchWebPageOutput {
  /** The HTML content of the page */
  html: string;
  
  /** The final URL after any redirects */
  url: string;
  
  /** HTTP status code */
  statusCode: number;
  
  /** Response headers */
  headers: Record<string, string>;
  
  /** When the page was fetched */
  fetchedAt: Date;
  
  /** Content length in bytes */
  contentLength: number;
  
  /** Content type from response headers */
  contentType?: string;
}

export class FetchWebPageError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
  url?: string;
  statusCode?: number;
}

export class FetchWebPageCommand implements OutputCommand<FetchWebPageInput, FetchWebPageOutput, FetchWebPageError> {
  public input?: FetchWebPageInput;
  private errorHandler?: (error: FetchWebPageError) => void;
  private logger: ICommandLogger;

  static readonly metadata: CommandMetadata = {
    name: 'FetchWebPageCommand',
    description: 'Fetches HTML content from a web URL with error handling and redirect support',
    category: 'web',
    inputType: 'FetchWebPageInput',
    outputType: 'FetchWebPageOutput',
    errorType: 'FetchWebPageError',
    version: '1.0.0',
    contractVersion: '1.0',
    timeout: 30000, // 30 seconds
    dataFlow: {
      inputs: ['url', 'headers?', 'timeout?', 'userAgent?'],
      outputs: ['html', 'url', 'statusCode', 'headers', 'fetchedAt', 'contentLength', 'contentType?'],
      sideEffects: ['http-request']
    },
    performance: {
      expectedDuration: '500ms-5s',
      scaling: 'Depends on target server response time and content size'
    },
    dependencies: {
      external: ['fetch'] // Built-in fetch API
    }
  };

  private static readonly DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB limit

  constructor(
    input?: FetchWebPageInput,
    logger?: ICommandLogger
  ) {
    this.input = input;
    this.logger = logger || new ConsoleLogger('FetchWebPage');
  }

  setInput(input: FetchWebPageInput): void {
    this.input = input;
  }

  onError(handler: (error: FetchWebPageError) => void): void {
    this.errorHandler = handler;
  }

  validate(): boolean {
    if (!this.input) return false;
    if (!this.input.url || typeof this.input.url !== 'string') return false;
    
    // Basic URL validation
    try {
      new URL(this.input.url);
      return true;
    } catch {
      return false;
    }
  }

  getMetadata(): CommandMetadata {
    return FetchWebPageCommand.metadata;
  }

  async execute(): Promise<FetchWebPageOutput> {
    if (!this.input) {
      const error = new FetchWebPageError("No input provided. Call setInput() before execute()", 'MISSING_INPUT');
      this.logger.error('FetchWebPage validation failed', error);
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    if (!this.validate()) {
      const error = new FetchWebPageError("Invalid input provided - URL is required and must be valid", 'VALIDATION_ERROR');
      error.url = this.input.url;
      
      this.logger.error('FetchWebPage input validation failed', {
        url: this.input.url,
        error
      });
      
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    const startTime = Date.now();
    const { url, headers = {}, timeout = FetchWebPageCommand.DEFAULT_TIMEOUT, userAgent } = this.input;

    try {
      this.logger.info('Starting web page fetch', {
        url,
        timeout,
        userAgent: userAgent || 'default'
      });

      // Prepare request headers
      const requestHeaders: Record<string, string> = {
        'User-Agent': userAgent || FetchWebPageCommand.DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...headers
      };

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: requestHeaders,
          signal: controller.signal,
          redirect: 'follow' // Follow redirects automatically
        });

        clearTimeout(timeoutId);

        // Check if response is successful
        if (!response.ok) {
          const error = new FetchWebPageError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR'
          );
          error.url = url;
          error.statusCode = response.status;
          throw error;
        }

        // Check content type
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          this.logger.warn('Content type may not be HTML', {
            url,
            contentType,
            status: response.status
          });
        }

        // Check content length
        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = contentLengthHeader ? parseInt(contentLengthHeader) : 0;
        
        if (contentLength > FetchWebPageCommand.MAX_CONTENT_SIZE) {
          throw new FetchWebPageError(
            `Content too large: ${contentLength} bytes (max: ${FetchWebPageCommand.MAX_CONTENT_SIZE})`,
            'CONTENT_TOO_LARGE'
          );
        }

        // Get the HTML content
        const html = await response.text();

        // Double-check actual content size
        if (html.length > FetchWebPageCommand.MAX_CONTENT_SIZE) {
          throw new FetchWebPageError(
            `Content too large: ${html.length} characters (max: ${FetchWebPageCommand.MAX_CONTENT_SIZE})`,
            'CONTENT_TOO_LARGE'
          );
        }

        // Prepare response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key.toLowerCase()] = value;
        });

        const result: FetchWebPageOutput = {
          html,
          url: response.url, // This will be the final URL after redirects
          statusCode: response.status,
          headers: responseHeaders,
          fetchedAt: new Date(),
          contentLength: html.length,
          contentType
        };

        const processingTime = Date.now() - startTime;

        this.logger.info('Web page fetch completed successfully', {
          originalUrl: url,
          finalUrl: result.url,
          statusCode: result.statusCode,
          contentLength: result.contentLength,
          contentType: result.contentType,
          processingTime: `${processingTime}ms`
        });

        return result;

      } finally {
        clearTimeout(timeoutId);
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof FetchWebPageError) {
        if (this.errorHandler) this.errorHandler(error);
        throw error;
      }

      // Handle different types of fetch errors
      let errorCode = 'FETCH_ERROR';
      let errorMessage = 'Failed to fetch web page';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorCode = 'TIMEOUT';
          errorMessage = `Request timed out after ${timeout}ms`;
        } else if (error.message.includes('fetch')) {
          errorCode = 'NETWORK_ERROR';
          errorMessage = `Network error: ${error.message}`;
        } else {
          errorMessage = `Fetch error: ${error.message}`;
        }
      }

      const fetchError = new FetchWebPageError(errorMessage, errorCode);
      fetchError.url = url;

      this.logger.error('FetchWebPage unexpected error', {
        url,
        processingTime: `${processingTime}ms`,
        underlyingError: error instanceof Error ? error.message : String(error),
        errorCode
      });

      if (this.errorHandler) this.errorHandler(fetchError);
      throw fetchError;
    }
  }
}