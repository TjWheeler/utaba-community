# Release Notes - Utaba Community Sandbox FS

## Version 1.2.0 (2025-05-29)

### 🔄 Breaking Changes

- **RENAMED**: `move_file` tool → `move_item` 
  - **What changed**: The tool name has been updated to better reflect its capability to move both files and directories
  - **Why**: The previous name `move_file` was misleading since it already supported moving directories and all their contents atomically
  - **Migration**: Update any client code from `move_file` to `move_item` - functionality remains identical

### ✨ Enhancements

- **Enhanced API clarity**: `move_item` tool now has improved description explicitly stating it handles directories with all contents atomically
- **Better parameter documentation**: Source and destination parameters now clearly indicate they accept both files and directories
- **Improved response messages**: More accurate success messages that reflect the item type being moved

### 📖 Documentation Updates

- Tool descriptions now clearly communicate directory support
- Parameter descriptions specify file/directory compatibility
- Added explicit mention of atomic operations for directory moves

### 🔧 Technical Details

- No changes to underlying functionality - `fs.rename()` continues to provide atomic moves
- Same security validations and quota management
- Same performance characteristics
- Cross-directory moves continue to work seamlessly when on the same filesystem

### 🚀 Why This Change?

The `move_file` tool was already capable of moving entire directories atomically, but the name was confusing. Users might have expected it to only work with files, or worse, assumed they needed a separate tool for directories. The new `move_item` name:

- ✅ Clearly indicates it works with any filesystem item
- ✅ Matches Unix/Linux `mv` command behavior
- ✅ Reduces API surface (no need for separate directory move function)
- ✅ Maintains atomic operation guarantees

---

## Version 1.1.0 (2025-05-29)

### 🚀 Performance Optimizations

- **Smart content detection**: Automatic file type detection with optimal encoding selection
- **Reduced base64 overhead**: Text files now return as UTF-8 strings (~25% size reduction)
- **Enhanced read operations**: New `readFileWithMetadata` method with encoding optimization
- **Improved performance logging**: File size and quota tracking in operation logs

### ✨ Features

- **Enhanced logging system**: File-based logging with rotation support
- **Better error handling**: More descriptive error messages and validation
- **Quota optimization**: Improved quota tracking and reporting
- **Content type detection**: Automatic binary vs text file detection

### 🔧 Technical Improvements

- Smart encoding selection based on file content
- Enhanced MCP response metadata
- Optimized buffer handling for large files
- Improved TypeScript type safety

### 📊 Performance Gains

- Text file operations: ~25% faster due to UTF-8 optimization
- Memory usage: Reduced overhead for text file handling
- Response size: Smaller payloads for text content
- Logging: Enhanced debugging with performance metrics

---

## Version 1.0.0 (Initial Release)

### 🎉 Core Features

- **Secure sandboxed file system**: Isolated file operations within configured directory
- **Complete file operations**: Read, write, append, delete, copy, move operations
- **Directory management**: Create, delete, list directory contents
- **Quota management**: Configurable storage limits with real-time tracking
- **Security validation**: Path traversal protection, filename validation, extension filtering
- **Binary file support**: Base64 encoding for binary content
- **MCP protocol**: Full Model Context Protocol compliance
- **Production ready**: Comprehensive error handling and logging

### 🛡️ Security Features

- Path traversal attack prevention
- Configurable file extension restrictions
- Filename validation and sanitization
- Sandbox root enforcement
- Operation permissions control

### ⚙️ Configuration

- Configurable sandbox root directory
- Quota limits and monitoring
- Binary operation controls
- Allowed file extensions
- Operation permissions (read/write/delete)

### 🔍 Monitoring & Debugging

- Comprehensive logging system
- Performance metrics tracking
- Security event logging
- Quota usage monitoring
- Real-time operation status
