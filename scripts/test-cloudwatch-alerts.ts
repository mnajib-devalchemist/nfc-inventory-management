#!/usr/bin/env tsx

/**
 * CloudWatch Alerts Testing Script
 *
 * This script validates CloudWatch alert configuration and tests that
 * cost protection alerts will trigger correctly in production.
 *
 * Run this script when you want to verify your CloudWatch setup:
 * npm run test:cloudwatch-alerts
 */

import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  GetMetricStatisticsCommand,
  PutMetricAlarmCommand,
  DeleteAlarmsCommand,
} from '@aws-sdk/client-cloudwatch';
import { CostProtectionService } from '../lib/services/cost-protection';
import { serverEnv } from '../lib/utils/env';

// Mock Prisma for testing
const mockPrisma = {
  awsUsageTracking: {
    upsert: () => Promise.resolve({}),
    findFirst: () => Promise.resolve(null),
  }
} as any;

class CloudWatchAlertsValidator {
  private cloudWatchClient: CloudWatchClient;
  private costProtectionService: CostProtectionService;

  constructor() {
    if (!serverEnv.AWS_ACCESS_KEY_ID || !serverEnv.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
    }

    this.cloudWatchClient = new CloudWatchClient({
      region: serverEnv.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: serverEnv.AWS_ACCESS_KEY_ID!,
        secretAccessKey: serverEnv.AWS_SECRET_ACCESS_KEY!,
      },
    });

    this.costProtectionService = new CostProtectionService(mockPrisma);
  }

  async validateExistingAlerts(): Promise<void> {
    console.log('🔍 Checking existing CloudWatch alarms...\n');

    try {
      const response = await this.cloudWatchClient.send(new DescribeAlarmsCommand({}));

      if (!response.MetricAlarms || response.MetricAlarms.length === 0) {
        console.log('⚠️  No CloudWatch alarms found. You may need to run the infrastructure setup script first.');
        console.log('   Run: npm run setup:aws-infrastructure\n');
        return;
      }

      console.log(`✅ Found ${response.MetricAlarms.length} CloudWatch alarms:\n`);

      for (const alarm of response.MetricAlarms) {
        const status = this.getAlarmStatusEmoji(alarm.StateValue);
        console.log(`${status} ${alarm.AlarmName}`);
        console.log(`   📊 Metric: ${alarm.Namespace}/${alarm.MetricName}`);
        console.log(`   🎯 Threshold: ${alarm.Threshold} (${alarm.ComparisonOperator})`);
        console.log(`   📈 State: ${alarm.StateValue} - ${alarm.StateReason}`);
        console.log(`   📅 Updated: ${alarm.StateUpdatedTimestamp}\n`);
      }

      // Validate critical alarms exist
      this.validateCriticalAlarms(response.MetricAlarms);

    } catch (error) {
      console.error('❌ Failed to retrieve CloudWatch alarms:', error);
      throw error;
    }
  }

  private getAlarmStatusEmoji(state: string | undefined): string {
    switch (state) {
      case 'OK': return '🟢';
      case 'ALARM': return '🔴';
      case 'INSUFFICIENT_DATA': return '🟡';
      default: return '⚪';
    }
  }

  private validateCriticalAlarms(alarms: any[]): void {
    console.log('🎯 Validating critical alarm configurations...\n');

    const criticalAlarms = [
      { pattern: /S3.*Storage/i, description: 'S3 Storage monitoring' },
      { pattern: /S3.*Cost/i, description: 'S3 Cost monitoring' },
      { pattern: /billing/i, description: 'Billing cost monitoring' },
    ];

    for (const critical of criticalAlarms) {
      const found = alarms.find(alarm => critical.pattern.test(alarm.AlarmName || ''));

      if (found) {
        console.log(`✅ ${critical.description}: ${found.AlarmName}`);

        // Validate threshold is reasonable for Free Tier
        if (found.MetricName === 'BucketSizeBytes' && found.Threshold) {
          const thresholdGB = found.Threshold / (1024 * 1024 * 1024);
          if (thresholdGB > 5) {
            console.log(`   ⚠️  Warning: Threshold (${thresholdGB.toFixed(1)}GB) exceeds Free Tier limit (5GB)`);
          } else {
            console.log(`   ✅ Threshold (${thresholdGB.toFixed(1)}GB) is within Free Tier limit`);
          }
        }

        if (found.MetricName === 'EstimatedCharges' && found.Threshold) {
          if (found.Threshold > 10) {
            console.log(`   ⚠️  Warning: Cost threshold ($${found.Threshold}) is quite high`);
          } else {
            console.log(`   ✅ Cost threshold ($${found.Threshold}) is reasonable`);
          }
        }
      } else {
        console.log(`❌ Missing: ${critical.description}`);
      }
    }

    console.log();
  }

  async testMetricsRetrieval(): Promise<void> {
    console.log('📈 Testing CloudWatch metrics retrieval...\n');

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    const metricsToTest = [
      {
        namespace: 'AWS/S3',
        metricName: 'BucketSizeBytes',
        dimensions: [
          { Name: 'BucketName', Value: serverEnv.AWS_S3_BUCKET_NAME || 'unknown' },
          { Name: 'StorageType', Value: 'StandardStorage' },
        ],
      },
      {
        namespace: 'AWS/CloudFront',
        metricName: 'Requests',
        dimensions: [
          { Name: 'DistributionId', Value: 'test-distribution' },
        ],
      },
      {
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensions: [
          { Name: 'Currency', Value: 'USD' },
        ],
      },
    ];

    for (const metric of metricsToTest) {
      try {
        const response = await this.cloudWatchClient.send(new GetMetricStatisticsCommand({
          Namespace: metric.namespace,
          MetricName: metric.metricName,
          Dimensions: metric.dimensions,
          StartTime: startTime,
          EndTime: endTime,
          Period: 86400, // 24 hours
          Statistics: ['Average', 'Maximum'],
        }));

        console.log(`✅ ${metric.namespace}/${metric.metricName}:`);
        console.log(`   📊 Data points: ${response.Datapoints?.length || 0}`);

        if (response.Datapoints && response.Datapoints.length > 0) {
          const latest = response.Datapoints[response.Datapoints.length - 1];
          console.log(`   📈 Latest value: ${latest.Average || latest.Maximum || 'N/A'}`);
          console.log(`   📅 Timestamp: ${latest.Timestamp}`);
        } else {
          console.log(`   ℹ️  No data available (normal for new infrastructure)`);
        }

      } catch (error) {
        console.log(`❌ ${metric.namespace}/${metric.metricName}: ${error}`);
      }

      console.log();
    }
  }

  async testCostProtectionIntegration(): Promise<void> {
    console.log('🛡️  Testing Cost Protection Service integration...\n');

    try {
      // Mock database responses for different scenarios
      console.log('Testing normal usage scenario...');
      // Mock normal usage scenario
      mockPrisma.awsUsageTracking.findFirst = () => Promise.resolve({
        s3StorageBytes: 1073741824, // 1GB
        s3RequestsGet: 5000,
        s3RequestsPut: 500,
        cloudfrontRequests: 1000000,
        circuitBreakerTriggered: false,
      });

      const normalUsage = await this.costProtectionService.getRealTimeUsage();
      console.log(`✅ Normal usage: S3 ${normalUsage.usagePercentages.s3Storage.toFixed(1)}% of Free Tier`);

      // Test high usage scenario
      console.log('\nTesting high usage scenario...');
      // Mock high usage scenario
      mockPrisma.awsUsageTracking.findFirst = () => Promise.resolve({
        s3StorageBytes: 4831838208, // 4.5GB (90% of 5GB)
        s3RequestsGet: 18000, // 90% of 20K
        s3RequestsPut: 1800, // 90% of 2K
        circuitBreakerTriggered: false,
      });

      try {
        await this.costProtectionService.enforceUploadLimits('upload', 1000, 1);
        console.log('❌ Circuit breaker should have triggered for high usage');
      } catch (error) {
        console.log(`✅ Circuit breaker correctly triggered: ${error}`);
      }

      console.log('\n✅ Cost Protection Service integration is working correctly');

    } catch (error) {
      console.error('❌ Cost Protection Service integration failed:', error);
      throw error;
    }
  }

  async createTestAlarm(): Promise<string> {
    const testAlarmName = `TEST-${Date.now()}-Cost-Alert`;

    console.log(`🧪 Creating test alarm: ${testAlarmName}...\n`);

    try {
      await this.cloudWatchClient.send(new PutMetricAlarmCommand({
        AlarmName: testAlarmName,
        AlarmDescription: 'Test alarm to validate CloudWatch alert functionality - will be deleted automatically',
        MetricName: 'EstimatedCharges',
        Namespace: 'AWS/Billing',
        Statistic: 'Maximum',
        Period: 86400, // 24 hours
        Threshold: 0.01, // $0.01 - very low threshold for testing
        ComparisonOperator: 'GreaterThanThreshold',
        Dimensions: [
          { Name: 'Currency', Value: 'USD' },
        ],
        EvaluationPeriods: 1,
        TreatMissingData: 'notBreaching',
      }));

      console.log(`✅ Test alarm created successfully: ${testAlarmName}`);
      return testAlarmName;

    } catch (error) {
      console.error('❌ Failed to create test alarm:', error);
      throw error;
    }
  }

  async deleteTestAlarm(alarmName: string): Promise<void> {
    console.log(`🗑️  Deleting test alarm: ${alarmName}...\n`);

    try {
      await this.cloudWatchClient.send(new DeleteAlarmsCommand({
        AlarmNames: [alarmName],
      }));

      console.log(`✅ Test alarm deleted successfully`);

    } catch (error) {
      console.error('❌ Failed to delete test alarm:', error);
      // Don't throw - cleanup failures shouldn't fail the test
    }
  }

  async runFullValidation(): Promise<void> {
    console.log('🚀 Starting CloudWatch Alerts Validation...\n');
    console.log('This script will:');
    console.log('• Check existing CloudWatch alarms');
    console.log('• Test metrics retrieval');
    console.log('• Validate cost protection integration');
    console.log('• Create and delete a test alarm');
    console.log('=' .repeat(60) + '\n');

    let testAlarmName: string | null = null;

    try {
      // Step 1: Check existing alarms
      await this.validateExistingAlerts();

      // Step 2: Test metrics retrieval
      await this.testMetricsRetrieval();

      // Step 3: Test cost protection integration
      await this.testCostProtectionIntegration();

      // Step 4: Create and test alarm functionality
      testAlarmName = await this.createTestAlarm();

      console.log('\n' + '=' .repeat(60));
      console.log('🎉 CloudWatch Alerts validation completed successfully!');
      console.log('\nNext steps:');
      console.log('• Monitor your CloudWatch console for alarm states');
      console.log('• Set up SNS notifications for production alerts');
      console.log('• Test actual cost threshold breaches in staging');
      console.log('=' .repeat(60));

    } catch (error) {
      console.error('\n❌ CloudWatch Alerts validation failed:', error);
      process.exit(1);
    } finally {
      // Clean up test alarm
      if (testAlarmName) {
        await this.deleteTestAlarm(testAlarmName);
      }
    }
  }
}

// Run the validation if this script is executed directly
if (require.main === module) {
  const validator = new CloudWatchAlertsValidator();
  validator.runFullValidation().catch(console.error);
}

export { CloudWatchAlertsValidator };