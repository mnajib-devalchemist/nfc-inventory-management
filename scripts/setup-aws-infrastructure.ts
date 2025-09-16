#!/usr/bin/env tsx

/**
 * AWS Infrastructure Setup Script for Story 2.1
 *
 * This script creates and configures the complete AWS infrastructure required
 * for the photo storage and delivery pipeline as specified in Story 2.1.
 *
 * @category Infrastructure Scripts
 * @since 2.1.0
 */

import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand
} from '@aws-sdk/client-s3';
import {
  CloudWatchClient,
  PutMetricAlarmCommand
} from '@aws-sdk/client-cloudwatch';
import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateOriginAccessControlCommand
} from '@aws-sdk/client-cloudfront';
import { serverEnv } from '../lib/utils/env';

/**
 * Infrastructure configuration matching Story 2.1 requirements
 */
const INFRASTRUCTURE_CONFIG = {
  region: 'us-west-2', // Story 2.1 specifies us-west-2
  bucketName: 'inventory-photos-production',
  accountId: process.env.AWS_ACCOUNT_ID,
} as const;

const s3Client = new S3Client({ region: INFRASTRUCTURE_CONFIG.region });
const cloudWatchClient = new CloudWatchClient({ region: INFRASTRUCTURE_CONFIG.region });
const cloudFrontClient = new CloudFrontClient({ region: INFRASTRUCTURE_CONFIG.region });

/**
 * Step 1: Create S3 bucket with versioning enabled
 */
async function createS3Bucket(): Promise<void> {
  console.log('📦 Creating S3 bucket:', INFRASTRUCTURE_CONFIG.bucketName);

  try {
    // Check if bucket already exists
    await s3Client.send(new HeadBucketCommand({
      Bucket: INFRASTRUCTURE_CONFIG.bucketName
    }));
    console.log('✅ S3 bucket already exists');
    return;
  } catch (error) {
    // Bucket doesn't exist, create it
  }

  // Create bucket
  await s3Client.send(new CreateBucketCommand({
    Bucket: INFRASTRUCTURE_CONFIG.bucketName,
    CreateBucketConfiguration: {
      LocationConstraint: INFRASTRUCTURE_CONFIG.region,
    },
  }));

  // Enable versioning for photo revision tracking
  await s3Client.send(new PutBucketVersioningCommand({
    Bucket: INFRASTRUCTURE_CONFIG.bucketName,
    VersioningConfiguration: {
      Status: 'Enabled',
    },
  }));

  console.log('✅ S3 bucket created with versioning enabled');
}

/**
 * Step 2: Configure S3 bucket policies for security
 */
async function configureS3Security(): Promise<void> {
  console.log('🔒 Configuring S3 bucket security policies...');

  // Block all public access (CloudFront only)
  await s3Client.send(new PutPublicAccessBlockCommand({
    Bucket: INFRASTRUCTURE_CONFIG.bucketName,
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: true,
      RestrictPublicBuckets: true,
    },
  }));

  // Enable server-side encryption with AES256
  await s3Client.send(new PutBucketEncryptionCommand({
    Bucket: INFRASTRUCTURE_CONFIG.bucketName,
    ServerSideEncryptionConfiguration: {
      Rules: [
        {
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256',
          },
          BucketKeyEnabled: true,
        },
      ],
    },
  }));

  console.log('✅ S3 security policies configured');
}

/**
 * Step 3: Set up S3 lifecycle policies for cost optimization
 */
async function configureS3Lifecycle(): Promise<void> {
  console.log('💰 Configuring S3 lifecycle policies for cost optimization...');

  await s3Client.send(new PutBucketLifecycleConfigurationCommand({
    Bucket: INFRASTRUCTURE_CONFIG.bucketName,
    LifecycleConfiguration: {
      Rules: [
        {
          ID: 'ArchiveOldPhotos',
          Status: 'Enabled',
          Filter: { Prefix: 'items/' },
          Transitions: [
            {
              Days: 90,
              StorageClass: 'GLACIER',
            },
            {
              Days: 365,
              StorageClass: 'DEEP_ARCHIVE',
            },
          ],
        },
        {
          ID: 'DeleteIncompleteUploads',
          Status: 'Enabled',
          AbortIncompleteMultipartUpload: {
            DaysAfterInitiation: 7,
          },
        },
      ],
    },
  }));

  console.log('✅ S3 lifecycle policies configured');
}

/**
 * Step 4: Configure CORS policy for direct uploads from Vercel
 */
async function configureS3CORS(): Promise<void> {
  console.log('🌐 Configuring CORS policy for Vercel uploads...');

  await s3Client.send(new PutBucketCorsCommand({
    Bucket: INFRASTRUCTURE_CONFIG.bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST'],
          AllowedOrigins: [
            'https://*.vercel.app',
            'https://localhost:3000',
            'http://localhost:3000',
          ],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  }));

  console.log('✅ CORS policy configured');
}

/**
 * Step 5: Create CloudFront distribution for fast global delivery
 */
async function createCloudFrontDistribution(): Promise<string> {
  console.log('🌍 Creating CloudFront distribution...');

  // Create Origin Access Control
  const oacResponse = await cloudFrontClient.send(new CreateOriginAccessControlCommand({
    OriginAccessControlConfig: {
      Name: 'inventory-photos-oac',
      Description: 'Origin Access Control for inventory photos S3 bucket',
      OriginAccessControlOriginType: 's3',
      SigningBehavior: 'always',
      SigningProtocol: 'sigv4',
    },
  }));

  const oacId = oacResponse.OriginAccessControl?.Id;
  if (!oacId) throw new Error('Failed to create Origin Access Control');

  // Create CloudFront distribution
  const distributionResponse = await cloudFrontClient.send(new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: `inventory-photos-cdn-${Date.now()}`,
      Comment: 'CDN distribution for inventory photo delivery',
      Enabled: true,
      PriceClass: 'PriceClass_100', // Cost optimization
      HttpVersion: 'http2and3',
      IsIPV6Enabled: true,
      DefaultCacheBehavior: {
        TargetOriginId: 'inventory-photos-s3-origin',
        ViewerProtocolPolicy: 'redirect-to-https',
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // Managed-CachingOptimized
        OriginRequestPolicyId: '88a5eaf4-2fd4-4709-b370-b4c650ea3fcf', // Managed-CORS-S3Origin
        Compress: true,
        AllowedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD'],
          CachedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD'],
          },
        },
      },
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: 'inventory-photos-s3-origin',
            DomainName: `${INFRASTRUCTURE_CONFIG.bucketName}.s3.${INFRASTRUCTURE_CONFIG.region}.amazonaws.com`,
            OriginAccessControlId: oacId,
            S3OriginConfig: {
              OriginAccessIdentity: '',
            },
          },
        ],
      },
    },
  }));

  const distributionId = distributionResponse.Distribution?.Id;
  const distributionDomain = distributionResponse.Distribution?.DomainName;

  if (!distributionId || !distributionDomain) {
    throw new Error('Failed to create CloudFront distribution');
  }

  console.log('✅ CloudFront distribution created:');
  console.log(`   Distribution ID: ${distributionId}`);
  console.log(`   Domain: ${distributionDomain}`);

  return distributionId;
}

/**
 * Step 6: Configure CloudWatch billing alerts for cost monitoring
 */
async function setupBillingAlerts(): Promise<void> {
  console.log('📊 Setting up CloudWatch billing alerts...');

  const alerts = [
    {
      name: 'S3-Storage-Cost-Alert',
      description: 'Alert when S3 storage exceeds 50GB (approaching Free Tier limit)',
      threshold: 53687091200, // 50GB in bytes
      metric: 'BucketSizeBytes',
      dimensions: [
        { Name: 'BucketName', Value: INFRASTRUCTURE_CONFIG.bucketName },
        { Name: 'StorageType', Value: 'StandardStorage' },
      ],
    },
    {
      name: 'S3-Requests-Cost-Alert',
      description: 'Alert when S3 requests approach Free Tier limit',
      threshold: 18000, // 18k requests (90% of 20k limit)
      metric: 'NumberOfObjects',
      dimensions: [
        { Name: 'BucketName', Value: INFRASTRUCTURE_CONFIG.bucketName },
      ],
    },
  ];

  for (const alert of alerts) {
    await cloudWatchClient.send(new PutMetricAlarmCommand({
      AlarmName: alert.name,
      AlarmDescription: alert.description,
      MetricName: alert.metric,
      Namespace: 'AWS/S3',
      Statistic: 'Average',
      Period: 86400, // 24 hours
      Threshold: alert.threshold,
      ComparisonOperator: 'GreaterThanThreshold',
      Dimensions: alert.dimensions,
      EvaluationPeriods: 1,
      TreatMissingData: 'notBreaching',
    }));

    console.log(`✅ Created billing alert: ${alert.name}`);
  }
}

/**
 * Step 7: Update S3 bucket policy to allow CloudFront access
 */
async function updateS3BucketPolicy(distributionId: string): Promise<void> {
  console.log('🔐 Updating S3 bucket policy for CloudFront access...');

  const bucketPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowCloudFrontServicePrincipal',
        Effect: 'Allow',
        Principal: {
          Service: 'cloudfront.amazonaws.com',
        },
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${INFRASTRUCTURE_CONFIG.bucketName}/*`,
        Condition: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${INFRASTRUCTURE_CONFIG.accountId}:distribution/${distributionId}`,
          },
        },
      },
    ],
  };

  await s3Client.send(new PutBucketPolicyCommand({
    Bucket: INFRASTRUCTURE_CONFIG.bucketName,
    Policy: JSON.stringify(bucketPolicy),
  }));

  console.log('✅ S3 bucket policy updated for CloudFront access');
}

/**
 * Main setup function that orchestrates all infrastructure creation
 */
async function setupAWSInfrastructure(): Promise<void> {
  console.log('🚀 Starting AWS Infrastructure Setup for Story 2.1\n');
  console.log('This will create:');
  console.log('• S3 bucket with security policies and lifecycle rules');
  console.log('• CloudFront distribution for fast global delivery');
  console.log('• CloudWatch billing alerts for cost monitoring');
  console.log('• CORS policies for Vercel compatibility\n');

  try {
    // Validate required environment variables
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    }

    if (!INFRASTRUCTURE_CONFIG.accountId) {
      throw new Error('AWS_ACCOUNT_ID environment variable is required');
    }

    console.log(`📍 Region: ${INFRASTRUCTURE_CONFIG.region}`);
    console.log(`📦 Bucket: ${INFRASTRUCTURE_CONFIG.bucketName}\n`);

    // Execute setup steps in order
    await createS3Bucket();
    await configureS3Security();
    await configureS3Lifecycle();
    await configureS3CORS();

    const distributionId = await createCloudFrontDistribution();
    await updateS3BucketPolicy(distributionId);
    await setupBillingAlerts();

    console.log('\n🎉 AWS Infrastructure Setup Complete!');
    console.log('\n📋 Next Steps:');
    console.log('1. Update your .env file with the CloudFront domain name');
    console.log('2. Wait 10-15 minutes for CloudFront distribution to deploy');
    console.log('3. Run the test script: npm run test:s3-connection');
    console.log('4. Deploy your application to Vercel');

    console.log('\n💡 Environment Variables to Add:');
    console.log(`AWS_CLOUDFRONT_DISTRIBUTION_ID="${distributionId}"`);
    console.log('AWS_CLOUDFRONT_DOMAIN="[DOMAIN_FROM_CLOUDFRONT_CONSOLE]"');

  } catch (error) {
    console.error('\n❌ Infrastructure setup failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Verify AWS credentials are configured correctly');
    console.log('2. Ensure your AWS account has necessary permissions');
    console.log('3. Check that the bucket name is globally unique');
    console.log('4. Verify AWS_ACCOUNT_ID is set correctly');

    process.exit(1);
  }
}

/**
 * Script execution
 */
if (require.main === module) {
  setupAWSInfrastructure()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Script execution failed:', error);
      process.exit(1);
    });
}

export { setupAWSInfrastructure };