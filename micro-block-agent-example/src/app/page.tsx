'use client';

import { useState } from 'react';
import { ProcessUrlOutput } from '@/commands/workflow/ProcessUrlCommand';
import { AIModelConfig } from '@/services/OpenAIService';

interface ProcessingState {
  loading: boolean;
  stage?: string;
  progress?: number;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [processing, setProcessing] = useState<ProcessingState>({ loading: false });
  const [result, setResult] = useState<ProcessUrlOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url || !apiKey) {
      setError('Please provide both URL and API key');
      return;
    }

    setProcessing({ loading: true, stage: 'Starting...', progress: 0 });
    setError(null);
    setResult(null);

    try {
      // Prepare model configuration
      const modelConfig: AIModelConfig = {
        modelName: 'gpt-3.5-turbo',
        url: 'https://api.openai.com/v1',
        apiKey,
        modelVersion: 'gpt-3.5-turbo',
        provider: 'openai',
        options: {
          temperature: 0.3,
          maxTokens: 2000
        }
      };

      setProcessing({ loading: true, stage: 'Fetching web page...', progress: 25 });

      const response = await fetch('/api/process-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          modelConfig,
          saveSummary: true
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Processing failed');
      }

      setProcessing({ loading: true, stage: 'Processing complete!', progress: 100 });
      setTimeout(() => {
        setProcessing({ loading: false });
        setResult(data.data);
      }, 500);

    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setProcessing({ loading: false });
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50';
      case 'negative': return 'text-red-600 bg-red-50';
      case 'mixed': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Web Page Summarizer powered by OpenAI
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Designed on the Micro-Block Pattern, written by <a href="https://utaba.au" target="_blank">Tim Wheeler (https://utaba.au)</a> and <a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank">Claude</a>. Enter any URL and get an AI-generated summary 
            with key points, intent analysis, and sentiment.
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                URL to Summarize
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={processing.loading}
                required
              />
            </div>

            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
                OpenAI API Key
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={processing.loading}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Your API key is only used for this request and is not stored.
              </p>
            </div>

            <button
              type="submit"
              disabled={processing.loading || !url || !apiKey}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing.loading ? 'Processing...' : 'Summarize URL'}
            </button>
          </form>
        </div>

        {/* Processing Status */}
        {processing.loading && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-gray-700">{processing.stage}</span>
            </div>
            {processing.progress !== undefined && (
              <div className="mt-4">
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${processing.progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Summary</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(result.summary.sentiment)}`}>
                  {result.summary.sentiment}
                </span>
              </div>
              
              <div className="prose max-w-none">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {result.summary.metadata.title || 'Untitled'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {result.summary.summary}
                </p>
                
                <h4 className="text-md font-semibold text-gray-800 mb-2">Key Points:</h4>
                <ul className="list-disc list-inside space-y-1 mb-4">
                  {result.summary.keyPoints.map((point, index) => (
                    <li key={index} className="text-gray-600">{point}</li>
                  ))}
                </ul>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-md font-semibold text-gray-800 mb-2">Intent:</h4>
                  <p className="text-gray-600">{result.summary.intent}</p>
                </div>
              </div>
            </div>

            {/* Pipeline Information */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Processing Pipeline</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800">Web Fetch</h4>
                  <p className="text-sm text-green-600">
                    {result.pipeline.fetch.statusCode} • {formatDuration(result.pipeline.fetch.duration)}
                  </p>
                  <p className="text-xs text-green-500">
                    {result.pipeline.fetch.contentLength?.toLocaleString()} chars
                  </p>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800">Text Extraction</h4>
                  <p className="text-sm text-blue-600">
                    {formatDuration(result.pipeline.extraction.duration)}
                  </p>
                  <p className="text-xs text-blue-500">
                    {result.pipeline.extraction.wordCount?.toLocaleString()} words
                  </p>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-800">AI Summary</h4>
                  <p className="text-sm text-purple-600">
                    {formatDuration(result.pipeline.summarization.duration)}
                  </p>
                  <p className="text-xs text-purple-500">
                    {result.pipeline.summarization.usage?.totalTokens?.toLocaleString()} tokens
                  </p>
                </div>

                {result.pipeline.storage && (
                  <div className="bg-orange-50 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-800">Storage</h4>
                    <p className="text-sm text-orange-600">
                      {formatDuration(result.pipeline.storage.duration)}
                    </p>
                    <p className="text-xs text-orange-500">
                      {result.pipeline.storage.dataSize} bytes
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500">
                  Total processing time: {formatDuration(result.totalDuration)}
                </p>
                {result.summary.shareUrl && (
                  <p className="text-xs text-gray-400 mt-1">
                    Share URL: <code className="bg-gray-100 px-1 rounded">{result.summary.shareUrl}</code>
                  </p>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Metadata</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Original URL:</span>
                  <p className="text-gray-600 truncate">{result.summary.metadata.originalUrl}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">AI Model:</span>
                  <p className="text-gray-600">{result.summary.metadata.aiModel}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Content Length:</span>
                  <p className="text-gray-600">{result.summary.metadata.contentLength.toLocaleString()} chars</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Generated:</span>
                  <p className="text-gray-600">{new Date(result.summary.metadata.generatedAt).toLocaleTimeString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Architecture Info */}
        <div className="mt-12 bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Micro-Block Architecture Demo</h3>
          <div className="prose max-w-none text-sm text-gray-600">
            <p>
              This application demonstrates the micro-block architecture pattern with four composable commands:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>FetchWebPageCommand</strong> - Downloads HTML content from the URL</li>
              <li><strong>ExtractTextContentCommand</strong> - Extracts readable text using Cheerio</li>
              <li><strong>SummarizeContentCommand</strong> - Generates AI summary using OpenAI</li>
              <li><strong>SaveSummaryCommand</strong> - Stores the result with a shareable ID</li>
            </ul>
            <p className="mt-2">
              Each command is self-contained, testable, and swappable. The <strong>ProcessUrlCommand</strong> orchestrates them into a complete workflow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
