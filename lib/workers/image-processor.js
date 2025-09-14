/**
 * Image Processing Worker Thread
 *
 * This worker handles CPU-intensive image processing operations in isolation
 * to prevent blocking the main Node.js thread. Supports adaptive quality
 * targeting and multi-format processing.
 *
 * @category Worker Threads
 * @since 1.7.0
 */

const { parentPort, workerData } = require('worker_threads');
const sharp = require('sharp');

/**
 * Worker thread message handler
 */
parentPort.on('message', async (message) => {
  const { id, method, args } = message;

  try {
    let result;

    switch (method) {
      case 'processAdaptive':
        result = await processImageAdaptive(...args);
        break;
      case 'processMultiFormat':
        result = await processMultiFormat(...args);
        break;
      case 'processToFormat':
        result = await processToFormat(...args);
        break;
      case 'generateThumbnails':
        result = await generateThumbnails(...args);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({
      id,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }
});

/**
 * Process image with adaptive quality targeting to achieve target file size
 *
 * @param {Buffer} buffer - Input image buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processed image data
 */
async function processImageAdaptive(buffer, options = {}) {
  const {
    targetSizeKB = 100,
    maxWidth = 1200,
    maxHeight = 1200,
    format = 'jpeg',
    stripMetadata = true,
    progressive = true
  } = options;

  // Initialize Sharp with security limits
  const image = sharp(buffer, {
    limitInputPixels: 100000000, // ~10k x 10k pixels max
    sequentialRead: true
  });

  // Get original metadata
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid image: could not determine dimensions');
  }

  // Calculate optimal quality through binary search
  let quality = 85;
  let minQuality = 20;
  let maxQuality = 95;
  let processed;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    processed = await image
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFormat(format, {
        quality,
        progressive,
        mozjpeg: format === 'jpeg'
      })
      .withMetadata(stripMetadata ? {} : undefined)
      .toBuffer();

    const fileSizeKB = processed.length / 1024;

    // If size is within acceptable range (±5KB), we're done
    if (Math.abs(fileSizeKB - targetSizeKB) <= 5) {
      break;
    }

    // Adjust quality using binary search
    if (fileSizeKB > targetSizeKB) {
      maxQuality = quality;
      quality = Math.floor((minQuality + quality) / 2);
    } else {
      minQuality = quality;
      quality = Math.floor((quality + maxQuality) / 2);
    }

    // Prevent infinite loops
    if (maxQuality - minQuality <= 1) {
      break;
    }

    attempts++;
  }

  // Get final metadata
  const processedMetadata = await sharp(processed).metadata();

  return {
    buffer: processed,
    format,
    quality,
    compressionRatio: buffer.length / processed.length,
    fileSize: processed.length,
    fileSizeKB: processed.length / 1024,
    dimensions: {
      width: processedMetadata.width,
      height: processedMetadata.height
    },
    originalDimensions: {
      width: metadata.width,
      height: metadata.height
    },
    metadata: processedMetadata,
    attempts
  };
}

/**
 * Process image into multiple formats for progressive enhancement
 *
 * @param {Buffer} buffer - Input image buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Multi-format results
 */
async function processMultiFormat(buffer, options = {}) {
  const {
    formats = ['webp', 'avif', 'jpeg'],
    targetSizeKB = 100,
    maxWidth = 1200,
    maxHeight = 1200,
    stripMetadata = true,
    progressive = true
  } = options;

  const results = {};
  const errors = {};

  for (const format of formats) {
    try {
      results[format] = await processToFormat(buffer, {
        format,
        targetSizeKB,
        maxWidth,
        maxHeight,
        stripMetadata,
        progressive
      });
    } catch (error) {
      errors[format] = {
        message: error.message,
        name: error.name
      };

      // Continue with other formats even if one fails
      console.warn(`Failed to process ${format} format:`, error.message);
    }
  }

  // Determine primary format (best compression with good support)
  const primaryFormat = results.webp ? 'webp' :
                       results.avif ? 'avif' :
                       results.jpeg ? 'jpeg' : null;

  if (!primaryFormat) {
    throw new Error('Failed to process image in any supported format');
  }

  return {
    formats: results,
    primary: results[primaryFormat],
    primaryFormat,
    errors,
    totalSize: Object.values(results).reduce((sum, result) => sum + result.fileSize, 0)
  };
}

/**
 * Process image to specific format with size targeting
 *
 * @param {Buffer} buffer - Input image buffer
 * @param {Object} options - Format-specific options
 * @returns {Promise<Object>} Processed image data
 */
async function processToFormat(buffer, options = {}) {
  const {
    format = 'jpeg',
    targetSizeKB = 100,
    maxWidth = 1200,
    maxHeight = 1200,
    stripMetadata = true,
    progressive = true
  } = options;

  // Format-specific optimization settings
  const formatSettings = {
    webp: {
      quality: 85,
      effort: 4, // Balanced between speed and compression
      lossless: false
    },
    avif: {
      quality: 85,
      effort: 4,
      chromaSubsampling: '4:2:0'
    },
    jpeg: {
      quality: 85,
      progressive,
      mozjpeg: true,
      optimiseCoding: true,
      quantisationTable: 0
    },
    png: {
      compressionLevel: 6,
      adaptiveFiltering: true,
      palette: true
    }
  };

  const settings = formatSettings[format] || formatSettings.jpeg;

  // Adaptive quality for size targeting
  let quality = settings.quality || 85;
  let minQuality = 20;
  let maxQuality = 95;
  let processed;
  let attempts = 0;
  const maxAttempts = 8;

  const image = sharp(buffer, {
    limitInputPixels: 100000000,
    sequentialRead: true
  });

  while (attempts < maxAttempts) {
    const formatOptions = { ...settings };

    // Update quality for formats that support it
    if (format !== 'png') {
      formatOptions.quality = quality;
    }

    processed = await image
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFormat(format, formatOptions)
      .withMetadata(stripMetadata ? {} : undefined)
      .toBuffer();

    const fileSizeKB = processed.length / 1024;

    // Check if we're close enough to target
    if (Math.abs(fileSizeKB - targetSizeKB) <= 8 || quality <= minQuality) {
      break;
    }

    // Adjust quality
    if (fileSizeKB > targetSizeKB) {
      maxQuality = quality;
      quality = Math.max(minQuality, Math.floor((minQuality + quality) / 2));
    } else {
      minQuality = quality;
      quality = Math.min(maxQuality, Math.floor((quality + maxQuality) / 2));
    }

    attempts++;
  }

  const processedMetadata = await sharp(processed).metadata();

  return {
    buffer: processed,
    format,
    quality: format !== 'png' ? quality : undefined,
    compressionRatio: buffer.length / processed.length,
    fileSize: processed.length,
    fileSizeKB: processed.length / 1024,
    dimensions: {
      width: processedMetadata.width,
      height: processedMetadata.height
    },
    metadata: processedMetadata,
    attempts,
    settings: formatOptions
  };
}

/**
 * Generate thumbnail versions for all formats
 *
 * @param {Buffer} buffer - Input image buffer
 * @param {Object} options - Thumbnail options
 * @returns {Promise<Object>} Thumbnail results
 */
async function generateThumbnails(buffer, options = {}) {
  const {
    sizes = [{ width: 150, height: 150, name: 'thumbnail' }],
    formats = ['webp', 'avif', 'jpeg'],
    stripMetadata = true
  } = options;

  const results = {};

  const image = sharp(buffer, {
    limitInputPixels: 100000000,
    sequentialRead: true
  });

  for (const size of sizes) {
    results[size.name] = {};

    for (const format of formats) {
      try {
        const formatSettings = {
          webp: { quality: 80, effort: 4 },
          avif: { quality: 80, effort: 4 },
          jpeg: { quality: 80, progressive: true, mozjpeg: true },
          png: { compressionLevel: 6 }
        };

        const settings = formatSettings[format] || formatSettings.jpeg;

        const thumbnail = await image
          .resize(size.width, size.height, {
            fit: 'cover',
            position: 'center'
          })
          .toFormat(format, settings)
          .withMetadata(stripMetadata ? {} : undefined)
          .toBuffer();

        const thumbnailMetadata = await sharp(thumbnail).metadata();

        results[size.name][format] = {
          buffer: thumbnail,
          format,
          fileSize: thumbnail.length,
          fileSizeKB: thumbnail.length / 1024,
          dimensions: {
            width: thumbnailMetadata.width,
            height: thumbnailMetadata.height
          },
          metadata: thumbnailMetadata
        };

      } catch (error) {
        console.warn(`Failed to generate ${size.name} thumbnail in ${format}:`, error.message);
        results[size.name][format] = {
          error: error.message
        };
      }
    }
  }

  return results;
}

/**
 * Process worker lifecycle
 */
process.on('uncaughtException', (error) => {
  console.error('Worker uncaught exception:', error);
  parentPort?.postMessage({
    id: 'worker-error',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      type: 'uncaughtException'
    }
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Worker unhandled rejection at:', promise, 'reason:', reason);
  parentPort?.postMessage({
    id: 'worker-error',
    error: {
      message: typeof reason === 'string' ? reason : reason?.message || 'Unknown rejection',
      type: 'unhandledRejection',
      reason: reason
    }
  });
});

// Signal ready
if (parentPort) {
  parentPort.postMessage({ id: 'worker-ready' });
}