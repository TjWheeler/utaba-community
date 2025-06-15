# Command Index

## Overview

This document provides a comprehensive index of all commands in the Micro-Block Agent Example, organized by category. The system contains **5 commands** across **4 categories**, all following micro-block architecture patterns.

## Commands by Category

### 1. AI Commands (1 command)

#### SummarizeContentCommand
- **File**: `src/commands/ai/SummarizeContentCommand.ts`
- **Type**: `OutputCommand<SummarizeContentInput, SummarizeContentOutput, SummarizeContentError>`
- **Purpose**: Uses AI to generate summary, key points, intent analysis, and sentiment analysis from web content
- **Input**: `{ text: string, url: string, title?: string, modelConfig: AIModelConfig, maxLength?: number, style?: string, customPrompt?: string }`
- **Output**: `{ summary: string, keyPoints: string[], intent: string, sentiment: string, metadata: object, usage?: object }`
- **Dependencies**: 
  - External: openai
- **Performance**: 5s-30s, linear with content length and AI model complexity
- **Used By**: ProcessUrlCommand workflow

---

### 2. Storage Commands (1 command)

#### SaveSummaryCommand
- **File**: `src/commands/storage/SaveSummaryCommand.ts`
- **Type**: `OutputCommand<SaveSummaryInput, SaveSummaryOutput, SaveSummaryError>`
- **Purpose**: Saves a summary with a unique ID and provides a shareable URL
- **Input**: `{ url: string, summary: SummarizeContentOutput, metadata?: object, storageType?: string }`
- **Output**: `{ id: string, shareUrl: string, savedAt: Date, storagePath: string, dataSize: number }`
- **Dependencies**: None (uses in-memory storage)
- **Performance**: 10ms-100ms, O(1) for memory storage
- **Used By**: ProcessUrlCommand workflow

---

### 3. Web Commands (2 commands)

#### FetchWebPageCommand
- **File**: `src/commands/web/FetchWebPageCommand.ts`
- **Type**: `OutputCommand<FetchWebPageInput, FetchWebPageOutput, FetchWebPageError>`
- **Purpose**: Fetches HTML content from a web URL with error handling and redirect support
- **Input**: `{ url: string, headers?: object, timeout?: number, userAgent?: string }`
- **Output**: `{ html: string, url: string, statusCode: number, headers: object, fetchedAt: Date, contentLength: number, contentType?: string }`
- **Dependencies**: 
  - External: fetch (built-in)
- **Performance**: 500ms-5s, depends on target server response time and content size
- **Used By**: ProcessUrlCommand workflow

#### ExtractTextContentCommand
- **File**: `src/commands/web/ExtractTextContentCommand.ts`
- **Type**: `OutputCommand<ExtractTextContentInput, ExtractTextContentOutput, ExtractTextContentError>`
- **Purpose**: Extracts readable text content from HTML with metadata extraction and content cleaning
- **Input**: `{ html: string, url: string, preserveFormatting?: boolean, extractMetadata?: boolean, excludeSelectors?: string[] }`
- **Output**: `{ text: string, title: string, wordCount: number, characterCount: number, metadata: object, extractedAt: Date, originalUrl: string }`
- **Dependencies**: 
  - External: cheerio
- **Performance**: 100ms-1s, linear with HTML content size
- **Used By**: ProcessUrlCommand workflow

---

### 4. Workflow Commands (1 command)

#### ProcessUrlCommand
- **File**: `src/commands/workflow/ProcessUrlCommand.ts`
- **Type**: `OutputCommand<ProcessUrlInput, ProcessUrlOutput, ProcessUrlError>`
- **Purpose**: Complete workflow to fetch, extract, summarize, and optionally save web content
- **Input**: `{ url: string, modelConfig: AIModelConfig, extractionOptions?: object, summaryOptions?: object, saveSummary?: boolean, metadata?: object }`
- **Output**: `{ summary: object, pipeline: object, totalDuration: number, processedAt: Date }`
- **Dependencies**: 
  - External: openai, cheerio
  - Commands: 
    - web/FetchWebPageCommand
    - web/ExtractTextContentCommand
    - ai/SummarizeContentCommand
    - storage/SaveSummaryCommand
  - Services:
    - HttpService
    - OpenAIService
    - InMemoryStorage
    - ConsoleLogger
    - SimpleCommandRegistry
- **Performance**: 10s-60s, depends on content size and AI model performance
- **Used By**: Web application API routes

---

## Command Patterns

### Interface Types
- **`OutputCommand<TInput, TOutput, TError>`**: Commands that return data
- **`InputOnlyCommand<TInput, TError>`**: Commands that perform actions without return data (not used in this project)

### Dependency Types
- **Services**: Interface names (e.g., `SimpleCommandRegistry`)
- **Commands**: Path format (e.g., `web/FetchWebPageCommand`)
- **External**: Third-party dependencies (e.g., `cheerio`, `openai`)

### Error Handling
All commands have custom error classes extending `ErrorBase`:
- Structured error codes for API responses
- Detailed error context for debugging
- Consistent error patterns across commands

### Performance Characteristics
- **Web Fetch Operations**: 500ms-5s, network dependent
- **Text Extraction**: 100ms-1s, linear with HTML size
- **AI Operations**: 5s-30s, model and content dependent
- **Storage Operations**: 10ms-100ms, O(1) for memory

### Common Usage Patterns

#### API Route Integration
```typescript
const command = await commandRegistry.get<ProcessUrlCommand>(
  ProcessUrlCommand, input, logger
);
const result = await command.execute();
```

#### Command Composition
```typescript
// In ProcessUrlCommand
const fetchCommand = await this.commandRegistry.get<FetchWebPageCommand>(
  FetchWebPageCommand, { url }, this.logger
);
const fetchResult = await fetchCommand.execute();
```

#### Error Handling
```typescript
try {
  const result = await command.execute();
} catch (error) {
  if (error instanceof ProcessUrlError) {
    // Handle specific error type
  }
}
```

## Project-Specific Notes

This demonstration project uses a simplified implementation of the micro-block pattern:
- Commands use `SimpleCommandRegistry.getInstance()` instead of dependency injection
- Most commands only accept `input` and `logger` parameters (not the full 4-parameter pattern)
- In-memory storage is used for simplicity (SaveSummaryCommand)
- The focus is on demonstrating the pattern's core concepts in a clear, accessible way