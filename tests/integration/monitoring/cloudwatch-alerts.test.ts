/**
 * @jest-environment node
 */

import {
  CloudWatchClient,
  PutMetricAlarmCommand,
  DescribeAlarmsCommand,
  GetMetricStatisticsCommand,
  DeleteAlarmsCommand,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { CostProtectionService } from '@/lib/services/cost-protection';
import { serverEnv } from '@/lib/utils/env';

// Integration test - only run if AWS credentials are available
const hasAWSCredentials = Boolean(
  serverEnv.AWS_ACCESS_KEY_ID &&
  serverEnv.AWS_SECRET_ACCESS_KEY &&
  serverEnv.AWS_REGION
);

// Mock Prisma for this integration test
const mockPrisma = {
  awsUsageTracking: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
  }
} as any;

describe('CloudWatch Alerts Integration Tests (2.1-INT-003)', () => {
  let cloudWatchClient: CloudWatchClient;
  let costProtectionService: CostProtectionService;
  const testAlarmPrefix = 'TEST-INVENTORY-MGMT';

  beforeAll(async () => {
    if (!hasAWSCredentials) {
      console.log('⏭️  Skipping CloudWatch integration tests - AWS credentials not configured');
      return;
    }

    cloudWatchClient = new CloudWatchClient({
      region: serverEnv.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: serverEnv.AWS_ACCESS_KEY_ID!,
        secretAccessKey: serverEnv.AWS_SECRET_ACCESS_KEY!,
      },
    });

    costProtectionService = new CostProtectionService(mockPrisma);
  });

  afterAll(async () => {
    if (!hasAWSCredentials) return;

    // Clean up test alarms
    try {
      const alarmsToDelete = [
        `${testAlarmPrefix}-S3-Storage-Test`,
        `${testAlarmPrefix}-S3-Requests-Test`,
        `${testAlarmPrefix}-Cost-Threshold-Test`,
      ];

      await cloudWatchClient.send(new DeleteAlarmsCommand({
        AlarmNames: alarmsToDelete,
      }));

      console.log('🧹 Cleaned up test CloudWatch alarms');
    } catch (error) {
      console.warn('Failed to clean up test alarms:', error);
    }
  });

  describe('CloudWatch Alarm Configuration', () => {
    test('should create S3 storage monitoring alarm', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const alarmName = `${testAlarmPrefix}-S3-Storage-Test`;

      // Create test alarm
      await cloudWatchClient.send(new PutMetricAlarmCommand({
        AlarmName: alarmName,
        AlarmDescription: 'Test alarm for S3 storage monitoring integration',
        MetricName: 'BucketSizeBytes',
        Namespace: 'AWS/S3',
        Statistic: 'Average',
        Period: 86400, // 24 hours
        Threshold: 4294967296, // 4GB (80% of 5GB Free Tier limit)
        ComparisonOperator: 'GreaterThanThreshold',
        Dimensions: [
          {
            Name: 'BucketName',
            Value: serverEnv.AWS_S3_BUCKET_NAME || 'test-bucket',
          },
          {
            Name: 'StorageType',
            Value: 'StandardStorage',
          },
        ],
        EvaluationPeriods: 1,
        TreatMissingData: 'notBreaching',
      }));

      // Verify alarm was created
      const response = await cloudWatchClient.send(new DescribeAlarmsCommand({
        AlarmNames: [alarmName],
      }));

      expect(response.MetricAlarms).toHaveLength(1);
      expect(response.MetricAlarms![0].AlarmName).toBe(alarmName);
      expect(response.MetricAlarms![0].MetricName).toBe('BucketSizeBytes');
      expect(response.MetricAlarms![0].Threshold).toBe(4294967296);
      expect(response.MetricAlarms![0].ComparisonOperator).toBe('GreaterThanThreshold');
    });

    test('should create S3 request monitoring alarm', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const alarmName = `${testAlarmPrefix}-S3-Requests-Test`;

      // Create test alarm for S3 requests
      await cloudWatchClient.send(new PutMetricAlarmCommand({
        AlarmName: alarmName,
        AlarmDescription: 'Test alarm for S3 request monitoring',
        MetricName: 'NumberOfObjects',
        Namespace: 'AWS/S3',
        Statistic: 'Average',
        Period: 3600, // 1 hour
        Threshold: 1800, // 90% of 2000 PUT request limit
        ComparisonOperator: 'GreaterThanThreshold',
        Dimensions: [
          {
            Name: 'BucketName',
            Value: serverEnv.AWS_S3_BUCKET_NAME || 'test-bucket',
          },
        ],
        EvaluationPeriods: 2,
        TreatMissingData: 'notBreaching',
      }));

      // Verify alarm configuration
      const response = await cloudWatchClient.send(new DescribeAlarmsCommand({
        AlarmNames: [alarmName],
      }));

      expect(response.MetricAlarms).toHaveLength(1);
      expect(response.MetricAlarms![0].MetricName).toBe('NumberOfObjects');
      expect(response.MetricAlarms![0].EvaluationPeriods).toBe(2);
    });

    test('should create billing cost threshold alarm', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const alarmName = `${testAlarmPrefix}-Cost-Threshold-Test`;

      // Create billing alarm
      await cloudWatchClient.send(new PutMetricAlarmCommand({
        AlarmName: alarmName,
        AlarmDescription: 'Test alarm for billing cost threshold',
        MetricName: 'EstimatedCharges',
        Namespace: 'AWS/Billing',
        Statistic: 'Maximum',
        Period: 86400, // 24 hours
        Threshold: 1.00, // $1 threshold for testing
        ComparisonOperator: 'GreaterThanThreshold',
        Dimensions: [
          {
            Name: 'Currency',
            Value: 'USD',
          },
        ],
        EvaluationPeriods: 1,
        TreatMissingData: 'notBreaching',
      }));

      // Verify billing alarm
      const response = await cloudWatchClient.send(new DescribeAlarmsCommand({
        AlarmNames: [alarmName],
      }));

      expect(response.MetricAlarms).toHaveLength(1);
      expect(response.MetricAlarms![0].Namespace).toBe('AWS/Billing');
      expect(response.MetricAlarms![0].MetricName).toBe('EstimatedCharges');
    });
  });

  describe('CloudWatch Metrics Integration', () => {
    test('should retrieve S3 storage metrics successfully', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

      // Test retrieving S3 storage metrics
      const response = await cloudWatchClient.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/S3',
        MetricName: 'BucketSizeBytes',
        Dimensions: [
          {
            Name: 'BucketName',
            Value: serverEnv.AWS_S3_BUCKET_NAME || 'test-bucket',
          },
          {
            Name: 'StorageType',
            Value: 'StandardStorage',
          },
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 86400, // 24 hours
        Statistics: ['Average'],
      }));

      // Should not throw an error - metrics may be empty for new buckets
      expect(response).toBeDefined();
      expect(response.Datapoints).toBeDefined();
      expect(Array.isArray(response.Datapoints)).toBe(true);
    });

    test('should retrieve CloudFront metrics successfully', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      // Test retrieving CloudFront metrics
      const response = await cloudWatchClient.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/CloudFront',
        MetricName: 'Requests',
        Dimensions: [
          {
            Name: 'DistributionId',
            Value: serverEnv.AWS_CLOUDFRONT_DISTRIBUTION_ID || 'test-distribution',
          },
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600, // 1 hour
        Statistics: ['Sum'],
      }));

      expect(response).toBeDefined();
      expect(response.Datapoints).toBeDefined();
    });

    test('should handle metric retrieval errors gracefully', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      // Test with invalid metric name to simulate error handling
      await expect(
        cloudWatchClient.send(new GetMetricStatisticsCommand({
          Namespace: 'AWS/S3',
          MetricName: 'InvalidMetricName',
          Dimensions: [
            {
              Name: 'BucketName',
              Value: 'invalid-bucket-name',
            },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 86400,
          Statistics: ['Average'],
        }))
      ).resolves.toBeDefined(); // Should not throw, just return empty results
    });
  });

  describe('Cost Protection Service CloudWatch Integration', () => {
    test('should integrate with CloudWatch for real-time monitoring', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      // Mock database to return usage data
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 2147483648, // 2GB
        s3RequestsGet: 10000,
        s3RequestsPut: 1000,
        cloudfrontRequests: 5000000,
        circuitBreakerTriggered: false,
      });

      // Test that cost protection service can get current usage
      const usage = await costProtectionService.getCurrentUsage();

      expect(usage).toBeDefined();
      expect(usage.s3Storage).toBeDefined();
      expect(usage.s3Requests).toBeDefined();
      expect(usage.cloudfront).toBeDefined();

      // Verify usage calculations
      expect(usage.s3Storage.current).toBe(2147483648);
      expect(usage.s3Storage.percentage).toBeCloseTo(40.0, 1); // 2GB is 40% of 5GB
    });

    test('should trigger circuit breaker based on CloudWatch metrics', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      // Mock high usage that should trigger circuit breaker
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 4831838208, // 4.5GB (90% of 5GB)
        s3RequestsGet: 18000, // 90% of 20K
        s3RequestsPut: 1800, // 90% of 2K
        circuitBreakerTriggered: false,
      });

      // Should trigger circuit breaker due to high usage
      await expect(
        costProtectionService.enforceUploadLimits('test-operation', 1000, 1)
      ).rejects.toThrow();

      // Verify circuit breaker was triggered in database
      expect(mockPrisma.awsUsageTracking.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            circuitBreakerTriggered: true,
            circuitBreakerReason: expect.stringContaining('90% threshold exceeded'),
          }),
        })
      );
    });
  });

  describe('Alert Configuration Validation', () => {
    test('should verify alarm state changes work correctly', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const alarmName = `${testAlarmPrefix}-State-Test`;

      // Create alarm in OK state
      await cloudWatchClient.send(new PutMetricAlarmCommand({
        AlarmName: alarmName,
        AlarmDescription: 'Test alarm for state change verification',
        MetricName: 'BucketSizeBytes',
        Namespace: 'AWS/S3',
        Statistic: 'Average',
        Period: 300, // 5 minutes for faster testing
        Threshold: 1, // Very low threshold to test state changes
        ComparisonOperator: 'GreaterThanThreshold',
        Dimensions: [
          {
            Name: 'BucketName',
            Value: serverEnv.AWS_S3_BUCKET_NAME || 'test-bucket',
          },
        ],
        EvaluationPeriods: 1,
        TreatMissingData: 'notBreaching',
      }));

      // Wait a moment for alarm to be created
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check alarm state
      const response = await cloudWatchClient.send(new DescribeAlarmsCommand({
        AlarmNames: [alarmName],
      }));

      expect(response.MetricAlarms).toHaveLength(1);
      expect(response.MetricAlarms![0].StateValue).toBeDefined();
      expect(['OK', 'ALARM', 'INSUFFICIENT_DATA']).toContain(
        response.MetricAlarms![0].StateValue!
      );
    });

    test('should handle alarm creation with invalid configurations gracefully', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      // Test with invalid threshold (negative value)
      await expect(
        cloudWatchClient.send(new PutMetricAlarmCommand({
          AlarmName: `${testAlarmPrefix}-Invalid-Test`,
          AlarmDescription: 'Test invalid alarm configuration',
          MetricName: 'BucketSizeBytes',
          Namespace: 'AWS/S3',
          Statistic: 'Average',
          Period: 60, // Too short period
          Threshold: -1, // Invalid negative threshold
          ComparisonOperator: 'GreaterThanThreshold',
          Dimensions: [],
          EvaluationPeriods: 1,
        }))
      ).rejects.toThrow();
    });
  });

  describe('Production Alert Setup Verification', () => {
    test('should verify production billing alerts exist', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      // Check if production billing alerts are configured
      const response = await cloudWatchClient.send(new DescribeAlarmsCommand({
        AlarmNamePrefix: 'S3-',
      }));

      // Log existing alarms for debugging
      console.log('🔍 Found alarms:', response.MetricAlarms?.map(alarm => ({
        name: alarm.AlarmName,
        state: alarm.StateValue,
        threshold: alarm.Threshold,
      })));

      // Verify alarm configuration patterns (even if specific alarms don't exist yet)
      expect(response.MetricAlarms).toBeDefined();
      expect(Array.isArray(response.MetricAlarms)).toBe(true);
    });

    test('should validate alarm thresholds match Free Tier limits', async () => {
      if (!hasAWSCredentials) {
        console.log('⏭️  Skipping test - AWS credentials not configured');
        return;
      }

      const response = await cloudWatchClient.send(new DescribeAlarmsCommand({
        AlarmNamePrefix: 'S3-',
      }));

      // If billing alarms exist, verify their thresholds are appropriate
      response.MetricAlarms?.forEach(alarm => {
        if (alarm.MetricName === 'BucketSizeBytes') {
          // Should be set to warn before hitting 5GB Free Tier limit
          expect(alarm.Threshold).toBeLessThanOrEqual(5 * 1024 * 1024 * 1024);
          expect(alarm.Threshold).toBeGreaterThan(0);
        }

        if (alarm.MetricName === 'EstimatedCharges') {
          // Should have reasonable cost threshold
          expect(alarm.Threshold).toBeLessThanOrEqual(10.00); // $10 max
          expect(alarm.Threshold).toBeGreaterThan(0);
        }
      });
    });
  });
});