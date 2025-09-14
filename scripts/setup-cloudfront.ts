#!/usr/bin/env tsx

/**
 * CloudFront Distribution Setup Script
 *
 * Sets up CloudFront distribution with optimized cache behaviors for
 * multi-format image delivery, format-based routing, and global performance.
 *
 * @category Infrastructure Scripts
 * @since 1.7.0
 */

import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetDistributionCommand,
  ListDistributionsCommand,
  UpdateDistributionCommand,
  DistributionConfig,
  CacheBehavior as AWSCacheBehavior,
  DefaultCacheBehavior,
  Method,
} from '@aws-sdk/client-cloudfront';
import { cdnService } from '@/lib/services/cdn';
import { STORAGE_CONFIG, validateStorageConfig } from '@/lib/config/storage';
import { serverEnv } from '@/lib/utils/env';

/**
 * CloudFront distribution configuration for multi-format images
 */
interface DistributionSetup {
  distributionId?: string;
  domainName: string;
  status: string;
  cacheBehaviors: number;
  origins: number;
  enabled: boolean;
}

/**
 * Creates or updates CloudFront distribution with optimized settings
 */
async function setupCloudFrontDistribution(): Promise<DistributionSetup> {
  console.log('🚀 Setting up CloudFront distribution for multi-format image delivery...\n');

  const client = new CloudFrontClient({
    region: 'us-east-1', // CloudFront is global but API calls go to us-east-1
    credentials: {
      accessKeyId: serverEnv.AWS_ACCESS_KEY_ID!,
      secretAccessKey: serverEnv.AWS_SECRET_ACCESS_KEY!,
    },
  });

  try {
    // Validate storage configuration
    validateStorageConfig();

    // Check if distribution already exists
    console.log('🔍 Checking for existing CloudFront distribution...');
    const existingDistribution = await findExistingDistribution(client);

    if (existingDistribution) {
      console.log(`✅ Found existing distribution: ${existingDistribution.Id}`);
      console.log(`   Domain: ${existingDistribution.DomainName}`);
      console.log(`   Status: ${existingDistribution.Status}`);

      // Update existing distribution
      const updateResult = await updateDistributionConfig(client, existingDistribution.Id!, existingDistribution.ETag!);

      return {
        distributionId: existingDistribution.Id!,
        domainName: existingDistribution.DomainName!,
        status: existingDistribution.Status!,
        cacheBehaviors: updateResult.cacheBehaviors,
        origins: updateResult.origins,
        enabled: true,
      };
    } else {
      console.log('📦 Creating new CloudFront distribution...');
      const newDistribution = await createDistribution(client);

      return {
        distributionId: newDistribution.Id!,
        domainName: newDistribution.DomainName!,
        status: newDistribution.Status!,
        cacheBehaviors: newDistribution.DistributionConfig?.CacheBehaviors?.Quantity || 0,
        origins: newDistribution.DistributionConfig?.Origins?.Quantity || 0,
        enabled: true,
      };
    }

  } catch (error) {
    console.error('❌ Failed to setup CloudFront distribution:', error);
    throw error;
  }
}

/**
 * Find existing CloudFront distribution for the S3 bucket
 */
async function findExistingDistribution(client: CloudFrontClient) {
  try {
    const command = new ListDistributionsCommand({});
    const response = await client.send(command);

    if (!response.DistributionList?.Items) {
      return null;
    }

    const bucketOrigin = `${STORAGE_CONFIG.buckets.photos}.s3.${serverEnv.AWS_REGION || 'us-east-1'}.amazonaws.com`;

    // Look for distribution with our S3 bucket as origin
    for (const distribution of response.DistributionList.Items) {
      if (distribution.Origins?.Items) {
        for (const origin of distribution.Origins.Items) {
          if (origin.DomainName === bucketOrigin) {
            return distribution;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('⚠️  Could not list existing distributions:', error);
    return null;
  }
}

/**
 * Create new CloudFront distribution
 */
async function createDistribution(client: CloudFrontClient) {
  const bucketOrigin = `${STORAGE_CONFIG.buckets.photos}.s3.${serverEnv.AWS_REGION || 'us-east-1'}.amazonaws.com`;
  const originId = `S3-${STORAGE_CONFIG.buckets.photos}`;
  const callerReference = `inventory-cdn-${Date.now()}`;

  const distributionConfig: DistributionConfig = {
    CallerReference: callerReference,
    Comment: 'NFC Digital Inventory Management - Multi-format Image CDN',
    Enabled: true,
    PriceClass: 'PriceClass_All', // Global edge locations for best performance

    // S3 Origin configuration
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: originId,
          DomainName: bucketOrigin,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: 'https-only',
            OriginSslProtocols: {
              Quantity: 1,
              Items: ['TLSv1.2'],
            },
          },
        },
      ],
    },

    // Default cache behavior
    DefaultCacheBehavior: createDefaultCacheBehavior(originId),

    // Format-specific cache behaviors
    CacheBehaviors: {
      Quantity: 4,
      Items: createFormatSpecificCacheBehaviors(originId),
    },

    // Custom error pages
    CustomErrorResponses: {
      Quantity: 2,
      Items: [
        {
          ErrorCode: 403,
          ResponseCode: '404',
          ResponsePagePath: '/404.html',
          ErrorCachingMinTTL: 300,
        },
        {
          ErrorCode: 404,
          ResponseCode: '404',
          ResponsePagePath: '/404.html',
          ErrorCachingMinTTL: 300,
        },
      ],
    },

    // Logging configuration (optional)
    Logging: {
      Enabled: false,
      IncludeCookies: false,
      Bucket: '',
      Prefix: '',
    },

    // Web ACL (optional - for additional security)
    WebACLId: '',

    // HTTP version
    HttpVersion: 'http2',

    // IPv6 support
    IsIPV6Enabled: true,
  };

  const command = new CreateDistributionCommand({
    DistributionConfig: distributionConfig,
  });

  console.log('⏳ Creating CloudFront distribution (this may take 10-15 minutes)...');
  const response = await client.send(command);

  if (response.Distribution) {
    console.log(`✅ CloudFront distribution created successfully!`);
    console.log(`   Distribution ID: ${response.Distribution.Id}`);
    console.log(`   Domain Name: ${response.Distribution.DomainName}`);
    console.log(`   Status: ${response.Distribution.Status}`);
    console.log('\n📋 Next Steps:');
    console.log(`   1. Add AWS_CLOUDFRONT_DOMAIN="${response.Distribution.DomainName}" to your .env file`);
    console.log('   2. Wait for distribution deployment to complete (10-15 minutes)');
    console.log('   3. Test CDN delivery using the test script');

    return response.Distribution;
  }

  throw new Error('Failed to create CloudFront distribution');
}

/**
 * Update existing CloudFront distribution configuration
 */
async function updateDistributionConfig(client: CloudFrontClient, distributionId: string, etag: string) {
  console.log('🔄 Updating CloudFront distribution configuration...');

  // Get current distribution config
  const getCommand = new GetDistributionCommand({ Id: distributionId });
  const getResponse = await client.send(getCommand);

  if (!getResponse.Distribution?.DistributionConfig) {
    throw new Error('Could not retrieve distribution configuration');
  }

  const config = getResponse.Distribution.DistributionConfig;
  const originId = config.Origins?.Items?.[0]?.Id || `S3-${STORAGE_CONFIG.buckets.photos}`;

  // Update cache behaviors with optimized settings
  const updatedConfig: DistributionConfig = {
    ...config,
    // Update default cache behavior
    DefaultCacheBehavior: createDefaultCacheBehavior(originId),

    // Update format-specific cache behaviors
    CacheBehaviors: {
      Quantity: 4,
      Items: createFormatSpecificCacheBehaviors(originId),
    },

    // Ensure modern settings
    HttpVersion: 'http2',
    IsIPV6Enabled: true,
  };

  const updateCommand = new UpdateDistributionCommand({
    Id: distributionId,
    DistributionConfig: updatedConfig,
    IfMatch: getResponse.ETag,
  });

  const updateResponse = await client.send(updateCommand);

  console.log('✅ CloudFront distribution updated successfully!');

  return {
    cacheBehaviors: updatedConfig.CacheBehaviors?.Quantity || 0,
    origins: updatedConfig.Origins?.Quantity || 0,
  };
}

/**
 * Create default cache behavior configuration
 */
function createDefaultCacheBehavior(targetOriginId: string): DefaultCacheBehavior {
  return {
    TargetOriginId: targetOriginId,
    ViewerProtocolPolicy: 'redirect-to-https',
    Compress: true,

    // Allowed and cached methods
    AllowedMethods: {
      Quantity: 3,
      Items: ['GET', 'HEAD', 'OPTIONS'] as Method[],
      CachedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD'] as Method[],
      },
    },

    // Forwarded values
    ForwardedValues: {
      QueryString: false,
      Cookies: { Forward: 'none' },
      Headers: {
        Quantity: 2,
        Items: ['Accept', 'Accept-Encoding'],
      },
    },

    // TTL settings - balanced for general content
    DefaultTTL: 3600, // 1 hour
    MaxTTL: 86400, // 1 day
    MinTTL: 0,

    // Smooth streaming
    SmoothStreaming: false,

    // Trusted signers (none for public content)
    TrustedSigners: {
      Enabled: false,
      Quantity: 0,
    },
  };
}

/**
 * Create format-specific cache behavior configurations
 */
function createFormatSpecificCacheBehaviors(targetOriginId: string): AWSCacheBehavior[] {
  const baseBehavior = {
    TargetOriginId: targetOriginId,
    ViewerProtocolPolicy: 'redirect-to-https' as const,
    Compress: true,

    AllowedMethods: {
      Quantity: 3,
      Items: ['GET', 'HEAD', 'OPTIONS'] as Method[],
      CachedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD'] as Method[],
      },
    },

    ForwardedValues: {
      QueryString: false,
      Cookies: { Forward: 'none' as const },
      Headers: {
        Quantity: 3,
        Items: ['Accept', 'Accept-Encoding', 'CloudFront-Viewer-Country'],
      },
    },

    SmoothStreaming: false,
    TrustedSigners: {
      Enabled: false,
      Quantity: 0,
    },
  };

  return [
    // WebP images - longest cache (modern format)
    {
      ...baseBehavior,
      PathPattern: '*.webp',
      DefaultTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
      MaxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
      MinTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
    },

    // AVIF images - longest cache (cutting-edge format)
    {
      ...baseBehavior,
      PathPattern: '*.avif',
      DefaultTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
      MaxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
      MinTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
    },

    // JPEG images - standard cache (fallback format)
    {
      ...baseBehavior,
      PathPattern: '*.jpg',
      DefaultTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
      MaxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
      MinTTL: 0,
    },

    // JPEG alternative extension
    {
      ...baseBehavior,
      PathPattern: '*.jpeg',
      DefaultTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
      MaxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
      MinTTL: 0,
    },
  ];
}

/**
 * Test CloudFront distribution after setup
 */
async function testDistribution(setup: DistributionSetup): Promise<void> {
  console.log('\n🧪 Testing CloudFront distribution...');

  const testPaths = [
    'test/sample.jpg',
    'test/sample.webp',
    'test/sample.avif',
  ];

  try {
    const testResults = await cdnService.testCdnDelivery(testPaths);

    console.log('📊 Test Results:');
    console.log(`   Total Tests: ${testResults.summary.totalTests}`);
    console.log(`   Successful: ${testResults.summary.successful}`);
    console.log(`   Failed: ${testResults.summary.failed}`);
    console.log(`   Avg Response Time: ${testResults.summary.avgResponseTime}ms`);

    if (testResults.summary.failed > 0) {
      console.log('\n❌ Failed Tests:');
      testResults.results
        .filter(result => result.status === 'error')
        .forEach(result => {
          console.log(`   • ${result.path}: ${result.error}`);
        });
    }

    if (testResults.summary.successful > 0) {
      console.log('\n✅ Successful Tests:');
      testResults.results
        .filter(result => result.status === 'success')
        .forEach(result => {
          console.log(`   • ${result.path}: ${result.responseTime}ms (${result.cacheStatus})`);
        });
    }

  } catch (error) {
    console.warn('⚠️  Could not test distribution immediately:', error);
    console.log('   This is normal for new distributions - try testing again in 10-15 minutes');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    const setup = await setupCloudFrontDistribution();

    console.log('\n🎉 CloudFront Distribution Setup Complete!');
    console.log('\n📋 Distribution Details:');
    console.log(`   Distribution ID: ${setup.distributionId}`);
    console.log(`   Domain Name: ${setup.domainName}`);
    console.log(`   Status: ${setup.status}`);
    console.log(`   Cache Behaviors: ${setup.cacheBehaviors}`);
    console.log(`   Origins: ${setup.origins}`);

    // Test if distribution is deployed
    if (setup.status === 'Deployed') {
      await testDistribution(setup);
    } else {
      console.log('\n⏳ Distribution is still deploying...');
      console.log('   Status updates every few minutes');
      console.log('   Full deployment typically takes 10-15 minutes');
      console.log('   Run test script again once status shows "Deployed"');
    }

    console.log('\n🔗 Next Steps:');
    console.log(`   1. Update .env: AWS_CLOUDFRONT_DOMAIN="${setup.domainName}"`);
    console.log('   2. Run: npm run test:cdn (once deployed)');
    console.log('   3. Update DNS (if using custom domain)');

  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  }
}

/**
 * Script execution entry point
 */
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script execution failed:', error);
      process.exit(1);
    });
}

export { setupCloudFrontDistribution, testDistribution };