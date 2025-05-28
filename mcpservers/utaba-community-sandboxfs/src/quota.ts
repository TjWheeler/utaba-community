import * as fs from 'fs';
import * as path from 'path';
import { SandboxConfig } from './config.js';

export interface QuotaInfo {
  usedBytes: number;
  availableBytes: number;
  totalQuotaBytes: number;
  percentUsed: number;
}

export interface QuotaEntry {
  path: string;
  size: number;
  timestamp: number;
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

export class QuotaManager {
  private config: SandboxConfig;
  private quotaFilePath: string;
  private quotaData: Map<string, QuotaEntry>;
  
  constructor(config: SandboxConfig) {
    this.config = config;
    this.quotaFilePath = path.join(config.sandboxRoot, '.mcp-quota.json');
    this.quotaData = new Map();
  }
  
  /**
   * Initialize quota tracking by loading existing data or creating new
   */
  async initialize(): Promise<void> {
    try {
      await this.loadQuotaData();
    } catch (error) {
      // If quota file doesn't exist, scan directory
      await this.rebuildQuotaData();
    }
  }
  
  /**
   * Load quota data from disk
   */
  private async loadQuotaData(): Promise<void> {
    const data = await fs.promises.readFile(this.quotaFilePath, 'utf-8');
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid quota file format');
    }
    
    this.quotaData.clear();
    for (const entry of parsed) {
      this.quotaData.set(entry.path, entry);
    }
  }
  
  /**
   * Save quota data to disk
   */
  private async saveQuotaData(): Promise<void> {
    const data = Array.from(this.quotaData.values());
    await fs.promises.writeFile(
      this.quotaFilePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }
  
  /**
   * Rebuild quota data by scanning the sandbox directory
   */
  async rebuildQuotaData(): Promise<void> {
    this.quotaData.clear();
    await this.scanDirectory(this.config.sandboxRoot);
    await this.saveQuotaData();
  }
  
  /**
   * Recursively scan directory and add files to quota tracking
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip the quota file itself
      if (entry.name === '.mcp-quota.json') {
        continue;
      }
      
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile()) {
        const stats = await fs.promises.stat(fullPath);
        const relativePath = path.relative(this.config.sandboxRoot, fullPath);
        
        this.quotaData.set(relativePath, {
          path: relativePath,
          size: stats.size,
          timestamp: Date.now()
        });
      } else if (entry.isDirectory()) {
        await this.scanDirectory(fullPath);
      }
    }
  }
  
  /**
   * Check if operation would exceed quota
   */
  checkQuota(additionalBytes: number, filePath?: string): void {
    const currentUsage = this.getCurrentUsage();
    let adjustedUsage = currentUsage;
    
    // If updating existing file, subtract its current size
    if (filePath) {
      const relativePath = path.relative(this.config.sandboxRoot, filePath);
      const existing = this.quotaData.get(relativePath);
      if (existing) {
        adjustedUsage -= existing.size;
      }
    }
    
    if (adjustedUsage + additionalBytes > this.config.quotaBytes) {
      throw new QuotaError(
        `Operation would exceed quota. ` +
        `Current: ${(adjustedUsage / 1024 / 1024).toFixed(2)} MB, ` +
        `Requested: ${(additionalBytes / 1024 / 1024).toFixed(2)} MB, ` +
        `Quota: ${(this.config.quotaBytes / 1024 / 1024).toFixed(2)} MB`
      );
    }
    
    if (additionalBytes > this.config.maxFileSizeBytes) {
      throw new QuotaError(
        `File size exceeds maximum allowed. ` +
        `Size: ${(additionalBytes / 1024 / 1024).toFixed(2)} MB, ` +
        `Max: ${(this.config.maxFileSizeBytes / 1024 / 1024).toFixed(2)} MB`
      );
    }
  }
  
  /**
   * Update quota after file operation
   */
  async updateQuota(filePath: string, newSize: number): Promise<void> {
    const relativePath = path.relative(this.config.sandboxRoot, filePath);
    
    if (newSize === 0) {
      // File was deleted
      this.quotaData.delete(relativePath);
    } else {
      // File was created or updated
      this.quotaData.set(relativePath, {
        path: relativePath,
        size: newSize,
        timestamp: Date.now()
      });
    }
    
    await this.saveQuotaData();
  }
  
  /**
   * Get current usage in bytes
   */
  getCurrentUsage(): number {
    let total = 0;
    for (const entry of this.quotaData.values()) {
      total += entry.size;
    }
    return total;
  }
  
  /**
   * Get quota information
   */
  getQuotaInfo(): QuotaInfo {
    const usedBytes = this.getCurrentUsage();
    const totalQuotaBytes = this.config.quotaBytes;
    const availableBytes = Math.max(0, totalQuotaBytes - usedBytes);
    const percentUsed = (usedBytes / totalQuotaBytes) * 100;
    
    return {
      usedBytes,
      availableBytes,
      totalQuotaBytes,
      percentUsed
    };
  }
  
  /**
   * Clean up quota entries for files that no longer exist
   */
  async cleanupQuota(): Promise<void> {
    const toRemove: string[] = [];
    
    for (const [relativePath, entry] of this.quotaData.entries()) {
      const fullPath = path.join(this.config.sandboxRoot, relativePath);
      try {
        await fs.promises.access(fullPath);
      } catch {
        // File doesn't exist
        toRemove.push(relativePath);
      }
    }
    
    for (const path of toRemove) {
      this.quotaData.delete(path);
    }
    
    if (toRemove.length > 0) {
      await this.saveQuotaData();
    }
  }
}