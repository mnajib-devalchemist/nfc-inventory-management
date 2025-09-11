import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { serverEnv } from './env';

/**
 * AWS S3 client configuration
 * Only initialized when credentials are available
 */
function createS3Client(): S3Client {
  if (!serverEnv.AWS_ACCESS_KEY_ID || !serverEnv.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials are not configured');
  }
  
  return new S3Client({
    region: serverEnv.AWS_REGION,
    credentials: {
      accessKeyId: serverEnv.AWS_ACCESS_KEY_ID,
      secretAccessKey: serverEnv.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * S3 upload configuration
 */
export const S3_CONFIG = {
  bucketName: serverEnv.AWS_S3_BUCKET_NAME || 'default-bucket',
  region: serverEnv.AWS_REGION,
  cloudfrontDomain: serverEnv.AWS_CLOUDFRONT_DOMAIN,
  
  // File path structure
  paths: {
    photos: 'photos',
    thumbnails: 'thumbnails',
    temp: 'temp',
  },
  
  // Presigned URL expiration (24 hours)
  presignedUrlExpiry: 24 * 60 * 60,
  
  // Max file sizes
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxThumbnailSize: 1 * 1024 * 1024, // 1MB
} as const;

/**
 * Upload result interface
 */
export interface S3UploadResult {
  key: string;
  url: string;
  cdnUrl?: string;
  size: number;
  etag: string;
}

/**
 * Upload a file buffer to S3
 */
export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string = 'image/jpeg',
  metadata: Record<string, string> = {}
): Promise<S3UploadResult> {
  try {
    const command = new PutObjectCommand({
      Bucket: S3_CONFIG.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
      // Security headers
      ServerSideEncryption: 'AES256',
      CacheControl: 'public, max-age=31536000', // 1 year
      StorageClass: 'STANDARD_IA', // Infrequent Access for cost optimization
    });

    const s3Client = createS3Client();
    const result = await s3Client.send(command);
    
    const baseUrl = `https://${S3_CONFIG.bucketName}.s3.${S3_CONFIG.region}.amazonaws.com`;
    const url = `${baseUrl}/${key}`;
    const cdnUrl = S3_CONFIG.cloudfrontDomain ? `https://${S3_CONFIG.cloudfrontDomain}/${key}` : undefined;

    return {
      key,
      url,
      cdnUrl,
      size: buffer.length,
      etag: result.ETag || '',
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Upload photo and thumbnail to S3
 */
export async function uploadPhotoToS3(
  householdId: string,
  photoBuffer: Buffer,
  thumbnailBuffer: Buffer,
  filename: string,
  thumbnailFilename: string,
  metadata: Record<string, string> = {}
): Promise<{
  photo: S3UploadResult;
  thumbnail: S3UploadResult;
}> {
  const photoKey = `${S3_CONFIG.paths.photos}/${householdId}/${filename}`;
  const thumbnailKey = `${S3_CONFIG.paths.thumbnails}/${householdId}/${thumbnailFilename}`;

  const [photo, thumbnail] = await Promise.all([
    uploadToS3(photoBuffer, photoKey, 'image/jpeg', {
      type: 'photo',
      householdId,
      ...metadata,
    }),
    uploadToS3(thumbnailBuffer, thumbnailKey, 'image/jpeg', {
      type: 'thumbnail',
      householdId,
      ...metadata,
    }),
  ]);

  return { photo, thumbnail };
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_CONFIG.bucketName,
      Key: key,
    });

    const s3Client = createS3Client();
    await s3Client.send(command);
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error(`Failed to delete from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete photo and thumbnail from S3
 */
export async function deletePhotoFromS3(photoUrl: string, thumbnailUrl?: string): Promise<void> {
  const photoKey = extractS3KeyFromUrl(photoUrl);
  const promises = [deleteFromS3(photoKey)];

  if (thumbnailUrl) {
    const thumbnailKey = extractS3KeyFromUrl(thumbnailUrl);
    promises.push(deleteFromS3(thumbnailKey));
  }

  await Promise.all(promises);
}

/**
 * Generate a presigned URL for secure file access
 */
export async function generatePresignedUrl(key: string, expiresIn: number = S3_CONFIG.presignedUrlExpiry): Promise<string> {
  try {
    const command = new HeadObjectCommand({
      Bucket: S3_CONFIG.bucketName,
      Key: key,
    });

    const s3Client = createS3Client();
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error('Presigned URL generation error:', error);
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a file exists in S3
 */
export async function fileExistsInS3(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: S3_CONFIG.bucketName,
      Key: key,
    });

    const s3Client = createS3Client();
    await s3Client.send(command);
    return true;
  } catch (error) {
    if ((error as any)?.name === 'NotFound') {
      return false;
    }
    console.error('S3 file check error:', error);
    throw error;
  }
}

/**
 * Extract S3 key from URL
 */
function extractS3KeyFromUrl(url: string): string {
  // Handle both S3 URLs and CloudFront URLs
  if (url.includes('.s3.')) {
    // Standard S3 URL: https://bucket.s3.region.amazonaws.com/key
    const urlParts = url.split('/');
    return urlParts.slice(3).join('/');
  } else if (S3_CONFIG.cloudfrontDomain && url.includes(S3_CONFIG.cloudfrontDomain)) {
    // CloudFront URL: https://domain.cloudfront.net/key
    const urlParts = url.split('/');
    return urlParts.slice(3).join('/');
  } else {
    throw new Error(`Invalid S3 URL format: ${url}`);
  }
}

/**
 * Get public URL for S3 object (prefer CDN if available)
 */
export function getPublicUrl(key: string): string {
  if (S3_CONFIG.cloudfrontDomain) {
    return `https://${S3_CONFIG.cloudfrontDomain}/${key}`;
  }
  return `https://${S3_CONFIG.bucketName}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`;
}

/**
 * Validate S3 configuration
 */
export function validateS3Config(): void {
  const required = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID', 
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET_NAME'
  ];

  const missing = required.filter(key => !serverEnv[key as keyof typeof serverEnv]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required S3 configuration: ${missing.join(', ')}`);
  }
}