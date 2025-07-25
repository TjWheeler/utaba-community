# UCM System Quickstart Guide for AI Assistants

## Overview
The Universal Context Manager (UCM) is a repository for AI-native micro-block components. Use these MCP tools to discover, retrieve, and publish reusable code artifacts.

## Core Concepts

### Namespace Structure
All UCM artifacts follow this path pattern:
```
/{author}/{repository}/{category}/{subcategory}/{filename}[@version]
```

**Repository**: A repository is a collection of related artifacts under an author's namespace. It allows authors to organize their content into logical groups (e.g., different projects, libraries, or domains). In the current release, the repository is restricted to 'main' only. Future releases will support multiple repositories per author.

** Important Note: ** This guide uses the '9520011738' author with 'main' repository as an example. You can use this to get started.
To publish artifacts you will need to substitue '9520011738' for your own author account that is available during sign up.

**Example**: `9520011738/main/commands/user/CreateUserCommand.ts@1.0.0`

### Categories
- **commands** - Single-purpose, contract-driven operations
- **services** - Business logic and data access layers  
- **patterns** - Architecture and design patterns
- **implementations** - Technology-specific implementations which may refer to patterns
- **contracts** - interfaces and schemas
- **guidance** - Documentation and best practices
- **project** - Project templates and configurations

## Discovery Workflow

### ALWAYS start by reading the author index - no exceptions
Before working with any author's content, always check their index for an overview:
```
mcp_ucm_get_author_index
author: "9520011738"
```
This provides a dynamic markdown guide showing the author's content structure, key artifacts, and getting-started information.

### Browse by Category
```
mcp_ucm_list_artifacts
path: "9520011738/main/commands"
```

### Get Specific Artifacts
```
mcp_ucm_get_artifact
path: "9520011738/main/commands/user/CreateUserCommand.ts"
```

## Publishing Workflow

### Create New Artifact
```
mcp_ucm_publish_artifact
path: "9520011738/main/commands/user"
filename: "NewCommand.ts"
content: "// your code here"
version: "1.0.0"
description: "Description of the command"
technology: "typescript"
```



## Key Rules

1. **Check author index first** - Always run `mcp_ucm_get_author_index` before working with an author's content
2. **Always use exact filenames** - Match the filename parameter with the actual file
3. **Include metadata** - Name, version, description, and technology are required
4. **Use semantic versioning** - Format: `major.minor.patch` (e.g., "1.0.0")
5. **Start with exploration** - Browse categories before searching for specific items
6. **Follow dependencies** - Load referenced patterns and implementations together
7. **Use Versioning** - When updating a file you should increment the version or leave the version blank and the system will do that for you

## Best Practices

### For Discovery Tasks
- **Always start with author index** - Use `mcp_ucm_get_author_index` to understand the author's content structure
- Use `mcp_ucm_list_artifacts` to explore categories
- Look for guidance documents in the `guidance` category
- Check implementations for technology-specific examples

### For Integration Tasks  
- Load patterns first, then implementations
- Check for existing commands/services before creating new ones
- Use the micro-block architecture principles

### For Publishing
- Follow existing naming conventions
- Include comprehensive metadata
- Test artifacts before publishing
- Use appropriate technology tags

### For Organization
- **Use README.md for subcategory entry points** - When creating a collection of related artifacts under a subcategory (e.g., `9520011738/main/implementations/nextjs/`), include a `README.md` file as the primary documentation
- **README.md appears first** - The system automatically displays README.md files prominently in listings, making them ideal for getting-started guides
- **Link to examples** - Use README.md to provide overview and reference specific implementation files within the same subcategory
- **Follow GitHub conventions** - README.md files should contain setup instructions, usage examples, and links to detailed implementations

## Common Patterns

### Finding Test Guidance
1. Browse: `9520011738/main/guidance` 
2. Look for files containing "test" or "integration"
3. Load: `mcp_ucm_get_artifact` with the guidance file

### Building New Features
1. Browse: `9520011738/main/patterns` for architecture patterns
2. Browse: `9520011738/main/implementations` for technology examples  
3. Browse: `9520011738/main/commands` and `9520011738/main/services` for reusable components
4. Use surgical accuracy - load ALL relevant resources to prevent gaps

### Working with Existing Projects
1. **Get author overview** - Use `mcp_ucm_get_author_index` to understand the author's content organization
2. Load project documentation from local files
3. Check for UCM references in README.md
4. Load referenced UCM artifacts automatically
5. Load work-context guidance (dev-instructions, test-instructions)

## Error Prevention

- **Downloading Large files** are automatically chunked - use `mcp_ucm_get_chunk` to retrieve additional chunks
- **Uploading Large files** for performance use `mcp_ucm_publish_artifact_fromfile` and pass a local file reference in the format 'file://{path to your OS file}'
- **Path validation** - Ensure paths follow the `author/repository/category/subcategory` format
- **Version conflicts** - Check existing versions before publishing
- **Missing dependencies** - Load referenced patterns and implementations together

## Next Steps

After reading this guide, start with `mcp_ucm_get_author_index` to get an overview of the author's content structure, then use `mcp_ucm_list_artifacts` to explore available categories and understand the UCM structure for your specific use case.

## Troubleshooting

### Check server status with Health Check
```
mcp_ucm_health_check
```