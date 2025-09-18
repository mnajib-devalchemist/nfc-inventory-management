/**
 * HEIC File Support and Security Validation
 * Implements comprehensive HEIC format handling with security-focused validation
 * and client-side conversion capabilities for iOS Safari compatibility
 */

/**
 * HEIC file detection patterns
 */
const HEIC_SIGNATURES = {
  // HEIC file type box signature (ISO Base Media File Format)
  HEIC_FTYP: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // "ftypheic"
  HEIC_MIFF: [0x66, 0x74, 0x79, 0x70, 0x6D, 0x69, 0x66, 0x31], // "ftypmif1"
  HEIC_MSF1: [0x66, 0x74, 0x79, 0x70, 0x6D, 0x73, 0x66, 0x31], // "ftypmsf1"
  HEIC_AVIF: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], // "ftypavif"
};

/**
 * HEIC validation result
 */
export interface HEICValidationResult {
  isHEIC: boolean;
  isValid: boolean;
  format: 'heic' | 'heif' | 'avif' | 'unknown';
  hasValidSignature: boolean;
  securityChecks: {
    sizeValid: boolean;
    signatureValid: boolean;
    noMaliciousPatterns: boolean;
    metadataClean: boolean;
  };
  error?: string;
  conversionNeeded: boolean;
}

/**
 * HEIC conversion result
 */
export interface HEICConversionResult {
  success: boolean;
  convertedBlob?: Blob;
  originalFormat: string;
  targetFormat: string;
  originalSize: number;
  convertedSize: number;
  compressionRatio: number;
  error?: string;
  processingTime: number;
}

/**
 * Check if file is HEIC/HEIF format with comprehensive validation
 */
export async function validateHEICFile(file: File): Promise<HEICValidationResult> {
  const startTime = Date.now();

  try {
    // Initial file type checks
    const isHEICMimeType = file.type === 'image/heic' || file.type === 'image/heif';
    const isHEICExtension = /\.(heic|heif)$/i.test(file.name);

    // Read file header for signature validation
    const headerBuffer = await readFileHeader(file, 32);
    const headerBytes = new Uint8Array(headerBuffer);

    // Check for HEIC signatures in file header
    const signatureCheck = checkHEICSignatures(headerBytes);

    // Security validation
    const securityChecks = await performSecurityValidation(file, headerBytes);

    // Determine actual format
    let format: 'heic' | 'heif' | 'avif' | 'unknown' = 'unknown';
    if (signatureCheck.isHEIC) {
      if (signatureCheck.format === 'avif') {
        format = 'avif';
      } else {
        format = isHEICExtension || isHEICMimeType ? 'heic' : 'heif';
      }
    }

    const isHEIC = signatureCheck.isHEIC || isHEICMimeType || isHEICExtension;
    const isValid = isHEIC &&
                   signatureCheck.isValid &&
                   securityChecks.sizeValid &&
                   securityChecks.signatureValid &&
                   securityChecks.noMaliciousPatterns;

    // Determine if conversion is needed (for Safari compatibility)
    const conversionNeeded = isHEIC && !isBrowserHEICSupported();

    const result: HEICValidationResult = {
      isHEIC,
      isValid,
      format,
      hasValidSignature: signatureCheck.isValid,
      securityChecks,
      conversionNeeded,
    };

    if (!isValid) {
      result.error = 'HEIC file validation failed: ' +
        (!securityChecks.sizeValid ? 'Invalid file size' :
         !securityChecks.signatureValid ? 'Invalid file signature' :
         !securityChecks.noMaliciousPatterns ? 'Potentially malicious content' :
         !securityChecks.metadataClean ? 'Suspicious metadata' :
         'Unknown validation error');
    }

    console.log(`📸 HEIC Validation completed in ${Date.now() - startTime}ms`, result);

    return result;

  } catch (error) {
    console.error('❌ HEIC validation error:', error);

    return {
      isHEIC: false,
      isValid: false,
      format: 'unknown',
      hasValidSignature: false,
      securityChecks: {
        sizeValid: false,
        signatureValid: false,
        noMaliciousPatterns: false,
        metadataClean: false,
      },
      error: `HEIC validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      conversionNeeded: false,
    };
  }
}

/**
 * Convert HEIC file to JPEG using Canvas API (client-side)
 */
export async function convertHEICToJPEG(file: File, quality: number = 0.85): Promise<HEICConversionResult> {
  const startTime = Date.now();

  try {
    // Validate the HEIC file first
    const validation = await validateHEICFile(file);

    if (!validation.isValid) {
      throw new Error(`Invalid HEIC file: ${validation.error}`);
    }

    // Try browser native HEIC support first
    if (isBrowserHEICSupported()) {
      console.log('📸 Browser supports HEIC natively, attempting direct conversion');

      const convertedBlob = await convertWithCanvas(file, 'image/jpeg', quality);

      return {
        success: true,
        convertedBlob,
        originalFormat: validation.format,
        targetFormat: 'jpeg',
        originalSize: file.size,
        convertedSize: convertedBlob.size,
        compressionRatio: file.size / convertedBlob.size,
        processingTime: Date.now() - startTime,
      };
    }

    // Fallback to server-side conversion if needed
    console.log('📸 Browser does not support HEIC, using server-side conversion');

    const convertedBlob = await convertHEICOnServer(file);

    return {
      success: true,
      convertedBlob,
      originalFormat: validation.format,
      targetFormat: 'jpeg',
      originalSize: file.size,
      convertedSize: convertedBlob.size,
      compressionRatio: file.size / convertedBlob.size,
      processingTime: Date.now() - startTime,
    };

  } catch (error) {
    console.error('❌ HEIC conversion error:', error);

    return {
      success: false,
      originalFormat: 'heic',
      targetFormat: 'jpeg',
      originalSize: file.size,
      convertedSize: 0,
      compressionRatio: 0,
      error: `HEIC conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Check if browser supports HEIC natively
 */
export function isBrowserHEICSupported(): boolean {
  if (typeof window === 'undefined') return false;

  // Create a test canvas to check HEIC support
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return false;

  // Test if browser can decode HEIC
  const img = new Image();
  img.src = 'data:image/heic;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  return img.complete && img.naturalWidth > 0;
}

/**
 * Get HEIC file metadata safely
 */
export async function getHEICMetadata(file: File): Promise<{
  width?: number;
  height?: number;
  colorSpace?: string;
  hasExif: boolean;
  creationDate?: Date;
  error?: string;
}> {
  try {
    // Read a larger portion of the file to parse metadata
    const buffer = await readFileHeader(file, 2048);
    const bytes = new Uint8Array(buffer);

    // Parse basic HEIC metadata (simplified implementation)
    const metadata = parseHEICMetadata(bytes);

    return {
      ...metadata,
    };

  } catch (error) {
    console.error('❌ HEIC metadata extraction error:', error);

    return {
      hasExif: false,
      error: `Metadata extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Read file header bytes
 */
async function readFileHeader(file: File, bytes: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };

    reader.onerror = () => reject(new Error('File reading failed'));

    // Read only the specified number of bytes
    const slice = file.slice(0, bytes);
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Check HEIC file signatures
 */
function checkHEICSignatures(bytes: Uint8Array): { isHEIC: boolean; isValid: boolean; format: string } {
  // Check for HEIC signatures starting from various offsets
  for (let offset = 0; offset < Math.min(bytes.length - 8, 16); offset++) {
    const slice = bytes.slice(offset, offset + 8);

    for (const [formatName, signature] of Object.entries(HEIC_SIGNATURES)) {
      if (arraysEqual(slice, signature)) {
        return {
          isHEIC: true,
          isValid: true,
          format: formatName.toLowerCase().replace('heic_', ''),
        };
      }
    }
  }

  return { isHEIC: false, isValid: false, format: 'unknown' };
}

/**
 * Perform comprehensive security validation
 */
async function performSecurityValidation(file: File, headerBytes: Uint8Array): Promise<{
  sizeValid: boolean;
  signatureValid: boolean;
  noMaliciousPatterns: boolean;
  metadataClean: boolean;
}> {
  // Size validation (reasonable limits for HEIC files)
  const sizeValid = file.size > 1024 && file.size < 50 * 1024 * 1024; // 1KB - 50MB

  // Signature validation
  const signatureCheck = checkHEICSignatures(headerBytes);
  const signatureValid = signatureCheck.isValid;

  // Check for malicious patterns in header
  const noMaliciousPatterns = !containsMaliciousPatterns(headerBytes);

  // Basic metadata safety check
  const metadataClean = await checkMetadataSafety(file);

  return {
    sizeValid,
    signatureValid,
    noMaliciousPatterns,
    metadataClean,
  };
}

/**
 * Check for potentially malicious patterns
 */
function containsMaliciousPatterns(bytes: Uint8Array): boolean {
  // Check for suspicious patterns that might indicate malformed or malicious files
  const maliciousPatterns = [
    // Executable signatures
    [0x4D, 0x5A], // MZ (Windows executable)
    [0x7F, 0x45, 0x4C, 0x46], // ELF (Linux executable)
    // Script patterns
    [0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74], // <script
    [0x6A, 0x61, 0x76, 0x61, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74], // javascript
  ];

  for (const pattern of maliciousPatterns) {
    if (findPattern(bytes, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check metadata safety
 */
async function checkMetadataSafety(file: File): Promise<boolean> {
  try {
    // For now, we'll do basic checks. In production, this would be more comprehensive
    const filename = file.name.toLowerCase();

    // Check for suspicious file names
    const suspiciousPatterns = ['.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.js'];

    return !suspiciousPatterns.some(pattern => filename.includes(pattern));
  } catch (error) {
    console.error('❌ Metadata safety check error:', error);
    return false;
  }
}

/**
 * Convert using Canvas API
 */
async function convertWithCanvas(file: File, targetMimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw image to canvas
        ctx.drawImage(img, 0, 0);

        // Convert to target format
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas conversion failed'));
          }
        }, targetMimeType, quality);

      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Image loading failed'));

    // Create object URL for the file
    const objectURL = URL.createObjectURL(file);
    img.src = objectURL;

    // Clean up after conversion
    img.onload = function() {
      URL.revokeObjectURL(objectURL);
      (img.onload as any)();
    };
  });
}

/**
 * Convert HEIC on server (fallback)
 */
async function convertHEICOnServer(file: File): Promise<Blob> {
  const formData = new FormData();
  formData.append('heicFile', file);

  const response = await fetch('/api/v1/utils/convert-heic', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Server conversion failed: ${response.status} ${response.statusText}`);
  }

  return await response.blob();
}

/**
 * Parse basic HEIC metadata
 */
function parseHEICMetadata(bytes: Uint8Array): {
  width?: number;
  height?: number;
  hasExif: boolean;
  colorSpace?: string;
} {
  // Simplified HEIC metadata parsing
  // In production, this would use a proper HEIC parser library

  const hasExif = findPattern(bytes, [0x45, 0x78, 0x69, 0x66]); // "Exif"

  return {
    hasExif,
    // TODO: Implement proper HEIC metadata parsing
    // width, height, colorSpace would be extracted from the file structure
    colorSpace: undefined,
  };
}

/**
 * Helper functions
 */
function arraysEqual(a: Uint8Array, b: number[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

function findPattern(bytes: Uint8Array, pattern: number[]): boolean {
  for (let i = 0; i <= bytes.length - pattern.length; i++) {
    let found = true;

    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) {
        found = false;
        break;
      }
    }

    if (found) return true;
  }

  return false;
}