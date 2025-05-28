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
  }
  
  /**
   * Get quota status
   */
  async getQuotaStatus(): Promise<QuotaInfo> {
    return this.quotaManager.getQuotaInfo();
  }
  
  /**
   * List directory contents
   */
  async listDirectory(relativePath: string = ''): Promise<DirectoryListing> {
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    const fullPath = validatePath(relativePath || '.', this.config.sandboxRoot);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
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
      
      return {
        path: getRelativePath(fullPath, this.config.sandboxRoot),
        entries: fileInfos
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to list directory: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Read file contents with support for text, binary, and base64
   */
  async readFile(relativePath: string, encoding?: FileEncoding): Promise<string | Buffer> {
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    // Check file extension is allowed for reading
    checkFileExtension(path.basename(fullPath), this.config);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }
      
      // Handle different encoding types
      if (encoding === 'base64') {
        // Read as buffer and convert to base64
        const buffer = await fs.promises.readFile(fullPath);
        checkBinaryAllowed(path.basename(fullPath), this.config, true);
        return buffer.toString('base64');
      } else if (encoding === 'binary' || !encoding) {
        // Return raw buffer
        checkBinaryAllowed(path.basename(fullPath), this.config, true);
        return await fs.promises.readFile(fullPath);
      } else {
        // Text encoding
        return await fs.promises.readFile(fullPath, encoding);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Write file with support for text, binary, and base64
   */
  async writeFile(
    relativePath: string, 
    content: string | Buffer, 
    encoding?: FileEncoding
  ): Promise<void> {
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    const filename = path.basename(fullPath);
    validateFilename(filename, this.config);
    
    let dataToWrite: Buffer;
    let isBinary = false;
    
    // Convert content to Buffer based on encoding
    if (encoding === 'base64' && typeof content === 'string') {
      // Decode base64 string to buffer
      dataToWrite = Buffer.from(content, 'base64');
      isBinary = true;
    } else if (Buffer.isBuffer(content)) {
      dataToWrite = content;
      isBinary = true;
    } else if (typeof content === 'string') {
      dataToWrite = Buffer.from(content, encoding as BufferEncoding || 'utf-8');
      isBinary = false;
    } else {
      throw new SecurityError('Content must be a string or Buffer');
    }
    
    // Check if binary operations are allowed
    checkBinaryAllowed(filename, this.config, isBinary);
    
    // Check quota
    this.quotaManager.checkQuota(dataToWrite.length, fullPath);
    
    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.promises.writeFile(fullPath, dataToWrite);
      
      // Update quota
      await this.quotaManager.updateQuota(fullPath, dataToWrite.length);
    } catch (error) {
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
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
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
      throw new SecurityError('Content must be a string or Buffer');
    }
    
    // Check if binary operations are allowed
    checkBinaryAllowed(filename, this.config, isBinary);
    
    // Check quota for the additional content
    const newTotalSize = currentSize + dataToAppend.length;
    this.quotaManager.checkQuota(dataToAppend.length, fullPath);
    
    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      // Append to file
      await fs.promises.appendFile(fullPath, dataToAppend);
      
      // Update quota with new total size
      await this.quotaManager.updateQuota(fullPath, newTotalSize);
    } catch (error) {
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
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    checkOperationAllowed('delete', this.config);
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }
      
      await fs.promises.unlink(fullPath);
      await this.quotaManager.updateQuota(fullPath, 0);
    } catch (error) {
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
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    checkOperationAllowed('createDir', this.config);
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    try {
      await fs.promises.mkdir(fullPath, { recursive: true });
    } catch (error) {
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
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    checkOperationAllowed('deleteDir', this.config);
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    try {
      await fs.promises.rmdir(fullPath);
    } catch (error) {
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
    if (typeof sourcePath !== 'string' || typeof destinationPath !== 'string') {
      throw new SecurityError('Paths must be strings');
    }
    
    const fullSourcePath = validatePath(sourcePath, this.config.sandboxRoot);
    const fullDestPath = validatePath(destinationPath, this.config.sandboxRoot);
    const destFilename = path.basename(fullDestPath);
    
    // Check destination filename and extension
    validateFilename(destFilename, this.config);
    
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
      }
    } catch (error) {
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
    if (typeof sourcePath !== 'string' || typeof destinationPath !== 'string') {
      throw new SecurityError('Paths must be strings');
    }
    
    const fullSourcePath = validatePath(sourcePath, this.config.sandboxRoot);
    const fullDestPath = validatePath(destinationPath, this.config.sandboxRoot);
    const destFilename = path.basename(fullDestPath);
    
    // Check both source and destination extensions
    const sourceFilename = path.basename(fullSourcePath);
    checkFileExtension(sourceFilename, this.config);
    validateFilename(destFilename, this.config);
    
    try {
      const sourceStats = await fs.promises.stat(fullSourcePath);
      if (!sourceStats.isFile()) {
        throw new Error('Source is not a file');
      }
      
      // Check quota for the copy
      this.quotaManager.checkQuota(sourceStats.size, fullDestPath);
      
      // Ensure destination directory exists
      const destDir = path.dirname(fullDestPath);
      await fs.promises.mkdir(destDir, { recursive: true });
      
      await fs.promises.copyFile(fullSourcePath, fullDestPath);
      await this.quotaManager.updateQuota(fullDestPath, sourceStats.size);
    } catch (error) {
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
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get detailed file information
   */
  async getFileInfo(relativePath: string): Promise<FileInfo> {
    if (typeof relativePath !== 'string') {
      throw new SecurityError('Path must be a string');
    }
    
    const fullPath = validatePath(relativePath, this.config.sandboxRoot);
    
    try {
      const stats = await fs.promises.stat(fullPath);
      
      // If it's a file, check extension is allowed
      if (stats.isFile()) {
        checkFileExtension(path.basename(fullPath), this.config);
      }
      
      return {
        name: path.basename(fullPath),
        path: getRelativePath(fullPath, this.config.sandboxRoot),
        size: stats.size,
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get file info: ${error.message}`);
      }
      throw error;
    }
  }
}