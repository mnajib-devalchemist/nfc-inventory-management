/**
 * Photo upload API endpoint with S3 direct upload integration
 *
 * This endpoint handles photo uploads for inventory items using AWS S3 direct upload
 * with multi-format processing, cost protection, and comprehensive error handling.
 *
 * @category API Endpoints
 * @since 1.7.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { PrismaClient } from '@prisma/client';
import {
  storageService,
  photoProcessingService,
  CostProtectionService,
  cdnService
} from '@/lib/services';
import { getCdnUrl } from '@/lib/config/storage';
import { validateItem, validatePhotoUpload } from '@/lib/validation';

const prisma = new PrismaClient();
const costProtectionService = new CostProtectionService(prisma);

/**
 * Upload photo for an inventory item
 *
 * Supports multi-format processing with S3 direct upload and CDN integration.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Authentication check
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const itemId = params.id;

    // Validate item exists and user has access
    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        createdBy: session.user.id, // Simplified access check
      }
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found or access denied' },
        { status: 404 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('photo') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No photo file provided' },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validatePhotoUpload(file);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Cost protection check
    await costProtectionService.enforceUploadLimits(
      'upload',
      file.size,
      3 // WebP, AVIF, JPEG formats
    );

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Process image with multi-format support
    const processedResult = await photoProcessingService.processMultiFormat(
      buffer,
      {
        targetSizeKB: 100,
        maxWidth: 1200,
        maxHeight: 1200,
        stripMetadata: true,
        progressive: true,
        timeoutMs: 30000,
        formats: ['webp', 'avif', 'jpeg'],
      }
    );

    // Upload all formats to S3
    const uploadResults = [];
    const formats = Object.entries(processedResult.formats);

    for (const [format, result] of formats) {
      // Upload original size
      const originalKey = `items/${itemId}/photos/${Date.now()}-original.${format}`;
      const originalUpload = await storageService.uploadFile(
        result.buffer,
        originalKey,
        `image/${format}`
      );

      // For now, use the same image as thumbnail (would be resized in actual implementation)
      const thumbnailKey = `items/${itemId}/photos/${Date.now()}-thumb.${format}`;
      const thumbnailUpload = await storageService.uploadFile(
        result.buffer, // In production, this would be a resized thumbnail
        thumbnailKey,
        `image/${format}`
      );

      uploadResults.push({
        format,
        original: originalUpload,
        thumbnail: thumbnailUpload,
      });
    }

    // Use the first format as primary (typically WebP)
    const primary = uploadResults[0];

    // Get CDN URLs
    const originalCdnUrl = getCdnUrl(primary.original.key);
    const thumbnailCdnUrl = getCdnUrl(primary.thumbnail.key);

    // Save photo record to database
    const photo = await prisma.itemPhoto.create({
      data: {
        itemId,
        originalUrl: originalCdnUrl,
        thumbnailUrl: thumbnailCdnUrl,
        filename: file.name,
        mimeType: file.type,
        fileSize: primary.original.fileSize,
        width: processedResult.primary?.dimensions?.width,
        height: processedResult.primary?.dimensions?.height,
        processingStatus: 'COMPLETED',
        optimizationSavings: ((file.size - primary.original.fileSize) / file.size) * 100,
        uploadedBy: session.user.id,
      },
    });

    // Clear CDN cache for updated item
    await cdnService.invalidateItemCache(itemId);

    // Prepare response with all format information
    const response = {
      id: photo.id,
      originalUrl: originalCdnUrl,
      thumbnailUrl: thumbnailCdnUrl,
      filename: photo.filename,
      fileSize: photo.fileSize,
      optimizationSavings: photo.optimizationSavings,
      formats: uploadResults.map(result => ({
        format: result.format,
        originalUrl: getCdnUrl(result.original.key),
        thumbnailUrl: getCdnUrl(result.thumbnail.key),
        fileSize: result.original.fileSize,
      })),
      metadata: processedResult.primary?.metadata,
      processingTime: Date.now() - startTime,
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Photo upload failed:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Cost limit') || error.message.includes('Free Tier')) {
        return NextResponse.json(
          {
            error: 'Upload suspended due to cost protection',
            details: error.message
          },
          { status: 429 }
        );
      }

      if (error.message.includes('Invalid file') || error.message.includes('format')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Photo upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );

  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get photos for an inventory item
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Authentication check
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const itemId = params.id;

    // Validate item exists and user has access
    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        createdBy: session.user.id, // Simplified access check
      },
      include: {
        photos: {
          orderBy: [
            { isPrimary: 'desc' },
            { displayOrder: 'asc' },
            { createdAt: 'asc' }
          ]
        }
      }
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      itemId,
      photos: item.photos.map(photo => ({
        id: photo.id,
        originalUrl: photo.originalUrl,
        thumbnailUrl: photo.thumbnailUrl,
        filename: photo.filename,
        fileSize: photo.fileSize,
        width: photo.width,
        height: photo.height,
        isPrimary: photo.isPrimary,
        displayOrder: photo.displayOrder,
        optimizationSavings: photo.optimizationSavings,
        processingStatus: photo.processingStatus,
        createdAt: photo.createdAt,
      }))
    });

  } catch (error) {
    console.error('Failed to fetch photos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch photos' },
      { status: 500 }
    );

  } finally {
    await prisma.$disconnect();
  }
}