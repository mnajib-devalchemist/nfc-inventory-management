/**
 * Secure file validation utilities
 * Implements comprehensive file security checks as required by SEC-003 risk mitigation
 */

/**
 * Allowed image MIME types for security
 */
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/webp'
] as const;

/**
 * File extension to MIME type mapping
 */
const EXTENSION_MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
} as const;

/**
 * Magic bytes for file header validation
 */
const FILE_SIGNATURES = {
  // JPEG files
  'image/jpeg': [
    [0xFF, 0xD8, 0xFF, 0xE0], // JPEG JFIF
    [0xFF, 0xD8, 0xFF, 0xE1], // JPEG EXIF
    [0xFF, 0xD8, 0xFF, 0xE2], // JPEG (Canon)
    [0xFF, 0xD8, 0xFF, 0xE3], // JPEG
    [0xFF, 0xD8, 0xFF, 0xE8], // JPEG
    [0xFF, 0xD8, 0xFF, 0xDB]  // JPEG raw
  ],
  // PNG files
  'image/png': [
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  ],
  // WebP files  
  'image/webp': [
    [0x52, 0x49, 0x46, 0x46] // RIFF header (WebP uses RIFF container)
  ]
} as const;

/**
 * Maximum file size in bytes (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum filename length to prevent path issues
 */
const MAX_FILENAME_LENGTH = 255;

/**
 * File validation result interface
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Validates an image file with comprehensive security checks
 * 
 * @param file - The file to validate
 * @returns Promise resolving to validation result with security checks
 * 
 * @example
 * ```typescript
 * const result = await validateImageFile(uploadedFile);
 * if (!result.valid) {
 *   console.error('File validation failed:', result.error);
 * }
 * ```
 */
export async function validateImageFile(file: File): Promise<FileValidationResult> {
  try {
    // 1. Basic null/undefined check
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    // 2. File size validation
    if (file.size > MAX_FILE_SIZE) {
      return { 
        valid: false, 
        error: `File size too large. Maximum ${MAX_FILE_SIZE / (1024 * 1024)}MB allowed.` 
      };
    }

    if (file.size === 0) {
      return { valid: false, error: 'File is empty' };
    }

    // 3. Filename validation (security critical)
    const filenameValidation = validateFilename(file.name);
    if (!filenameValidation.valid) {
      return filenameValidation;
    }

    // 4. MIME type validation
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
      return { 
        valid: false, 
        error: `Invalid file type. Only JPEG, PNG, and WebP images are allowed. Received: ${file.type}` 
      };
    }

    // 5. File extension validation (prevent double extension attacks)
    const extensionValidation = validateFileExtension(file.name, file.type);
    if (!extensionValidation.valid) {
      return extensionValidation;
    }

    // 6. File header validation (magic bytes check)
    const headerValidation = await validateFileHeader(file);
    if (!headerValidation.valid) {
      return headerValidation;
    }

    // 7. Content validation (basic image structure check)
    const contentValidation = await validateImageContent(file);
    if (!contentValidation.valid) {
      return contentValidation;
    }

    return { valid: true };

  } catch (error) {
    console.error('File validation error:', error);
    return { 
      valid: false, 
      error: 'File validation failed due to unexpected error' 
    };
  }
}

/**
 * Validates filename for security issues
 * Prevents directory traversal and malicious filename attacks
 */
function validateFilename(filename: string): FileValidationResult {
  // Check filename length
  if (filename.length > MAX_FILENAME_LENGTH) {
    return { 
      valid: false, 
      error: `Filename too long. Maximum ${MAX_FILENAME_LENGTH} characters allowed.` 
    };
  }

  // Check for directory traversal patterns
  const dangerousPatterns = [
    '../',
    '..\\',
    './',
    '.\\',
    '//',
    '\\\\',
    '\0', // Null byte injection
    '\r',
    '\n'
  ];

  for (const pattern of dangerousPatterns) {
    if (filename.includes(pattern)) {
      return { 
        valid: false, 
        error: 'Filename contains potentially dangerous characters' 
      };
    }
  }

  // Check for reserved characters
  const reservedChars = /[<>:"|?*]/;
  if (reservedChars.test(filename)) {
    return { 
      valid: false, 
      error: 'Filename contains reserved characters' 
    };
  }

  // Check for Windows reserved names
  const windowsReserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  if (windowsReserved.test(filename)) {
    return { 
      valid: false, 
      error: 'Filename uses a reserved system name' 
    };
  }

  return { valid: true };
}

/**
 * Validates file extension matches MIME type
 * Prevents file type spoofing attacks
 */
function validateFileExtension(filename: string, mimeType: string): FileValidationResult {
  const extension = getFileExtension(filename);
  
  if (!extension) {
    return { valid: false, error: 'File must have a valid extension' };
  }

  const expectedMimeType = EXTENSION_MIME_MAP[extension as keyof typeof EXTENSION_MIME_MAP];
  
  if (!expectedMimeType) {
    return { 
      valid: false, 
      error: `Unsupported file extension: ${extension}` 
    };
  }

  if (expectedMimeType !== mimeType) {
    return { 
      valid: false, 
      error: `File extension ${extension} does not match file type ${mimeType}` 
    };
  }

  return { valid: true };
}

/**
 * Validates file header (magic bytes) to ensure file type authenticity
 * Critical security check to prevent file type spoofing
 */
async function validateFileHeader(file: File): Promise<FileValidationResult> {
  try {
    // Read first 16 bytes for signature checking
    const headerSize = 16;
    const headerBuffer = await file.slice(0, headerSize).arrayBuffer();
    const headerBytes = new Uint8Array(headerBuffer);

    const signatures = FILE_SIGNATURES[file.type as keyof typeof FILE_SIGNATURES];
    
    if (!signatures) {
      return { 
        valid: false, 
        error: `No signature validation available for ${file.type}` 
      };
    }

    // Check if any signature matches
    const signatureMatch = signatures.some(signature => 
      signature.every((byte, index) => headerBytes[index] === byte)
    );

    if (!signatureMatch) {
      return { 
        valid: false, 
        error: 'File header does not match expected format. File may be corrupted or not a valid image.' 
      };
    }

    return { valid: true };

  } catch (error) {
    return { 
      valid: false, 
      error: 'Could not read file header for validation' 
    };
  }
}

/**
 * Basic image content validation
 * Attempts to validate that the file is actually a readable image
 */
async function validateImageContent(file: File): Promise<FileValidationResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      
      // Basic dimension checks
      if (img.width === 0 || img.height === 0) {
        resolve({ 
          valid: false, 
          error: 'Image has invalid dimensions' 
        });
        return;
      }

      // Check for reasonable dimensions (prevent DoS via huge images)
      const maxDimension = 10000; // 10,000 pixels
      if (img.width > maxDimension || img.height > maxDimension) {
        resolve({ 
          valid: false, 
          error: `Image dimensions too large. Maximum ${maxDimension}x${maxDimension} pixels allowed.` 
        });
        return;
      }

      resolve({ valid: true });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ 
        valid: false, 
        error: 'File does not appear to be a valid image' 
      });
    };

    // Set timeout to prevent hanging
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      resolve({ 
        valid: false, 
        error: 'Image validation timeout - file may be corrupted' 
      });
    }, 5000);

    img.src = objectUrl;
  });
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string | null {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
    return null;
  }
  return filename.substring(lastDotIndex).toLowerCase();
}

/**
 * Generate a secure filename for storage
 * Prevents directory traversal and filename conflicts
 * 
 * @param originalFilename - The original filename from upload
 * @param prefix - Optional prefix for organization
 * @returns Secure filename safe for storage
 */
export function generateSecureFilename(originalFilename: string, prefix?: string): string {
  const extension = getFileExtension(originalFilename);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  
  const baseName = prefix ? `${prefix}_${timestamp}_${randomString}` : `${timestamp}_${randomString}`;
  
  return extension ? `${baseName}${extension}` : baseName;
}

/**
 * Validate multiple files at once
 * Useful for bulk uploads with consistent error handling
 */
export async function validateMultipleImageFiles(files: File[]): Promise<{
  validFiles: File[];
  invalidFiles: Array<{ file: File; error: string }>;
  allValid: boolean;
}> {
  const results = await Promise.all(
    files.map(async (file) => ({
      file,
      validation: await validateImageFile(file)
    }))
  );

  const validFiles = results
    .filter(r => r.validation.valid)
    .map(r => r.file);

  const invalidFiles = results
    .filter(r => !r.validation.valid)
    .map(r => ({ file: r.file, error: r.validation.error || 'Unknown error' }));

  return {
    validFiles,
    invalidFiles,
    allValid: invalidFiles.length === 0
  };
}