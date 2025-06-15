import { OutputCommand, CommandMetadata, ErrorBase } from '@/core/interfaces/BaseCommand';
import { ICommandLogger } from '@/core/logging/ILogger';
import { ConsoleLogger } from '@/core/logging/ConsoleLogger';
import * as cheerio from 'cheerio';

export interface ExtractTextContentInput {
  /** The HTML content to extract text from */
  html: string;
  
  /** The URL for context and metadata */
  url: string;
  
  /** Whether to preserve some formatting (default: false) */
  preserveFormatting?: boolean;
  
  /** Whether to extract metadata like title, description (default: true) */
  extractMetadata?: boolean;
  
  /** Custom selectors to exclude from text extraction */
  excludeSelectors?: string[];
}

export interface ExtractTextContentOutput {
  /** The extracted text content */
  text: string;
  
  /** Page title */
  title: string;
  
  /** Word count of extracted text */
  wordCount: number;
  
  /** Character count of extracted text */
  characterCount: number;
  
  /** Metadata extracted from the page */
  metadata: {
    /** Meta description */
    description?: string;
    
    /** Meta keywords */
    keywords?: string[];
    
    /** Author information */
    author?: string;
    
    /** Publication date */
    publishDate?: string;
    
    /** Language detected from HTML */
    language?: string;
    
    /** Open Graph data */
    openGraph?: {
      title?: string;
      description?: string;
      image?: string;
      type?: string;
    };
  };
  
  /** Processing metadata */
  extractedAt: Date;
  originalUrl: string;
}

export class ExtractTextContentError extends ErrorBase {
  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
  url?: string;
}

export class ExtractTextContentCommand implements OutputCommand<ExtractTextContentInput, ExtractTextContentOutput, ExtractTextContentError> {
  public input?: ExtractTextContentInput;
  private errorHandler?: (error: ExtractTextContentError) => void;
  private logger: ICommandLogger;

  static readonly metadata: CommandMetadata = {
    name: 'ExtractTextContentCommand',
    description: 'Extracts readable text content from HTML with metadata extraction and content cleaning',
    category: 'web',
    inputType: 'ExtractTextContentInput',
    outputType: 'ExtractTextContentOutput',
    errorType: 'ExtractTextContentError',
    version: '1.0.0',
    contractVersion: '1.0',
    timeout: 10000, // 10 seconds
    dataFlow: {
      inputs: ['html', 'url', 'preserveFormatting?', 'extractMetadata?', 'excludeSelectors?'],
      outputs: ['text', 'title', 'wordCount', 'characterCount', 'metadata', 'extractedAt', 'originalUrl'],
      sideEffects: []
    },
    performance: {
      expectedDuration: '100ms-1s',
      scaling: 'Linear with HTML content size'
    },
    dependencies: {
      external: ['cheerio']
    }
  };

  // Default selectors to exclude from text extraction
  private static readonly DEFAULT_EXCLUDE_SELECTORS = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    '.advertisement',
    '.ad',
    '.sidebar',
    '.menu',
    '.navigation',
    '.comments',
    '.comment',
    '.social-share',
    '.related-posts',
    '.popup',
    '.modal',
    'noscript'
  ];

  constructor(
    input?: ExtractTextContentInput,
    logger?: ICommandLogger
  ) {
    this.input = input;
    this.logger = logger || new ConsoleLogger('ExtractTextContent');
  }

  setInput(input: ExtractTextContentInput): void {
    this.input = input;
  }

  onError(handler: (error: ExtractTextContentError) => void): void {
    this.errorHandler = handler;
  }

  validate(): boolean {
    if (!this.input) return false;
    if (!this.input.html || typeof this.input.html !== 'string') return false;
    if (!this.input.url || typeof this.input.url !== 'string') return false;
    return true;
  }

  getMetadata(): CommandMetadata {
    return ExtractTextContentCommand.metadata;
  }

  async execute(): Promise<ExtractTextContentOutput> {
    if (!this.input) {
      const error = new ExtractTextContentError("No input provided. Call setInput() before execute()", 'MISSING_INPUT');
      this.logger.error('ExtractTextContent validation failed', error);
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    if (!this.validate()) {
      const error = new ExtractTextContentError("Invalid input provided - HTML and URL are required", 'VALIDATION_ERROR');
      error.url = this.input.url;
      
      this.logger.error('ExtractTextContent input validation failed', {
        hasHtml: !!this.input.html,
        hasUrl: !!this.input.url,
        error
      });
      
      if (this.errorHandler) this.errorHandler(error);
      throw error;
    }

    const startTime = Date.now();
    const { 
      html, 
      url, 
      preserveFormatting = false, 
      extractMetadata = true, 
      excludeSelectors = [] 
    } = this.input;

    try {
      this.logger.info('Starting text extraction', {
        url,
        htmlLength: html.length,
        preserveFormatting,
        extractMetadata
      });

      // Load HTML into Cheerio
      const $ = cheerio.load(html);

      // Remove unwanted elements
      const selectorsToRemove = [...ExtractTextContentCommand.DEFAULT_EXCLUDE_SELECTORS, ...excludeSelectors];
      selectorsToRemove.forEach(selector => {
        $(selector).remove();
      });

      // Extract metadata first (before content extraction that might modify DOM)
      const metadata = extractMetadata ? this.extractMetadata($) : {};

      // Extract title
      let title = $('title').first().text().trim();
      if (!title) {
        title = $('h1').first().text().trim() || 'Untitled';
      }

      // Extract main content
      let text = this.extractMainContent($, preserveFormatting);

      // Clean up the text
      text = this.cleanText(text);

      // Calculate metrics
      const wordCount = this.countWords(text);
      const characterCount = text.length;

      const result: ExtractTextContentOutput = {
        text,
        title,
        wordCount,
        characterCount,
        metadata,
        extractedAt: new Date(),
        originalUrl: url
      };

      const processingTime = Date.now() - startTime;

      this.logger.info('Text extraction completed successfully', {
        url,
        title,
        wordCount,
        characterCount,
        hasDescription: !!metadata.description,
        processingTime: `${processingTime}ms`
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof ExtractTextContentError) {
        if (this.errorHandler) this.errorHandler(error);
        throw error;
      }

      const extractError = new ExtractTextContentError(
        `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        'EXTRACTION_ERROR'
      );
      extractError.url = url;

      this.logger.error('ExtractTextContent unexpected error', {
        url,
        processingTime: `${processingTime}ms`,
        underlyingError: error instanceof Error ? error.message : String(error)
      });

      if (this.errorHandler) this.errorHandler(extractError);
      throw extractError;
    }
  }

  private extractMainContent($: cheerio.CheerioAPI, preserveFormatting: boolean): string {
    // Try to find main content area
    let contentElement = $('main').first();
    
    if (contentElement.length === 0) {
      contentElement = $('article').first();
    }
    
    if (contentElement.length === 0) {
      contentElement = $('.content, .main-content, .post-content, .entry-content').first();
    }
    
    if (contentElement.length === 0) {
      // Fallback to body, but try to exclude known non-content areas
      contentElement = $('body');
    }

    if (preserveFormatting) {
      // Preserve some formatting by adding line breaks
      contentElement.find('p, div, br, li').each((_, elem) => {
        $(elem).append('\n');
      });
      contentElement.find('h1, h2, h3, h4, h5, h6').each((_, elem) => {
        $(elem).prepend('\n').append('\n');
      });
    }

    return contentElement.text();
  }

  private extractMetadata($: cheerio.CheerioAPI): ExtractTextContentOutput['metadata'] {
    const metadata: ExtractTextContentOutput['metadata'] = {};

    // Meta description
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
    if (description) {
      metadata.description = description.trim();
    }

    // Meta keywords
    const keywords = $('meta[name="keywords"]').attr('content');
    if (keywords) {
      metadata.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
    }

    // Author
    const author = $('meta[name="author"]').attr('content') || 
                  $('meta[property="article:author"]').attr('content');
    if (author) {
      metadata.author = author.trim();
    }

    // Publication date
    const publishDate = $('meta[property="article:published_time"]').attr('content') ||
                       $('meta[name="published"]').attr('content') ||
                       $('time[datetime]').attr('datetime');
    if (publishDate) {
      metadata.publishDate = publishDate.trim();
    }

    // Language
    const language = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content');
    if (language) {
      metadata.language = language.trim();
    }

    // Open Graph data
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDescription = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogType = $('meta[property="og:type"]').attr('content');

    if (ogTitle || ogDescription || ogImage || ogType) {
      metadata.openGraph = {};
      if (ogTitle) metadata.openGraph.title = ogTitle.trim();
      if (ogDescription) metadata.openGraph.description = ogDescription.trim();
      if (ogImage) metadata.openGraph.image = ogImage.trim();
      if (ogType) metadata.openGraph.type = ogType.trim();
    }

    return metadata;
  }

  private cleanText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove excessive line breaks
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Trim
      .trim();
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
}