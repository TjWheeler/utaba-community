import * as path from 'path';

export interface ContentType {
  type: string;
  isBinary: boolean;
  encoding?: string;
}

export interface FileReadResult {
  content: string;
  encoding: 'utf-8' | 'base64';
  contentType: string;
  size: number;
  isBinary: boolean;
}

/**
 * Content type detection utility that combines multiple detection methods
 * for accurate binary vs text classification
 */
export class ContentTypeDetector {
  // Common binary file magic numbers
  private static readonly MAGIC_NUMBERS = new Map<string, ContentType>([
    // Images
    ['89504e47', { type: 'image/png', isBinary: true }],
    ['ffd8ff', { type: 'image/jpeg', isBinary: true }],
    ['47494638', { type: 'image/gif', isBinary: true }],
    ['52494646', { type: 'image/webp', isBinary: true }], // RIFF (WebP container)
    ['424d', { type: 'image/bmp', isBinary: true }],
    ['49492a00', { type: 'image/tiff', isBinary: true }], // TIFF little-endian
    ['4d4d002a', { type: 'image/tiff', isBinary: true }], // TIFF big-endian
    
    // Documents
    ['504b0304', { type: 'application/zip', isBinary: true }], // ZIP, DOCX, XLSX, etc.
    ['504b0506', { type: 'application/zip', isBinary: true }], // ZIP empty
    ['504b0708', { type: 'application/zip', isBinary: true }], // ZIP spanned
    ['25504446', { type: 'application/pdf', isBinary: true }], // %PDF
    ['d0cf11e0', { type: 'application/msoffice', isBinary: true }], // MS Office
    
    // Archives
    ['1f8b08', { type: 'application/gzip', isBinary: true }],
    ['425a68', { type: 'application/x-bzip2', isBinary: true }], // BZh
    ['377abcaf', { type: 'application/x-7z-compressed', isBinary: true }],
    ['526172211a0700', { type: 'application/x-rar-compressed', isBinary: true }], // Rar!
    
    // Executables
    ['4d5a', { type: 'application/x-msdownload', isBinary: true }], // MZ (Windows PE)
    ['7f454c46', { type: 'application/x-elf', isBinary: true }], // ELF
    ['cafebabe', { type: 'application/java-vm', isBinary: true }], // Java class
    ['feedface', { type: 'application/x-mach-binary', isBinary: true }], // Mach-O
    
    // Media
    ['000001ba', { type: 'video/mpeg', isBinary: true }], // MPEG video
    ['000001b3', { type: 'video/mpeg', isBinary: true }], // MPEG video
    ['66747970', { type: 'video/mp4', isBinary: true }], // MP4
    ['494433', { type: 'audio/mpeg', isBinary: true }], // ID3 (MP3)
    ['fff3', { type: 'audio/mpeg', isBinary: true }], // MP3
    ['fff2', { type: 'audio/mpeg', isBinary: true }], // MP3
    ['4f676753', { type: 'audio/ogg', isBinary: true }], // OggS
    ['52494646', { type: 'audio/wav', isBinary: true }], // RIFF (WAV container)
  ]);

  // Extension-based content type mapping  
  private static readonly EXTENSION_TYPES = new Map<string, ContentType>([
    // Text files
    ['.txt', { type: 'text/plain', isBinary: false }],
    ['.md', { type: 'text/markdown', isBinary: false }],
    ['.json', { type: 'application/json', isBinary: false }],
    ['.xml', { type: 'application/xml', isBinary: false }],
    ['.csv', { type: 'text/csv', isBinary: false }],
    ['.tsv', { type: 'text/tab-separated-values', isBinary: false }],
    ['.yaml', { type: 'application/x-yaml', isBinary: false }],
    ['.yml', { type: 'application/x-yaml', isBinary: false }],
    ['.toml', { type: 'application/toml', isBinary: false }],
    ['.ini', { type: 'text/plain', isBinary: false }],
    ['.cfg', { type: 'text/plain', isBinary: false }],
    ['.conf', { type: 'text/plain', isBinary: false }],
    ['.log', { type: 'text/plain', isBinary: false }],
    
    // Code files
    ['.js', { type: 'application/javascript', isBinary: false }],
    ['.ts', { type: 'application/typescript', isBinary: false }],
    ['.jsx', { type: 'application/javascript', isBinary: false }],
    ['.tsx', { type: 'application/typescript', isBinary: false }],
    ['.py', { type: 'text/x-python', isBinary: false }],
    ['.java', { type: 'text/x-java-source', isBinary: false }],
    ['.c', { type: 'text/x-c', isBinary: false }],
    ['.cpp', { type: 'text/x-c++', isBinary: false }],
    ['.h', { type: 'text/x-c', isBinary: false }],
    ['.hpp', { type: 'text/x-c++', isBinary: false }],
    ['.rs', { type: 'text/x-rust', isBinary: false }],
    ['.go', { type: 'text/x-go', isBinary: false }],
    ['.php', { type: 'application/x-httpd-php', isBinary: false }],
    ['.rb', { type: 'text/x-ruby', isBinary: false }],
    ['.sh', { type: 'application/x-shellscript', isBinary: false }],
    ['.bash', { type: 'application/x-shellscript', isBinary: false }],
    ['.zsh', { type: 'application/x-shellscript', isBinary: false }],
    ['.fish', { type: 'application/x-shellscript', isBinary: false }],
    ['.ps1', { type: 'application/x-powershell', isBinary: false }],
    ['.sql', { type: 'application/sql', isBinary: false }],
    ['.r', { type: 'text/x-r', isBinary: false }],
    ['.scala', { type: 'text/x-scala', isBinary: false }],
    ['.kt', { type: 'text/x-kotlin', isBinary: false }],
    ['.swift', { type: 'text/x-swift', isBinary: false }],
    ['.dart', { type: 'application/dart', isBinary: false }],
    
    // Web files
    ['.html', { type: 'text/html', isBinary: false }],
    ['.htm', { type: 'text/html', isBinary: false }],
    ['.css', { type: 'text/css', isBinary: false }],
    ['.scss', { type: 'text/x-scss', isBinary: false }],
    ['.sass', { type: 'text/x-sass', isBinary: false }],
    ['.less', { type: 'text/x-less', isBinary: false }],
    ['.vue', { type: 'text/x-vue', isBinary: false }],
    ['.svelte', { type: 'text/x-svelte', isBinary: false }],
    
    // Known binary extensions
    ['.png', { type: 'image/png', isBinary: true }],
    ['.jpg', { type: 'image/jpeg', isBinary: true }],
    ['.jpeg', { type: 'image/jpeg', isBinary: true }],
    ['.gif', { type: 'image/gif', isBinary: true }],
    ['.webp', { type: 'image/webp', isBinary: true }],
    ['.bmp', { type: 'image/bmp', isBinary: true }],
    ['.ico', { type: 'image/x-icon', isBinary: true }],
    ['.svg', { type: 'image/svg+xml', isBinary: false }], // SVG is text-based
    ['.pdf', { type: 'application/pdf', isBinary: true }],
    ['.zip', { type: 'application/zip', isBinary: true }],
    ['.tar', { type: 'application/x-tar', isBinary: true }],
    ['.gz', { type: 'application/gzip', isBinary: true }],
    ['.7z', { type: 'application/x-7z-compressed', isBinary: true }],
    ['.rar', { type: 'application/x-rar-compressed', isBinary: true }],
    ['.exe', { type: 'application/x-msdownload', isBinary: true }],
    ['.dll', { type: 'application/x-msdownload', isBinary: true }],
    ['.so', { type: 'application/x-sharedlib', isBinary: true }],
    ['.dylib', { type: 'application/x-sharedlib', isBinary: true }],
    ['.mp3', { type: 'audio/mpeg', isBinary: true }],
    ['.wav', { type: 'audio/wav', isBinary: true }],
    ['.mp4', { type: 'video/mp4', isBinary: true }],
    ['.avi', { type: 'video/x-msvideo', isBinary: true }],
    ['.mov', { type: 'video/quicktime', isBinary: true }],
  ]);

  /**
   * Detect content type using multiple methods
   */
  static detectType(filePath: string, buffer: Buffer): ContentType {
    // 1. Magic number detection (most reliable)
    const magicType = this.detectByMagicNumbers(buffer);
    if (magicType) {
      return magicType;
    }

    // 2. Extension-based detection  
    const extType = this.detectByExtension(filePath);
    if (extType) {
      return extType;
    }

    // 3. Heuristic analysis as fallback
    return this.detectByHeuristics(buffer);
  }

  /**
   * Detect by magic numbers (first few bytes)
   */
  private static detectByMagicNumbers(buffer: Buffer): ContentType | null {
    if (buffer.length === 0) {
      return { type: 'text/plain', isBinary: false };
    }

    // Check various magic number lengths
    for (const length of [14, 8, 6, 4, 3, 2]) {
      if (buffer.length >= length / 2) {
        const hex = buffer.slice(0, length / 2).toString('hex').toLowerCase();
        const contentType = this.MAGIC_NUMBERS.get(hex);
        if (contentType) {
          return contentType;
        }
      }
    }

    return null;
  }

  /**
   * Detect by file extension
   */
  private static detectByExtension(filePath: string): ContentType | null {
    const ext = path.extname(filePath).toLowerCase();
    return this.EXTENSION_TYPES.get(ext) || null;
  }

  /**
   * Heuristic analysis for text vs binary
   */
  private static detectByHeuristics(buffer: Buffer): ContentType {
    if (buffer.length === 0) {
      return { type: 'text/plain', isBinary: false };
    }

    // Sample first 8KB to determine if likely text
    const sampleSize = Math.min(8192, buffer.length);
    const sample = buffer.slice(0, sampleSize);
    
    // Count problematic bytes
    let nullBytes = 0;
    let nonPrintableBytes = 0;
    let utf8Errors = 0;

    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];
      
      // Null bytes are strong indicator of binary
      if (byte === 0) {
        nullBytes++;
        continue;
      }
      
      // Check for non-printable characters (excluding common whitespace)
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintableBytes++;
      }
    }

    // Try to decode as UTF-8 and count errors
    try {
      const decoded = sample.toString('utf-8');
      // Count replacement characters (indicates invalid UTF-8)
      utf8Errors = (decoded.match(/\uFFFD/g) || []).length;
    } catch {
      utf8Errors = sampleSize; // Failed to decode, treat as binary
    }

    // Calculate ratios
    const nullRatio = nullBytes / sampleSize;
    const nonPrintableRatio = nonPrintableBytes / sampleSize;
    const utf8ErrorRatio = utf8Errors / sampleSize;

    // Decision logic
    const isBinary = 
      nullRatio > 0 ||                           // Any null bytes = binary
      nonPrintableRatio > 0.1 ||                 // >10% non-printable = binary  
      utf8ErrorRatio > 0.05;                     // >5% UTF-8 errors = binary

    return {
      type: isBinary ? 'application/octet-stream' : 'text/plain',
      isBinary
    };
  }

  /**
   * Check if content is likely text based on buffer analysis
   */
  static isTextContent(buffer: Buffer): boolean {
    return !this.detectByHeuristics(buffer).isBinary;
  }

  /**
   * Get optimized encoding for content
   */
  static getOptimalEncoding(contentType: ContentType, requestedEncoding?: string): 'utf-8' | 'base64' {
    // Honor explicit request if compatible
    if (requestedEncoding === 'base64') {
      return 'base64';
    }
    
    if (requestedEncoding === 'utf-8' && !contentType.isBinary) {
      return 'utf-8';
    }
    
    // Default: use utf-8 for text, base64 for binary
    return contentType.isBinary ? 'base64' : 'utf-8';
  }
}
