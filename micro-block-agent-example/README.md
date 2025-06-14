# URL Summarizer - Micro-Block Architecture Demo

**A practical demonstration of the micro-block architecture pattern designed for AI-collaborative software development.**

## 🎯 Project Purpose

This project serves as a **reference implementation** and **learning resource** for the micro-block architecture pattern. It demonstrates how to build software using small, self-contained "command blocks" that are:

- **AI-friendly** - Easy for AI to understand and modify
- **Composable** - Commands can be combined into complex workflows  
- **Testable** - Each piece can be tested independently
- **Swappable** - Components can be easily replaced

### Real-World Example: URL Summarization

The demo implements a complete URL summarization pipeline:

1. **Fetches web content** from any URL
2. **Extracts readable text** from HTML 
3. **Generates AI summaries** with key points and sentiment analysis
4. **Stores results** with shareable IDs

Each step is a separate, independent command that follows the micro-block pattern.

## 🤖 For AI Developers

**Start here:** Read [`docs/README.md`](./docs/README.md) for your complete getting started guide.

The docs folder contains:
- **Quick start guide** (5 minutes to productivity)
- **Command reference** (all available building blocks)
- **Pattern explanations** (when you need to create/modify commands)

This README provides the high-level overview - the docs guide you through actually working with the code.

## 🏗️ Pattern Demonstration

### Five Independent Commands
- **`FetchWebPageCommand`** - Downloads HTML content
- **`ExtractTextContentCommand`** - Extracts clean text 
- **`SummarizeContentCommand`** - Generates AI summaries
- **`SaveSummaryCommand`** - Stores results
- **`ProcessUrlCommand`** - Orchestrates the entire pipeline

### Key Pattern Benefits
1. **Swappable Components** - Change AI providers without touching other code
2. **Independent Testing** - Mock and test each command separately
3. **Flexible Composition** - Recombine commands for different workflows
4. **AI-Friendly** - Clear contracts make the system easily discoverable

## 🚀 Try the Demo

### Quick Setup
```bash
npm install && npm run dev
```

### Usage
1. Open http://localhost:3000
2. Enter any article URL
3. Provide your OpenAI API key
4. Click "Summarize URL"
5. Watch the micro-block pipeline in action!

## 📁 What's Inside

```
src/commands/        # The micro-block commands
├── ai/             # SummarizeContentCommand
├── storage/        # SaveSummaryCommand  
├── web/            # FetchWebPageCommand, ExtractTextContentCommand
└── workflow/       # ProcessUrlCommand (orchestrates everything)

src/core/           # Base interfaces and command registry
src/app/            # Next.js UI and API routes
docs/               # Documentation (start with docs/README.md)
```

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             ProcessUrlCommand                                    │
│                          (Workflow Orchestrator)                                │
└─────────────────────────────┬───────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │ FetchWebPage    │    │ ExtractText     │    │ SummarizeContent│    │ SaveSummary     │
    │ Command         │───▶│ ContentCommand  │───▶│ Command         │───▶│ Command         │
    │                 │    │                 │    │                 │    │                 │
    │ web/            │    │ web/            │    │ ai/             │    │ storage/        │
    └─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
            │                        │                        │                        │
            ▼                        ▼                        ▼                        ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │   HTTP/HTTPS    │    │     Cheerio     │    │   OpenAI API    │    │ Memory Storage  │
    │   Fetch API     │    │   HTML Parser   │    │   GPT Models    │    │  (In Demo)      │
    └─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
    
    URL Input           →    HTML Content    →     Clean Text     →      AI Summary     →    Saved in Memory
```

*Diagram generated by AI using the micro-block pattern's metadata. The AI analyzed each command's dependencies, inputs/outputs, composition structure, and external service requirements from the `CommandMetadata` to automatically create this workflow visualization.*

**ProcessUrlCommand** orchestrates the pipeline - each command is an independent, swappable building block:
- **Sequential execution** with clear data handoffs
- **External dependencies** clearly separated from business logic  
- **Category organization** shows logical grouping (web/, ai/, storage/, workflow/)
- **Real-time progress tracking** in the UI for each step

## 🎯 Core Pattern Concepts

### Self-Contained Commands
Each command is a complete unit with:
- Clear input/output contracts
- Built-in validation and error handling  
- Rich metadata for AI discovery
- Independent testing capability

### Registry-Based Composition
```typescript
// Commands are discovered and composed dynamically
const command = await commandRegistry.get<SummarizeContentCommand>(
  SummarizeContentCommand, input, logger
);
const result = await command.execute();
```

### Swappable Components
Want to use Claude instead of OpenAI? Just swap the `SummarizeContentCommand` - the rest of the system stays the same because contracts are preserved.

## 🎓 What You'll Learn

- **Granular Design** - Breaking complex systems into small, understandable pieces
- **Contract-First Development** - Clear interfaces prevent integration issues  
- **Component Swapping** - Change implementations without breaking the system
- **AI-Friendly Architecture** - Metadata-driven design that AI can understand and modify
- **Testable Composition** - Each piece works independently and in combination

## ⚠️ Demo vs Production

This demo **simplifies** the pattern for learning:
- Commands use direct imports (production uses dependency injection)
- Hard-coded service references (production uses interfaces)

**For your projects:** Follow the complete patterns in `docs/micro-block-architecture.md`

## 🚀 Next Steps

1. **Try the demo** - See the pattern in action
2. **Read the docs** - [`docs/README.md`](./docs/README.md) for AI developer guide
3. **Explore the code** - Each command demonstrates the pattern
4. **Adapt for your use case** - Use this as a template for your projects

---

# Credits

Designed and Built by [Tim Wheeler](https://utaba.ai) and [Claude](https://docs.anthropic.com/en/docs/claude-code).


**Built for AI-collaborative development** - Each command is designed to be easily discovered, understood, and modified by both humans and AI systems.

MIT License - Use this as a foundation for your own micro-block projects!
