import { NextRequest, NextResponse } from 'next/server';
import { SimpleCommandRegistry } from '@/core/registry/CommandRegistry';
import { ConsoleLogger } from '@/core/logging/ConsoleLogger';
import { ProcessUrlCommand } from '@/commands/workflow/ProcessUrlCommand';
import { AIModelConfig } from '@/services/OpenAIService';

export async function POST(request: NextRequest) {
  const logger = new ConsoleLogger('ProcessUrlAPI');

  try {
    const body = await request.json();
    const { url, modelConfig, extractionOptions, summaryOptions, saveSummary, metadata } = body;

    // Validate required fields
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    }

    if (!modelConfig || typeof modelConfig !== 'object') {
      return NextResponse.json(
        { error: 'Model configuration is required' },
        { status: 400 }
      );
    }

    // Validate model config structure
    const { apiKey, url: modelUrl, modelName, modelVersion, provider } = modelConfig;
    if (!apiKey || !modelUrl || !modelName || !modelVersion) {
      return NextResponse.json(
        { error: 'Model configuration must include apiKey, url, modelName, and modelVersion' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    logger.info('Processing URL request', {
      url,
      provider: provider || 'unknown',
      modelName,
      saveSummary: saveSummary !== false
    });

    // Get CommandRegistry and create command
    const commandRegistry = SimpleCommandRegistry.getInstance();
    const processCommand = await commandRegistry.get<ProcessUrlCommand>(
      ProcessUrlCommand,
      {
        url,
        modelConfig: modelConfig as AIModelConfig,
        extractionOptions,
        summaryOptions,
        saveSummary: saveSummary !== false, // Default to true
        metadata
      },
      logger
    );

    // Execute the workflow
    const result = await processCommand.execute();

    logger.info('URL processing completed successfully', {
      url,
      summaryId: result.summary.id,
      totalDuration: result.totalDuration,
      pipelineSteps: Object.keys(result.pipeline).filter(key => (result.pipeline as any)[key].success).length
    });

    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('URL processing failed', error);

    // Handle specific error types
    if (error.code === 'VALIDATION_ERROR') {
      return NextResponse.json(
        { error: 'Invalid input: ' + error.message },
        { status: 400 }
      );
    }

    if (error.code === 'HTTP_ERROR') {
      return NextResponse.json(
        { error: 'Failed to fetch the webpage: ' + error.message },
        { status: 400 }
      );
    }

    if (error.code === 'TIMEOUT') {
      return NextResponse.json(
        { error: 'Request timed out while fetching the webpage' },
        { status: 408 }
      );
    }

    if (error.code === 'AI_API_ERROR') {
      return NextResponse.json(
        { error: 'AI service error: ' + error.message },
        { status: 503 }
      );
    }

    if (error.code === 'CONTENT_TOO_LARGE') {
      return NextResponse.json(
        { error: 'The webpage content is too large to process' },
        { status: 413 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        error: 'Processing failed. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'URL Summarizer API',
    version: '1.0.0',
    endpoints: {
      'POST /api/process-url': 'Process and summarize a URL',
      'GET /api/summaries/:id': 'Retrieve a saved summary',
      'GET /api/summaries': 'List all summaries'
    },
    example: {
      url: 'https://example.com/article',
      modelConfig: {
        provider: 'openai',
        apiKey: 'your-api-key',
        url: 'https://api.openai.com/v1',
        modelName: 'gpt-3.5-turbo',
        modelVersion: 'gpt-3.5-turbo'
      }
    }
  });
}