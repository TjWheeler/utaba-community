import * as fs from 'fs';
import * as path from 'path';
import { SandboxConfig } from './config.js';
import { 
  validatePath, 
  validateFilename, 
  checkOperationAllowed, 
  getRelativePath, 
  SecurityError,
  checkBinaryAllowed,
  checkFileExtension
} from './security.js';
import { QuotaManager, QuotaInfo } from './quota.js';
import { logger, PerformanceTimer } from './logger.js';
import { ContentTypeDetector, FileReadResult } from './contentType.js';

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  createdAt: Date;
  modifiedAt: Date;
}

export interface DirectoryListing {
  path: string;
  entries: FileInfo[];
}

export type FileEncoding = BufferEncoding | 'base64' | 'binary';

export class FileOperations {
  private config: SandboxConfig;
  private quotaManager: QuotaManager;
  
  constructor(config: SandboxConfig, quotaManager: QuotaManager) {
    this.config = config;
    this.quotaManager = quotaManager;
    logger.info('FileOps', 'FileOperations initialized');
  }
  
  /**
   * Get quota status
   */
  async getQuotaStatus(): Promise<QuotaInfo> {
    const timer = new PerformanceTimer('FileOps', 'getQuotaStatus');
    try {
      const quota = await this.quotaManager.getQuotaInfo();
      timer.end(true, { 
        usedMB: (quota.usedBytes / 1024 / 1024).toFixed(2),
        percentUsed: quota.percentUsed.toFixed(1)
      });
      return quota;
    } catch (error) {
      timer.end(false, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
  
  /**
   * List directory contents
   */
  async listDirectory(relativePath: string = ''): Promise<DirectoryListing> {
    const timer = new PerformanceTimer('FileOps', 'listDirectory');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    const fullPath = validatePath(relativePath || '.', this.config.sandboxRoot);
    logger.debug('FileOps', `Listing directory: ${relativePath}`, 'listDirectory', { fullPath });
    
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isDirectory()) {
        const error = new Error('Path is not a directory');
        timer.end(false, { error: error.message, path: relativePath });
        throw error;
      }
      
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      const fileInfos: FileInfo[] = [];
      
      for (const entry of entries) {
        // Skip quota file
        if (entry.name === '.mcp-quota.json') {
          continue;
        }
        
        const entryPath = path.join(fullPath, entry.name);
        const entryStats = await fs.promises.stat(entryPath);
        
        fileInfos.push({
          name: entry.name,
          path: getRelativePath(entryPath, this.config.sandboxRoot),
          size: entryStats.size,
          isDirectory: entry.isDirectory(),
          createdAt: entryStats.birthtime,
          modifiedAt: entryStats.mtime
        });
      }
      
      // Sort: directories first, then alphabetically
      fileInfos.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      timer.end(true, { path: relativePath, entryCount: fileInfos.length });
      
      return {
        path: getRelativePath(fullPath, this.config.sandboxRoot),
        entries: fileInfos
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to list directory: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Read file contents with smart content detection and optimized encoding
   */
  async readFile(relativePath: string, encoding?: FileEncoding): Promise<string | Buffer> {
    const timer = new PerformanceTimer('FileOps', 'readFile');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    logger.debug('FileOps', `Reading file: ${relativePath}`, 'readFile', { fullPath, encoding });
    
    // Check file extension is allowed for reading
    checkFileExtension(path.basename(fullPath), this.config);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        const error = new Error('Path is not a file');
        timer.end(false, { error: error.message, path: relativePath });
        throw error;
      }
      
      // Read raw buffer first
      const buffer = await fs.promises.readFile(fullPath);
      
      let result: string | Buffer;
      let actualEncoding: string;
      
      // Handle different encoding types
      if (encoding === 'base64') {
        // Explicit base64 request
        checkBinaryAllowed(path.basename(fullPath), this.config, true);
        result = buffer.toString('base64');
        actualEncoding = 'base64';
      } else if (encoding === 'binary') {
        // Return raw buffer
        checkBinaryAllowed(path.basename(fullPath), this.config, true);
        result = buffer;
        actualEncoding = 'binary';
      } else if (encoding && encoding !== 'utf-8') {
        // Specific text encoding
        result = buffer.toString(encoding);
        actualEncoding = encoding;
      } else {
        // Auto-detect content type for optimal encoding
        const contentType = ContentTypeDetector.detectType(fullPath, buffer);
        
        if (contentType.isBinary) {
          // Binary file - check if binary operations allowed
          checkBinaryAllowed(path.basename(fullPath), this.config, true);
          
          if (encoding === 'utf-8') {
            // User explicitly requested UTF-8 for binary file - error
            const error = new Error('Cannot decode binary file as UTF-8. Use base64 encoding instead.');
            timer.end(false, { error: error.message, path: relativePath });
            throw error;
          }
          
          // Return as base64 for binary files (safe transport)
          result = buffer.toString('base64');
          actualEncoding = 'base64';
        } else {
          // Text file - return as UTF-8 string (optimal)
          result = buffer.toString('utf-8');
          actualEncoding = 'utf-8';
        }
      }
      
      timer.endWithFileSize(stats.size, true);
      logger.info('FileOps', `File read successfully: ${relativePath}`, 'readFile', { 
        size: stats.size, 
        encoding: actualEncoding,
        isOptimized: !encoding || (encoding === 'utf-8' && actualEncoding === 'utf-8')
      });
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Enhanced read file method that returns metadata for MCP optimization
   */
  async readFileWithMetadata(relativePath: string, encoding?: FileEncoding): Promise<FileReadResult> {
    const timer = new PerformanceTimer('FileOps', 'readFileWithMetadata');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    logger.debug('FileOps', `Reading file with metadata: ${relativePath}`, 'readFileWithMetadata', { fullPath, encoding });
    
    // Check file extension is allowed for reading
    checkFileExtension(path.basename(fullPath), this.config);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        const error = new Error('Path is not a file');
        timer.end(false, { error: error.message, path: relativePath });
        throw error;
      }
      
      // Read raw buffer first
      const buffer = await fs.promises.readFile(fullPath);
      
      // Detect content type
      const contentType = ContentTypeDetector.detectType(fullPath, buffer);
      
      // Determine optimal encoding
      const optimalEncoding = ContentTypeDetector.getOptimalEncoding(contentType, encoding);
      
      let content: string;
      
      if (optimalEncoding === 'base64') {
        checkBinaryAllowed(path.basename(fullPath), this.config, true);
        content = buffer.toString('base64');
      } else {
        // UTF-8 text
        if (contentType.isBinary && encoding === 'utf-8') {
          const error = new Error('Cannot decode binary file as UTF-8. Use base64 encoding instead.');
          timer.end(false, { error: error.message, path: relativePath });
          throw error;
        }
        content = buffer.toString('utf-8');
      }
      
      const result: FileReadResult = {
        content,
        encoding: optimalEncoding,
        contentType: contentType.type,
        size: stats.size,
        isBinary: contentType.isBinary
      };
      
      timer.endWithFileSize(stats.size, true);
      logger.info('FileOps', `File read with metadata successfully: ${relativePath}`, 'readFileWithMetadata', { 
        size: stats.size, 
        encoding: optimalEncoding,
        contentType: contentType.type,
        isBinary: contentType.isBinary
      });
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Write file with smart content detection and validation
   */
  async writeFile(
    relativePath: string, 
    content: string | Buffer, 
    encoding?: FileEncoding
  ): Promise<void> {
    const timer = new PerformanceTimer('FileOps', 'writeFile');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    const filename = path.basename(fullPath);
    validateFilename(filename, this.config);
    
    let dataToWrite: Buffer;
    let isBinary = false;
    let detectedContentType: string | undefined;
    
    // Convert content to Buffer based on encoding
    if (encoding === 'base64' && typeof content === 'string') {
      // Decode base64 string to buffer
      dataToWrite = Buffer.from(content, 'base64');
      isBinary = true;
      
      // Try to detect actual content type from decoded data
      const contentType = ContentTypeDetector.detectType(fullPath, dataToWrite);
      detectedContentType = contentType.type;
      isBinary = contentType.isBinary;
    } else if (Buffer.isBuffer(content)) {
      dataToWrite = content;
      
      // Detect content type from buffer
      const contentType = ContentTypeDetector.detectType(fullPath, dataToWrite);
      detectedContentType = contentType.type;
      isBinary = contentType.isBinary;
    } else if (typeof content === 'string') {
      dataToWrite = Buffer.from(content, encoding as BufferEncoding || 'utf-8');
      isBinary = false;
      detectedContentType = 'text/plain';
    } else {
      const error = new SecurityError('Content must be a string or Buffer');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    // Check if binary operations are allowed
    checkBinaryAllowed(filename, this.config, isBinary);
    
    // Check quota
    this.quotaManager.checkQuota(dataToWrite.length, fullPath);
    
    logger.debug('FileOps', `Writing file: ${relativePath}`, 'writeFile', { 
      fullPath, 
      size: dataToWrite.length, 
      encoding, 
      isBinary,
      detectedContentType
    });
    
    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.promises.writeFile(fullPath, dataToWrite);
      
      // Update quota
      await this.quotaManager.updateQuota(fullPath, dataToWrite.length);
      
      const quotaInfo = await this.quotaManager.getQuotaInfo();
      timer.endWithFileSize(dataToWrite.length, true, quotaInfo.percentUsed);
      
      logger.info('FileOps', `File written successfully: ${relativePath}`, 'writeFile', { 
        size: dataToWrite.length,
        quotaUsed: quotaInfo.percentUsed.toFixed(1) + '%',
        contentType: detectedContentType
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath, size: dataToWrite.length });
      
      if (error instanceof Error) {
        throw new Error(`Failed to write file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Append to file with support for text, binary, and base64
   */
  async appendFile(
    relativePath: string, 
    content: string | Buffer, 
    encoding?: FileEncoding
  ): Promise<void> {
    const timer = new PerformanceTimer('FileOps', 'appendFile');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    const filename = path.basename(fullPath);
    
    // Get current file size (0 if doesn't exist)
    let currentSize = 0;
    let fileExists = false;
    try {
      const stats = await fs.promises.stat(fullPath);
      currentSize = stats.size;
      fileExists = true;
      // Check extension for existing file
      checkFileExtension(filename, this.config);
    } catch {
      // File doesn't exist, will be created
      validateFilename(filename, this.config);
    }
    
    let dataToAppend: Buffer;
    let isBinary = false;
    
    // Convert content to Buffer based on encoding
    if (encoding === 'base64' && typeof content === 'string') {
      dataToAppend = Buffer.from(content, 'base64');
      isBinary = true;
    } else if (Buffer.isBuffer(content)) {
      dataToAppend = content;
      isBinary = true;
    } else if (typeof content === 'string') {
      dataToAppend = Buffer.from(content, encoding as BufferEncoding || 'utf-8');
      isBinary = false;
    } else {
      const error = new SecurityError('Content must be a string or Buffer');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    // Check if binary operations are allowed
    checkBinaryAllowed(filename, this.config, isBinary);
    
    // Check quota for the additional content
    const newTotalSize = currentSize + dataToAppend.length;
    this.quotaManager.checkQuota(dataToAppend.length, fullPath);
    
    logger.debug('FileOps', `Appending to file: ${relativePath}`, 'appendFile', { 
      fullPath, 
      appendSize: dataToAppend.length, 
      currentSize,
      newTotalSize,
      fileExists
    });
    
    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      // Append to file
      await fs.promises.appendFile(fullPath, dataToAppend);
      
      // Update quota with new total size
      await this.quotaManager.updateQuota(fullPath, newTotalSize);
      
      const quotaInfo = await this.quotaManager.getQuotaInfo();
      timer.endWithFileSize(dataToAppend.length, true, quotaInfo.percentUsed);
      
      logger.info('FileOps', `Content appended successfully: ${relativePath}`, 'appendFile', { 
        appendedSize: dataToAppend.length,
        newTotalSize,
        quotaUsed: quotaInfo.percentUsed.toFixed(1) + '%'
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath, appendSize: dataToAppend.length });
      
      if (error instanceof Error) {
        throw new Error(`Failed to append to file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Delete file
   */
  async deleteFile(relativePath: string): Promise<void> {
    const timer = new PerformanceTimer('FileOps', 'deleteFile');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    checkOperationAllowed('delete', this.config);
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    logger.debug('FileOps', `Deleting file: ${relativePath}`, 'deleteFile', { fullPath });
    
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        const error = new Error('Path is not a file');
        timer.end(false, { error: error.message, path: relativePath });
        throw error;
      }
      
      const fileSize = stats.size;
      await fs.promises.unlink(fullPath);
      await this.quotaManager.updateQuota(fullPath, 0);
      
      timer.endWithFileSize(fileSize, true);
      logger.info('FileOps', `File deleted successfully: ${relativePath}`, 'deleteFile', { 
        freedSize: fileSize 
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to delete file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Create directory
   */
  async createDirectory(relativePath: string): Promise<void> {
    const timer = new PerformanceTimer('FileOps', 'createDirectory');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    checkOperationAllowed('createDir', this.config);
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    logger.debug('FileOps', `Creating directory: ${relativePath}`, 'createDirectory', { fullPath });
    
    try {
      await fs.promises.mkdir(fullPath, { recursive: true });
      timer.end(true, { path: relativePath });
      logger.info('FileOps', `Directory created successfully: ${relativePath}`, 'createDirectory');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to create directory: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Delete directory (must be empty)
   */
  async deleteDirectory(relativePath: string): Promise<void> {
    const timer = new PerformanceTimer('FileOps', 'deleteDirectory');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    checkOperationAllowed('deleteDir', this.config);
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    logger.debug('FileOps', `Deleting directory: ${relativePath}`, 'deleteDirectory', { fullPath });
    
    try {
      await fs.promises.rmdir(fullPath);
      timer.end(true, { path: relativePath });
      logger.info('FileOps', `Directory deleted successfully: ${relativePath}`, 'deleteDirectory');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to delete directory: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Move/rename file or directory
   */
  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    const timer = new PerformanceTimer('FileOps', 'moveFile');
    
    if (typeof sourcePath !== 'string' || typeof destinationPath !== 'string') {
      const error = new SecurityError('Paths must be strings');
      timer.end(false, { error: error.message, source: sourcePath, dest: destinationPath });
      throw error;
    }
    
    const fullSourcePath = validatePath(sourcePath, this.config.sandboxRoot);
    const fullDestPath = validatePath(destinationPath, this.config.sandboxRoot);
    const destFilename = path.basename(fullDestPath);
    
    // Check destination filename and extension
    validateFilename(destFilename, this.config);
    
    logger.debug('FileOps', `Moving: ${sourcePath} → ${destinationPath}`, 'moveFile', { 
      fullSourcePath, 
      fullDestPath 
    });
    
    try {
      // Check if source is a file and validate its extension can be moved
      const stats = await fs.promises.stat(fullSourcePath);
      if (stats.isFile()) {
        const sourceFilename = path.basename(fullSourcePath);
        checkFileExtension(sourceFilename, this.config);
      }
      
      // Ensure destination directory exists
      const destDir = path.dirname(fullDestPath);
      await fs.promises.mkdir(destDir, { recursive: true });
      
      await fs.promises.rename(fullSourcePath, fullDestPath);
      
      // Update quota tracking
      if (stats.isFile()) {
        await this.quotaManager.updateQuota(fullSourcePath, 0);
        await this.quotaManager.updateQuota(fullDestPath, stats.size);
        timer.endWithFileSize(stats.size, true);
      } else {
        timer.end(true, { source: sourcePath, dest: destinationPath });
      }
      
      logger.info('FileOps', `Moved successfully: ${sourcePath} → ${destinationPath}`, 'moveFile');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, source: sourcePath, dest: destinationPath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to move file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Copy file
   */
  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    const timer = new PerformanceTimer('FileOps', 'copyFile');
    
    if (typeof sourcePath !== 'string' || typeof destinationPath !== 'string') {
      const error = new SecurityError('Paths must be strings');
      timer.end(false, { error: error.message, source: sourcePath, dest: destinationPath });
      throw error;
    }
    
    const fullSourcePath = validatePath(sourcePath, this.config.sandboxRoot);
    const fullDestPath = validatePath(destinationPath, this.config.sandboxRoot);
    const destFilename = path.basename(fullDestPath);
    
    // Check both source and destination extensions
    const sourceFilename = path.basename(fullSourcePath);
    checkFileExtension(sourceFilename, this.config);
    validateFilename(destFilename, this.config);
    
    logger.debug('FileOps', `Copying: ${sourcePath} → ${destinationPath}`, 'copyFile', { 
      fullSourcePath, 
      fullDestPath 
    });
    
    try {
      const sourceStats = await fs.promises.stat(fullSourcePath);
      if (!sourceStats.isFile()) {
        const error = new Error('Source is not a file');
        timer.end(false, { error: error.message, source: sourcePath, dest: destinationPath });
        throw error;
      }
      
      // Check quota for the copy
      this.quotaManager.checkQuota(sourceStats.size, fullDestPath);
      
      // Ensure destination directory exists
      const destDir = path.dirname(fullDestPath);
      await fs.promises.mkdir(destDir, { recursive: true });
      
      await fs.promises.copyFile(fullSourcePath, fullDestPath);
      await this.quotaManager.updateQuota(fullDestPath, sourceStats.size);
      
      const quotaInfo = await this.quotaManager.getQuotaInfo();
      timer.endWithFileSize(sourceStats.size, true, quotaInfo.percentUsed);
      
      logger.info('FileOps', `Copied successfully: ${sourcePath} → ${destinationPath}`, 'copyFile', { 
        size: sourceStats.size,
        quotaUsed: quotaInfo.percentUsed.toFixed(1) + '%'
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, source: sourcePath, dest: destinationPath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to copy file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Check if path exists
   */
  async exists(relativePath: string): Promise<boolean> {
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    try {
      await fs.promises.access(fullPath);
      logger.debug('FileOps', `Path exists: ${relativePath}`, 'exists', { exists: true });
      return true;
    } catch {
      logger.debug('FileOps', `Path does not exist: ${relativePath}`, 'exists', { exists: false });
      return false;
    }
  }
  
  /**
   * Get detailed file information
   */
  async getFileInfo(relativePath: string): Promise<FileInfo> {
    const timer = new PerformanceTimer('FileOps', 'getFileInfo');
    
    if (typeof relativePath !== 'string') {
      const error = new SecurityError('Path must be a string');
      timer.end(false, { error: error.message, path: relativePath });
      throw error;
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      
      // If it's a file, check extension is allowed
      if (stats.isFile()) {
        checkFileExtension(path.basename(fullPath), this.config);
      }
      
      const fileInfo = {
        name: path.basename(fullPath),
        path: getRelativePath(fullPath, this.config.sandboxRoot),
        size: stats.size,
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
      
      timer.end(true, { path: relativePath, isDirectory: stats.isDirectory(), size: stats.size });
      logger.debug('FileOps', `File info retrieved: ${relativePath}`, 'getFileInfo', { 
        size: stats.size, 
        isDirectory: stats.isDirectory() 
      });
      
      return fileInfo;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      timer.end(false, { error: errorMsg, path: relativePath });
      
      if (error instanceof Error) {
        throw new Error(`Failed to get file info: ${error.message}`);
      }
      throw error;
    }
  }
}
