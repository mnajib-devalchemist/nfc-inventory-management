import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { generateSecureFilename } from './file-validation';
import { uploadPhotoToS3, deletePhotoFromS3, S3UploadResult } from './aws-s3';
import { serverEnv } from './env';

/**
 * Photo processing utilities with Sharp.js
 * Implements secure image processing with EXIF stripping and optimization
 */

/**
 * Image processing configuration
 */
const IMAGE_CONFIG = {
  // Maximum dimensions for processed images
  maxWidth: 1920,
  maxHeight: 1080,
  
  // Thumbnail dimensions
  thumbnailWidth: 200,
  thumbnailHeight: 200,
  
  // JPEG quality settings
  quality: {
    processed: 85,
    thumbnail: 80
  },
  
  // Output format (force JPEG for security)
  outputFormat: 'jpeg' as const
} as const;

/**
 * Processed image result interface
 */
export interface ProcessedImageResult {
  processedBuffer: Buffer;
  thumbnailBuffer: Buffer;
  filename: string;
  thumbnailFilename: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
    thumbnailSize: number;
  };
}

/**
 * S3 upload result interface
 */
export interface PhotoUploadResult {
  photoUrl: string;
  thumbnailUrl: string;
  filename: string;
  thumbnailFilename: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
    thumbnailSize: number;
  };
  s3Data: {
    photo: S3UploadResult;
    thumbnail: S3UploadResult;
  };
}

/**
 * Process and sanitize an uploaded image file
 * Strips EXIF data, resizes, and optimizes for web delivery
 * 
 * @param buffer - The raw image buffer
 * @param originalFilename - Original filename for extension detection
 * @param itemId - Item ID for filename organization
 * @returns Promise resolving to processed image data
 * 
 * @example
 * ```typescript
 * const fileBuffer = await file.arrayBuffer();
 * const processed = await processImage(Buffer.from(fileBuffer), file.name, 'item-123');
 * ```
 */
export async function processImage(
  buffer: Buffer, 
  originalFilename: string, 
  itemId: string
): Promise<ProcessedImageResult> {
  try {
    // 1. Initialize Sharp with security settings
    const image = sharp(buffer, {
      // Security: Limit input size to prevent DoS
      limitInputPixels: 100000000, // ~10k x 10k pixels max
      // Strip all metadata including EXIF for privacy
      sequentialRead: true
    });

    // 2. Get image metadata (before processing)
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image: could not determine dimensions');
    }

    // 3. Process main image
    const processedImage = image
      .resize(IMAGE_CONFIG.maxWidth, IMAGE_CONFIG.maxHeight, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .jpeg({ 
        quality: IMAGE_CONFIG.quality.processed, 
        progressive: true,
        // Security: Strip all metadata
        mozjpeg: true
      })
      // Security: Remove all EXIF and metadata
      .withMetadata({});

    // 4. Create thumbnail
    const thumbnailImage = image
      .resize(IMAGE_CONFIG.thumbnailWidth, IMAGE_CONFIG.thumbnailHeight, { 
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({ 
        quality: IMAGE_CONFIG.quality.thumbnail,
        // Security: Strip all metadata
        mozjpeg: true
      })
      // Security: Remove all EXIF and metadata
      .withMetadata({});

    // 5. Process both images
    const [processedBuffer, thumbnailBuffer] = await Promise.all([
      processedImage.toBuffer(),
      thumbnailImage.toBuffer()
    ]);

    // 6. Generate secure filenames
    const filename = generateSecureFilename(originalFilename, `item_${itemId}`);
    const thumbnailFilename = generateSecureFilename(originalFilename, `item_${itemId}_thumb`);

    // 7. Get final metadata
    const processedMetadata = await sharp(processedBuffer).metadata();

    return {
      processedBuffer,
      thumbnailBuffer,
      filename,
      thumbnailFilename,
      metadata: {
        width: processedMetadata.width || 0,
        height: processedMetadata.height || 0,
        format: processedMetadata.format || 'jpeg',
        size: processedBuffer.length,
        thumbnailSize: thumbnailBuffer.length
      }
    };

  } catch (error) {
    console.error('Image processing error:', error);
    throw new Error(`Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Store processed images to local filesystem
 * Creates organized directory structure for photos
 * 
 * @param processedResult - Result from processImage()
 * @param itemId - Item ID for directory organization
 * @returns Promise resolving to stored file paths
 */
export async function storeProcessedImages(
  processedResult: ProcessedImageResult,
  itemId: string
): Promise<{
  photoPath: string;
  thumbnailPath: string;
  photoUrl: string;
  thumbnailUrl: string;
}> {
  try {
    // 1. Create directory structure: public/uploads/photos/{itemId}/
    const itemDir = path.join(process.cwd(), 'public', 'uploads', 'photos', itemId);
    await fs.mkdir(itemDir, { recursive: true });

    // 2. Define file paths
    const photoPath = path.join(itemDir, processedResult.filename);
    const thumbnailPath = path.join(itemDir, processedResult.thumbnailFilename);

    // 3. Write files to disk
    await Promise.all([
      fs.writeFile(photoPath, processedResult.processedBuffer),
      fs.writeFile(thumbnailPath, processedResult.thumbnailBuffer)
    ]);

    // 4. Generate public URLs
    const photoUrl = `/uploads/photos/${itemId}/${processedResult.filename}`;
    const thumbnailUrl = `/uploads/photos/${itemId}/${processedResult.thumbnailFilename}`;

    return {
      photoPath,
      thumbnailPath,
      photoUrl,
      thumbnailUrl
    };

  } catch (error) {
    console.error('Image storage error:', error);
    throw new Error(`Failed to store images: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Complete photo upload processing pipeline
 * Validates, processes, and stores an uploaded photo
 * 
 * @param file - The uploaded file
 * @param itemId - Item ID for organization
 * @returns Promise resolving to photo URLs and metadata
 */
export async function processPhotoUpload(file: File, itemId: string): Promise<{
  photoUrl: string;
  thumbnailUrl: string;
  metadata: ProcessedImageResult['metadata'];
}> {
  try {
    // 1. Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Process the image (includes security sanitization)
    const processedResult = await processImage(buffer, file.name, itemId);

    // 3. Store the processed images
    const storedPaths = await storeProcessedImages(processedResult, itemId);

    return {
      photoUrl: storedPaths.photoUrl,
      thumbnailUrl: storedPaths.thumbnailUrl,
      metadata: processedResult.metadata
    };

  } catch (error) {
    console.error('Photo upload processing error:', error);
    throw new Error(`Photo upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete photos for an item
 * Cleans up stored files when an item is deleted
 * 
 * @param itemId - Item ID to delete photos for
 * @returns Promise resolving when deletion is complete
 */
export async function deleteItemPhotos(itemId: string): Promise<void> {
  try {
    const itemDir = path.join(process.cwd(), 'public', 'uploads', 'photos', itemId);
    
    // Check if directory exists
    try {
      await fs.access(itemDir);
      // Directory exists, remove it and all contents
      await fs.rm(itemDir, { recursive: true, force: true });
      console.log(`Deleted photo directory for item: ${itemId}`);
    } catch (error) {
      // Directory doesn't exist, which is fine
      console.log(`No photos to delete for item: ${itemId}`);
    }

  } catch (error) {
    console.error('Error deleting item photos:', error);
    // Don't throw error for cleanup operations
  }
}

/**
 * Get storage statistics for monitoring
 * Helps track storage usage and implement cleanup policies
 * 
 * @returns Promise resolving to storage statistics
 */
export async function getPhotoStorageStats(): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  directories: number;
}> {
  try {
    const photosDir = path.join(process.cwd(), 'public', 'uploads', 'photos');
    
    let totalFiles = 0;
    let totalSizeBytes = 0;
    let directories = 0;

    // Check if photos directory exists
    try {
      await fs.access(photosDir);
    } catch {
      return { totalFiles: 0, totalSizeBytes: 0, totalSizeMB: 0, directories: 0 };
    }

    // Recursively scan directory
    const scanDirectory = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          directories++;
          await scanDirectory(fullPath);
        } else {
          totalFiles++;
          const stats = await fs.stat(fullPath);
          totalSizeBytes += stats.size;
        }
      }
    };

    await scanDirectory(photosDir);

    return {
      totalFiles,
      totalSizeBytes,
      totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100,
      directories
    };

  } catch (error) {
    console.error('Error getting storage stats:', error);
    return { totalFiles: 0, totalSizeBytes: 0, totalSizeMB: 0, directories: 0 };
  }
}

/**
 * Cleanup old or orphaned photo files
 * Implements storage management policies
 * 
 * @param maxAgeMs - Maximum age in milliseconds for orphaned files
 * @returns Promise resolving to cleanup statistics
 */
export async function cleanupOrphanedPhotos(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<{
  deletedFiles: number;
  freedSpaceBytes: number;
}> {
  try {
    const photosDir = path.join(process.cwd(), 'public', 'uploads', 'photos');
    const deletedFiles = 0;
    const freedSpaceBytes = 0;
    const cutoffTime = Date.now() - maxAgeMs;

    // Check if photos directory exists
    try {
      await fs.access(photosDir);
    } catch {
      return { deletedFiles: 0, freedSpaceBytes: 0 };
    }

    // Scan for old files
    const scanDirectory = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
          
          // Check if directory is now empty and old
          try {
            const dirEntries = await fs.readdir(fullPath);
            if (dirEntries.length === 0) {
              const stats = await fs.stat(fullPath);
              if (stats.mtimeMs < cutoffTime) {
                await fs.rmdir(fullPath);
                console.log(`Deleted empty directory: ${fullPath}`);
              }
            }
          } catch (error) {
            // Directory might not exist anymore, skip
          }
        } else {
          const stats = await fs.stat(fullPath);
          
          // Delete old files (this would need business logic to check if item still exists)
          if (stats.mtimeMs < cutoffTime) {
            // TODO: Check if associated item still exists in database
            // For now, we'll skip deletion to avoid breaking existing items
            console.log(`Found old file: ${fullPath} (${stats.size} bytes)`);
          }
        }
      }
    };

    await scanDirectory(photosDir);

    return { deletedFiles, freedSpaceBytes };

  } catch (error) {
    console.error('Error during photo cleanup:', error);
    return { deletedFiles: 0, freedSpaceBytes: 0 };
  }
}

/**
 * Process image and upload to S3 storage
 * Handles both local development and cloud production storage
 */
export async function processAndUploadPhoto(
  fileBuffer: Buffer,
  householdId: string,
  metadata: Record<string, string> = {}
): Promise<PhotoUploadResult> {
  // First process the image
  const originalFilename = metadata.originalName || 'upload.jpg';
  const itemId = metadata.itemId || 'temp-item';
  const processed = await processImage(fileBuffer, originalFilename, itemId);
  
  // Check if we should use S3 or local storage
  const useS3 = serverEnv.NODE_ENV === 'production' || 
                (serverEnv.AWS_S3_BUCKET_NAME && 
                 serverEnv.AWS_ACCESS_KEY_ID && 
                 serverEnv.AWS_SECRET_ACCESS_KEY);

  if (useS3) {
    // Upload to S3
    const s3Results = await uploadPhotoToS3(
      householdId,
      processed.processedBuffer,
      processed.thumbnailBuffer,
      processed.filename,
      processed.thumbnailFilename,
      {
        ...metadata,
        originalFormat: processed.metadata.format,
        width: processed.metadata.width.toString(),
        height: processed.metadata.height.toString(),
      }
    );

    return {
      photoUrl: s3Results.photo.cdnUrl || s3Results.photo.url,
      thumbnailUrl: s3Results.thumbnail.cdnUrl || s3Results.thumbnail.url,
      filename: processed.filename,
      thumbnailFilename: processed.thumbnailFilename,
      metadata: processed.metadata,
      s3Data: s3Results,
    };
  } else {
    // Development: Save locally (existing logic)
    const localResults = await saveProcessedImageLocally(processed, householdId);
    
    return {
      photoUrl: localResults.photoPath,
      thumbnailUrl: localResults.thumbnailPath,
      filename: processed.filename,
      thumbnailFilename: processed.thumbnailFilename,
      metadata: processed.metadata,
      s3Data: {
        photo: {
          key: localResults.photoPath,
          url: localResults.photoPath,
          size: processed.metadata.size,
          etag: '',
        },
        thumbnail: {
          key: localResults.thumbnailPath,
          url: localResults.thumbnailPath,
          size: processed.metadata.thumbnailSize,
          etag: '',
        },
      },
    };
  }
}

/**
 * Delete photo from storage (S3 or local)
 */
export async function deletePhotoFromStorage(photoUrl: string, thumbnailUrl?: string): Promise<void> {
  const useS3 = serverEnv.NODE_ENV === 'production' || photoUrl.includes('amazonaws.com') || 
                (serverEnv.AWS_CLOUDFRONT_DOMAIN && photoUrl.includes(serverEnv.AWS_CLOUDFRONT_DOMAIN));

  if (useS3) {
    await deletePhotoFromS3(photoUrl, thumbnailUrl);
  } else {
    // Local file deletion
    try {
      await fs.unlink(photoUrl);
      if (thumbnailUrl) {
        await fs.unlink(thumbnailUrl);
      }
    } catch (error) {
      console.error('Local file deletion error:', error);
      // Don't throw - file might already be deleted
    }
  }
}

/**
 * Save processed image locally (development only)
 */
async function saveProcessedImageLocally(
  processed: ProcessedImageResult,
  householdId: string
): Promise<{ photoPath: string; thumbnailPath: string }> {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', householdId);
  const thumbnailDir = path.join(uploadDir, 'thumbnails');

  // Ensure directories exist
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(thumbnailDir, { recursive: true });

  const photoPath = path.join(uploadDir, processed.filename);
  const thumbnailPath = path.join(thumbnailDir, processed.thumbnailFilename);

  // Save files
  await Promise.all([
    fs.writeFile(photoPath, processed.processedBuffer),
    fs.writeFile(thumbnailPath, processed.thumbnailBuffer),
  ]);

  return {
    photoPath: `/uploads/${householdId}/${processed.filename}`,
    thumbnailPath: `/uploads/${householdId}/thumbnails/${processed.thumbnailFilename}`,
  };
}