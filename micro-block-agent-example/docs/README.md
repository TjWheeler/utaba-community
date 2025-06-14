# Getting Started Guide for AI Developers

## Quick Start (5 minutes)

Welcome! This guide will help you understand and work with this micro-block architecture project efficiently. The documentation is organized to give you exactly what you need, when you need it.

### Step 1: Understand the Project (2 minutes)

This is a **URL Summarizer** web application that demonstrates the micro-block architecture pattern. It:
- Fetches web pages
- Extracts text content
- Generates AI summaries with sentiment analysis
- Saves results with shareable links

The architecture breaks functionality into small, self-contained "command" blocks that can be composed together.

### Step 2: Essential Reading (3 minutes)

Read these documents in order:

1. **[micro-block-summary.md](./micro-block-summary.md)** ⭐ **START HERE**
   - Quick overview of the pattern
   - Command structure template
   - Critical rules to follow
   - Common patterns you'll use

2. **[command-index.md](./command-index.md)** 📚 **YOUR REFERENCE**
   - Lists all 5 commands in the project
   - Shows inputs/outputs for each
   - Reveals command dependencies
   - Use this to understand what's available

## Working with the Codebase

### For General Tasks (Reading, Bug Fixes, Minor Changes)

The two documents above are sufficient. Key points to remember:

- **Never instantiate commands directly** - Always use `commandRegistry.get()`
- **Commands are in** `src/commands/{category}/{CommandName}.ts`
- **The main workflow is** `ProcessUrlCommand` which orchestrates everything
- **API endpoint is** `src/app/api/process-url/route.ts`

### Example: Understanding the Flow

```typescript
// User submits URL → API route → ProcessUrlCommand
ProcessUrlCommand orchestrates:
  1. FetchWebPageCommand (gets HTML)
  2. ExtractTextContentCommand (extracts text)
  3. SummarizeContentCommand (AI summary)
  4. SaveSummaryCommand (stores result)
```

### For Creating or Modifying Commands

**Only if you need to create new commands or significantly modify existing ones**, read:

3. **[micro-block-architecture.md](./micro-block-architecture.md)** 📖 **DETAILED SPEC**
   - Complete pattern specification
   - All metadata fields explained
   - Service patterns and dependency injection
   - Advanced composition patterns

## Quick Command Reference

### Finding Commands
```bash
src/commands/
├── ai/           # AI-related commands
├── storage/      # Storage commands  
├── web/          # Web scraping commands
└── workflow/     # Orchestration commands
```

### Using Commands
```typescript
// Always get from registry
const command = await commandRegistry.get<FetchWebPageCommand>(
  FetchWebPageCommand, 
  { url: "https://example.com" },
  logger
);
const result = await command.execute();
```

### Command Structure
Every command has:
- Input interface (what it needs)
- Output interface (what it returns)
- Error class (what can go wrong)
- Metadata (describes the command)
- Execute method (does the work)

## Common Tasks

### Want to see how URL processing works?
Start with `src/commands/workflow/ProcessUrlCommand.ts`

### Need to modify AI prompts?
Look at `src/commands/ai/SummarizeContentCommand.ts`

### Want to change storage?
Check `src/commands/storage/SaveSummaryCommand.ts`

### Need to add a new command?
1. Read the summary doc first
2. Copy an existing command as a template
3. Follow the naming patterns
4. Only read the full architecture doc if you need advanced features

## Tips for AI Developers

1. **Start with the command index** - It shows you what building blocks exist
2. **Follow existing patterns** - The codebase is consistent
3. **Trust the registry** - It handles all the complexity
4. **Keep commands focused** - Each does one thing well
5. **Check the metadata** - It documents dependencies

## Project Structure

```
micro-block-agent-example/
├── src/
│   ├── app/              # Next.js app (UI + API)
│   ├── commands/         # All command implementations
│   ├── core/             # Base interfaces and registries
│   └── services/         # Service implementations
├── docs/                 # You are here! 
└── package.json         
```

## Important: Simplified Implementation

This demo project intentionally simplifies the micro-block pattern for learning purposes:

- **Commands have direct imports** (not portable) - In your projects use dependency injection
- **Commands instantiate dependencies** - In your projects, receive via constructor parameters  
- **Hard-coded service references** - In your projects, use service interfaces only

For your projects requiring portable commands, follow the patterns in `micro-block-architecture.md` strictly.

---

Remember: The micro-block pattern makes complex systems simple by breaking them into small, understandable pieces. Each command is a building block that you can understand in isolation.

Happy coding! 🚀