/**
 * HEIC to JPEG conversion API endpoint
 * Provides server-side HEIC conversion for browsers that don't support HEIC natively
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import sharp from 'sharp';
import { validateHEICFile } from '@/lib/utils/heic-support';
import { createSessionAwareRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/middleware/rate-limiting';

/**
 * Convert HEIC file to JPEG
 * POST /api/v1/utils/convert-heic
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limiting check (HEIC conversion is resource-intensive)
    const rateLimitResponse = await createSessionAwareRateLimit(
      request,
      RATE_LIMIT_CONFIGS.HEIC_CONVERSION
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Authentication check
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('heicFile') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No HEIC file provided' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate HEIC file (client-side validation should have caught this, but double-check)
    const validation = await validateHEICFile(file);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: `Invalid HEIC file: ${validation.error}` },
        { status: 400 }
      );
    }

    console.log(`📸 Converting HEIC file: ${file.name} (${file.size} bytes)`);

    // Convert HEIC to JPEG using Sharp
    const convertedBuffer = await sharp(buffer, {
      // Handle HEIC input specifically
      limitInputPixels: 100000000, // 100MP limit for security
      sequentialRead: true,
    })
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true,
      })
      // Strip all metadata for security
      .withMetadata({})
      .toBuffer();

    console.log(`✅ HEIC conversion successful: ${convertedBuffer.length} bytes`);

    // Return converted JPEG as blob
    return new NextResponse(convertedBuffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': convertedBuffer.length.toString(),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Original-Format': validation.format,
        'X-Original-Size': file.size.toString(),
        'X-Converted-Size': convertedBuffer.length.toString(),
        'X-Compression-Ratio': (file.size / convertedBuffer.length).toFixed(2),
      },
    });

  } catch (error) {
    console.error('❌ HEIC conversion failed:', error);

    // Handle specific Sharp errors
    if (error instanceof Error) {
      if (error.message.includes('Input file contains unsupported image format')) {
        return NextResponse.json(
          { error: 'Unsupported HEIC format or corrupted file' },
          { status: 400 }
        );
      }

      if (error.message.includes('Input image exceeds pixel limit')) {
        return NextResponse.json(
          { error: 'Image is too large to process' },
          { status: 413 }
        );
      }

      if (error.message.includes('Input buffer contains unsupported image format')) {
        return NextResponse.json(
          { error: 'File is not a valid HEIC image' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'HEIC conversion failed',
        details: process.env.NODE_ENV === 'development' ?
          (error instanceof Error ? error.message : 'Unknown error') :
          undefined
      },
      { status: 500 }
    );
  }
}