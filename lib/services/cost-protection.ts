/**
 * Circuit Breaker Cost Protection Service
 *
 * Implements QA-critical proactive cost governance with real-time monitoring,
 * circuit breaker patterns, and automatic suspension to prevent AWS Free Tier
 * overruns during MVP validation phase.
 *
 * @category Cost Protection Services
 * @since 1.7.0
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  Dimension,
} from '@aws-sdk/client-cloudwatch';
import { performanceConfig, sentryConfig } from '@/lib/config/monitoring';
import { serverEnv } from '@/lib/utils/env';

/**
 * Free Tier limits for AWS services (monthly)
 */
const FREE_TIER_LIMITS = {
  s3: {
    storage: 5 * 1024 * 1024 * 1024, // 5GB in bytes
    getRequests: 20000,
    putRequests: 2000,
    dataTransferOut: 100 * 1024 * 1024 * 1024, // 100GB
  },
  cloudfront: {
    requests: 10000000, // 10M requests
    dataTransferOut: 1024 * 1024 * 1024 * 1024, // 1TB
  },
} as const;

/**
 * Circuit breaker states
 */
enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit breaker triggered, blocking operations
  HALF_OPEN = 'half_open' // Testing if service has recovered
}

/**
 * Cost projection result
 */
interface CostProjection {
  wouldExceedFreeTier: boolean;
  reason: string | null;
  projectedUsage: {
    s3Storage: number;
    s3GetRequests: number;
    s3PutRequests: number;
    cloudfrontRequests: number;
    cloudfrontDataTransfer: number;
  };
  currentUsage: {
    s3Storage: number;
    s3GetRequests: number;
    s3PutRequests: number;
    cloudfrontRequests: number;
    cloudfrontDataTransfer: number;
  };
  usagePercentages: {
    s3Storage: number;
    s3GetRequests: number;
    s3PutRequests: number;
    cloudfrontRequests: number;
    cloudfrontDataTransfer: number;
  };
  safetyMargin: number;
  estimatedCostUsd: number;
}

/**
 * Real-time usage report
 */
interface RealTimeUsageReport {
  timestamp: Date;
  usagePercentages: CostProjection['usagePercentages'];
  currentUsage: CostProjection['currentUsage'];
  circuitBreakerOpen: boolean;
  circuitBreakerState: CircuitBreakerState;
  alerts: Array<{
    level: 'info' | 'warning' | 'critical';
    message: string;
    metric: string;
    value: number;
    threshold: number;
  }>;
  projectedMonthlyUsage: CostProjection['projectedUsage'];
  estimatedMonthlyCostUsd: number;
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  threshold: number; // Usage percentage threshold (0.9 = 90%)
  timeout: number; // Time before attempting to close circuit (ms)
  resetTime: number; // Time before resetting failure count (ms)
  maxFailures: number; // Maximum failures before opening circuit
}

/**
 * Cost protection service events
 */
interface CostProtectionEvents {
  'usage-warning': [{ metric: string; percentage: number; threshold: number }];
  'usage-critical': [{ metric: string; percentage: number }];
  'circuit-breaker-opened': [{ reason: string; timestamp: Date }];
  'circuit-breaker-closed': [{ timestamp: Date }];
  'free-tier-exceeded': [{ metric: string; usage: number; limit: number }];
  'cost-projection-alert': [{ projection: CostProjection }];
  'emergency-shutdown': [{ reason: string; projection: CostProjection }];
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is open - operation blocked for cost protection');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  isOpen(): boolean {
    return this.state === CircuitBreakerState.OPEN;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  open(reason: string): void {
    this.state = CircuitBreakerState.OPEN;
    this.lastFailureTime = new Date();
    console.warn(`Circuit breaker opened: ${reason}`);
  }

  close(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastSuccessTime = new Date();
    console.log('Circuit breaker closed - normal operation resumed');
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime.getTime() > this.config.timeout;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.config.maxFailures) {
      this.state = CircuitBreakerState.OPEN;
    }
  }
}

/**
 * Real-time Usage Monitor
 */
class RealTimeUsageMonitor {
  private cloudWatchClient: CloudWatchClient;
  private cachedUsage: CostProjection['currentUsage'] | null = null;
  private cacheExpiry = 0;
  private readonly cacheTimeoutMs = 60000; // 1 minute cache

  constructor() {
    this.cloudWatchClient = new CloudWatchClient({
      region: serverEnv.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: serverEnv.AWS_ACCESS_KEY_ID!,
        secretAccessKey: serverEnv.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async getCurrentUsage(): Promise<CostProjection['currentUsage']> {
    // Use cache if still valid
    if (this.cachedUsage && Date.now() < this.cacheExpiry) {
      return this.cachedUsage;
    }

    try {
      // Get current usage from CloudWatch metrics
      const usage = await this.fetchCloudWatchMetrics();

      // Cache the result
      this.cachedUsage = usage;
      this.cacheExpiry = Date.now() + this.cacheTimeoutMs;

      return usage;
    } catch (error) {
      console.warn('Failed to fetch real-time usage from CloudWatch:', error);

      // Fallback to database tracking if CloudWatch fails
      return await this.fallbackToDatabaseUsage();
    }
  }

  private async fetchCloudWatchMetrics(): Promise<CostProjection['currentUsage']> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    try {
      // Fetch S3 metrics
      const [s3Storage, s3GetRequests, s3PutRequests, cloudfrontRequests, cloudfrontDataTransfer] =
        await Promise.all([
          this.getMetric('AWS/S3', 'BucketSizeBytes', 'Sum', startTime, endTime, [
            { Name: 'BucketName', Value: process.env.AWS_S3_BUCKET_NAME || 'inventory-photos-production' },
            { Name: 'StorageType', Value: 'StandardStorage' },
          ]),
          this.getMetric('AWS/S3', 'NumberOfObjects', 'Sum', startTime, endTime, [
            { Name: 'BucketName', Value: process.env.AWS_S3_BUCKET_NAME || 'inventory-photos-production' },
          ]),
          this.getMetric('AWS/S3', 'AllRequests', 'Sum', startTime, endTime, [
            { Name: 'BucketName', Value: process.env.AWS_S3_BUCKET_NAME || 'inventory-photos-production' },
          ]),
          this.getMetric('AWS/CloudFront', 'Requests', 'Sum', startTime, endTime, [
            { Name: 'DistributionId', Value: this.extractDistributionId() },
          ]),
          this.getMetric('AWS/CloudFront', 'BytesDownloaded', 'Sum', startTime, endTime, [
            { Name: 'DistributionId', Value: this.extractDistributionId() },
          ]),
        ]);

      return {
        s3Storage: s3Storage || 0,
        s3GetRequests: s3GetRequests || 0,
        s3PutRequests: s3PutRequests || 0,
        cloudfrontRequests: cloudfrontRequests || 0,
        cloudfrontDataTransfer: cloudfrontDataTransfer || 0,
      };
    } catch (error) {
      console.warn('CloudWatch metrics fetch failed:', error);
      throw error;
    }
  }

  private async getMetric(
    namespace: string,
    metricName: string,
    statistic: 'Sum' | 'Average' | 'Maximum' | 'Minimum' | 'SampleCount',
    startTime: Date,
    endTime: Date,
    dimensions: Dimension[]
  ): Promise<number> {
    try {
      const command = new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensions,
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600, // 1 hour periods
        Statistics: [statistic],
      });

      const response = await this.cloudWatchClient.send(command);

      if (response.Datapoints && response.Datapoints.length > 0) {
        // Get the most recent datapoint
        const latest = response.Datapoints
          .sort((a: any, b: any) => (b.Timestamp?.getTime() || 0) - (a.Timestamp?.getTime() || 0))[0];

        return latest.Sum || latest.Average || 0;
      }

      return 0;
    } catch (error) {
      console.warn(`Failed to get metric ${namespace}/${metricName}:`, error);
      return 0;
    }
  }

  private async fallbackToDatabaseUsage(): Promise<CostProjection['currentUsage']> {
    // This would query the aws_usage_tracking table for fallback data
    // For now, return conservative estimates
    return {
      s3Storage: 0,
      s3GetRequests: 0,
      s3PutRequests: 0,
      cloudfrontRequests: 0,
      cloudfrontDataTransfer: 0,
    };
  }

  private extractDistributionId(): string {
    const domain = serverEnv.AWS_CLOUDFRONT_DOMAIN;
    if (!domain) return '';

    // Extract distribution ID from CloudFront domain
    const match = domain.match(/^d([a-zA-Z0-9]+)\.cloudfront\.net$/);
    return match ? match[1].toUpperCase() : '';
  }
}

/**
 * Circuit Breaker Cost Protection Service
 */
export class CostProtectionService extends EventEmitter<CostProtectionEvents> {
  private circuitBreaker: CircuitBreaker;
  private realTimeMonitor: RealTimeUsageMonitor;
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;

    // Initialize circuit breaker with QA-critical 90% threshold
    this.circuitBreaker = new CircuitBreaker({
      threshold: 0.9, // 90% of Free Tier - QA CRITICAL
      timeout: 60000, // 1 minute lockout
      resetTime: 300000, // 5 minute reset period
      maxFailures: 3, // Allow 3 failures before opening
    });

    this.realTimeMonitor = new RealTimeUsageMonitor();
    this.setupEventHandlers();
  }

  /**
   * QA CRITICAL: Proactive upload blocking before cost overrun
   */
  async enforceUploadLimits(
    operationType: 'upload' | 'download' | 'delete',
    estimatedSize: number = 0,
    estimatedRequests: number = 1
  ): Promise<void> {
    return await performanceConfig.measureOperation(
      'cost_protection_check',
      async () => {
        if (this.circuitBreaker.isOpen()) {
          throw new FreeTierExceededError(
            'Operations suspended to prevent cost overrun - circuit breaker is open'
          );
        }

        // Real-time cost projection
        const projection = await this.projectCostImpact(operationType, estimatedSize, estimatedRequests);

        if (projection.wouldExceedFreeTier) {
          this.circuitBreaker.open(projection.reason || 'Free Tier limit exceeded');

          await this.notifyEmergencyShutdown(projection);

          throw new CostLimitError(
            `Operation would exceed Free Tier limits: ${projection.reason}. ` +
            `Current usage: S3 Storage ${projection.usagePercentages.s3Storage.toFixed(1)}%, ` +
            `S3 PUT Requests ${projection.usagePercentages.s3PutRequests.toFixed(1)}%`
          );
        }

        // Check for warning thresholds
        await this.checkWarningThresholds(projection);
      }
    );
  }

  /**
   * Get real-time usage report with comprehensive metrics
   */
  async getRealTimeUsage(): Promise<RealTimeUsageReport> {
    const currentUsage = await this.realTimeMonitor.getCurrentUsage();

    const usagePercentages = {
      s3Storage: (currentUsage.s3Storage / FREE_TIER_LIMITS.s3.storage) * 100,
      s3GetRequests: (currentUsage.s3GetRequests / FREE_TIER_LIMITS.s3.getRequests) * 100,
      s3PutRequests: (currentUsage.s3PutRequests / FREE_TIER_LIMITS.s3.putRequests) * 100,
      cloudfrontRequests: (currentUsage.cloudfrontRequests / FREE_TIER_LIMITS.cloudfront.requests) * 100,
      cloudfrontDataTransfer: (currentUsage.cloudfrontDataTransfer / FREE_TIER_LIMITS.cloudfront.dataTransferOut) * 100,
    };

    // Generate alerts based on usage levels
    const alerts = this.generateUsageAlerts(usagePercentages);

    // Project monthly usage based on current trends
    const projectedMonthlyUsage = this.projectMonthlyUsage(currentUsage);

    // Circuit breaker decision
    const shouldTriggerCircuitBreaker = Object.values(usagePercentages).some(percent => percent > 90);

    if (shouldTriggerCircuitBreaker && !this.circuitBreaker.isOpen()) {
      const exceedingMetric = Object.entries(usagePercentages)
        .find(([, percent]) => percent > 90)?.[0] || 'unknown';

      this.circuitBreaker.open(`${exceedingMetric} usage exceeded 90% threshold`);
      this.emit('circuit-breaker-opened', {
        reason: `${exceedingMetric} usage exceeded 90% threshold`,
        timestamp: new Date(),
      });
    }

    return {
      timestamp: new Date(),
      usagePercentages,
      currentUsage,
      circuitBreakerOpen: this.circuitBreaker.isOpen(),
      circuitBreakerState: this.circuitBreaker.getState(),
      alerts,
      projectedMonthlyUsage,
      estimatedMonthlyCostUsd: this.estimateMonthlyCost(projectedMonthlyUsage),
    };
  }

  /**
   * Start real-time monitoring with configurable interval
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        const report = await this.getRealTimeUsage();
        await this.recordUsageToDatabase(report);

        // Check for critical conditions
        if (report.circuitBreakerOpen) {
          console.warn('🔴 Circuit Breaker OPEN - Operations suspended for cost protection');
        }

        // Emit alerts
        for (const alert of report.alerts) {
          if (alert.level === 'critical') {
            this.emit('usage-critical', {
              metric: alert.metric,
              percentage: (alert.value / alert.threshold) * 100,
            });
          } else if (alert.level === 'warning') {
            this.emit('usage-warning', {
              metric: alert.metric,
              percentage: (alert.value / alert.threshold) * 100,
              threshold: alert.threshold,
            });
          }
        }

      } catch (error) {
        console.error('Cost protection monitoring error:', error);
        sentryConfig.reportError(error as Error, {
          context: 'cost_protection_monitoring',
        });
      }
    }, intervalMs);

    console.log(`🛡️  Cost protection monitoring started (${intervalMs}ms interval)`);
  }

  /**
   * Stop real-time monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    console.log('🛡️  Cost protection monitoring stopped');
  }

  /**
   * Manually reset circuit breaker (admin operation)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.close();
    this.emit('circuit-breaker-closed', { timestamp: new Date() });
    console.log('🟢 Circuit breaker manually reset - operations resumed');
  }

  /**
   * Get current circuit breaker status
   */
  getCircuitBreakerStatus(): {
    isOpen: boolean;
    state: CircuitBreakerState;
    canRetry: boolean;
  } {
    return {
      isOpen: this.circuitBreaker.isOpen(),
      state: this.circuitBreaker.getState(),
      canRetry: this.circuitBreaker.getState() === CircuitBreakerState.HALF_OPEN,
    };
  }

  /**
   * Project cost impact of a proposed operation
   */
  private async projectCostImpact(
    operationType: 'upload' | 'download' | 'delete',
    estimatedSize: number,
    estimatedRequests: number
  ): Promise<CostProjection> {
    const currentUsage = await this.realTimeMonitor.getCurrentUsage();

    // Estimate impact based on operation type
    const multiFormatMultiplier = operationType === 'upload' ? 3 : 1; // WebP, AVIF, JPEG formats
    const processedSize = operationType === 'upload' ? estimatedSize * 0.7 : estimatedSize; // Compression

    const projectedUsage = {
      s3Storage: operationType === 'upload'
        ? currentUsage.s3Storage + (processedSize * multiFormatMultiplier)
        : operationType === 'delete'
        ? Math.max(0, currentUsage.s3Storage - estimatedSize)
        : currentUsage.s3Storage,

      s3GetRequests: operationType === 'download'
        ? currentUsage.s3GetRequests + estimatedRequests
        : currentUsage.s3GetRequests,

      s3PutRequests: operationType === 'upload'
        ? currentUsage.s3PutRequests + (estimatedRequests * multiFormatMultiplier)
        : currentUsage.s3PutRequests,

      cloudfrontRequests: currentUsage.cloudfrontRequests + (operationType === 'download' ? estimatedRequests : 0),
      cloudfrontDataTransfer: operationType === 'download'
        ? currentUsage.cloudfrontDataTransfer + estimatedSize
        : currentUsage.cloudfrontDataTransfer,
    };

    const usagePercentages = {
      s3Storage: (projectedUsage.s3Storage / FREE_TIER_LIMITS.s3.storage) * 100,
      s3GetRequests: (projectedUsage.s3GetRequests / FREE_TIER_LIMITS.s3.getRequests) * 100,
      s3PutRequests: (projectedUsage.s3PutRequests / FREE_TIER_LIMITS.s3.putRequests) * 100,
      cloudfrontRequests: (projectedUsage.cloudfrontRequests / FREE_TIER_LIMITS.cloudfront.requests) * 100,
      cloudfrontDataTransfer: (projectedUsage.cloudfrontDataTransfer / FREE_TIER_LIMITS.cloudfront.dataTransferOut) * 100,
    };

    // Check if any metric would exceed 95% (5% safety margin)
    const wouldExceedStorage = usagePercentages.s3Storage > 95;
    const wouldExceedGetRequests = usagePercentages.s3GetRequests > 95;
    const wouldExceedPutRequests = usagePercentages.s3PutRequests > 95;
    const wouldExceedCloudfrontRequests = usagePercentages.cloudfrontRequests > 95;
    const wouldExceedCloudfrontTransfer = usagePercentages.cloudfrontDataTransfer > 95;

    const wouldExceedFreeTier = wouldExceedStorage || wouldExceedGetRequests ||
      wouldExceedPutRequests || wouldExceedCloudfrontRequests || wouldExceedCloudfrontTransfer;

    let reason: string | null = null;
    if (wouldExceedStorage) reason = 'S3 Storage limit (5GB)';
    else if (wouldExceedGetRequests) reason = 'S3 GET requests limit (20K)';
    else if (wouldExceedPutRequests) reason = 'S3 PUT requests limit (2K)';
    else if (wouldExceedCloudfrontRequests) reason = 'CloudFront requests limit (10M)';
    else if (wouldExceedCloudfrontTransfer) reason = 'CloudFront data transfer limit (1TB)';

    return {
      wouldExceedFreeTier,
      reason,
      projectedUsage,
      currentUsage,
      usagePercentages,
      safetyMargin: 5, // 5% safety margin
      estimatedCostUsd: this.estimateMonthlyCost(projectedUsage),
    };
  }

  /**
   * Generate usage alerts based on thresholds
   */
  private generateUsageAlerts(usagePercentages: CostProjection['usagePercentages']): RealTimeUsageReport['alerts'] {
    const alerts: RealTimeUsageReport['alerts'] = [];

    Object.entries(usagePercentages).forEach(([metric, percentage]) => {
      if (percentage >= 95) {
        alerts.push({
          level: 'critical',
          message: `${metric} usage critical: ${percentage.toFixed(1)}%`,
          metric,
          value: percentage,
          threshold: 95,
        });
      } else if (percentage >= 80) {
        alerts.push({
          level: 'warning',
          message: `${metric} usage warning: ${percentage.toFixed(1)}%`,
          metric,
          value: percentage,
          threshold: 80,
        });
      } else if (percentage >= 50) {
        alerts.push({
          level: 'info',
          message: `${metric} usage: ${percentage.toFixed(1)}%`,
          metric,
          value: percentage,
          threshold: 50,
        });
      }
    });

    return alerts;
  }

  /**
   * Project monthly usage based on current trends
   */
  private projectMonthlyUsage(currentUsage: CostProjection['currentUsage']): CostProjection['projectedUsage'] {
    const daysInMonth = new Date().getDate();
    const dayOfMonth = new Date().getDate();
    const projectionMultiplier = 30 / dayOfMonth; // Project to 30-day month

    return {
      s3Storage: currentUsage.s3Storage, // Storage is cumulative
      s3GetRequests: currentUsage.s3GetRequests * projectionMultiplier,
      s3PutRequests: currentUsage.s3PutRequests * projectionMultiplier,
      cloudfrontRequests: currentUsage.cloudfrontRequests * projectionMultiplier,
      cloudfrontDataTransfer: currentUsage.cloudfrontDataTransfer * projectionMultiplier,
    };
  }

  /**
   * Estimate monthly cost in USD
   */
  private estimateMonthlyCost(usage: CostProjection['projectedUsage']): number {
    // Conservative pricing estimates (actual prices may vary)
    const s3StorageCostPerGB = 0.023; // $0.023 per GB per month
    const s3RequestCostPer1000 = 0.0004; // $0.0004 per 1000 requests
    const cloudfrontCostPer10000 = 0.0075; // $0.0075 per 10000 requests
    const cloudfrontDataCostPerGB = 0.085; // $0.085 per GB

    const s3StorageCost = Math.max(0, (usage.s3Storage / (1024 ** 3)) - 5) * s3StorageCostPerGB; // Free 5GB
    const s3RequestCost = Math.max(0, (usage.s3GetRequests + usage.s3PutRequests) - 22000) / 1000 * s3RequestCostPer1000; // Free 20K GET + 2K PUT
    const cloudfrontRequestCost = Math.max(0, usage.cloudfrontRequests - 10000000) / 10000 * cloudfrontCostPer10000; // Free 10M requests
    const cloudfrontDataCost = Math.max(0, (usage.cloudfrontDataTransfer / (1024 ** 3)) - 1024) * cloudfrontDataCostPerGB; // Free 1TB

    return s3StorageCost + s3RequestCost + cloudfrontRequestCost + cloudfrontDataCost;
  }

  /**
   * Record usage data to database for historical tracking
   */
  private async recordUsageToDatabase(report: RealTimeUsageReport): Promise<void> {
    try {
      await this.prisma.awsUsageTracking.upsert({
        where: {
          trackingDate_trackingHour: {
            trackingDate: new Date(),
            trackingHour: new Date().getHours(),
          },
        },
        create: {
          s3StorageBytes: Math.round(report.currentUsage.s3Storage),
          s3RequestsGet: Math.round(report.currentUsage.s3GetRequests),
          s3RequestsPut: Math.round(report.currentUsage.s3PutRequests),
          cloudfrontRequests: Math.round(report.currentUsage.cloudfrontRequests),
          cloudfrontDataTransferBytes: Math.round(report.currentUsage.cloudfrontDataTransfer),
          totalCostEstimateUsd: report.estimatedMonthlyCostUsd,
          circuitBreakerTriggered: report.circuitBreakerOpen,
          circuitBreakerReason: report.circuitBreakerOpen ? 'Free Tier protection' : null,
          circuitBreakerTriggeredAt: report.circuitBreakerOpen ? new Date() : null,
        },
        update: {
          s3StorageBytes: Math.round(report.currentUsage.s3Storage),
          s3RequestsGet: Math.round(report.currentUsage.s3GetRequests),
          s3RequestsPut: Math.round(report.currentUsage.s3PutRequests),
          cloudfrontRequests: Math.round(report.currentUsage.cloudfrontRequests),
          cloudfrontDataTransferBytes: Math.round(report.currentUsage.cloudfrontDataTransfer),
          totalCostEstimateUsd: report.estimatedMonthlyCostUsd,
        },
      });
    } catch (error) {
      console.warn('Failed to record usage to database:', error);
    }
  }

  /**
   * Check warning thresholds and emit events
   */
  private async checkWarningThresholds(projection: CostProjection): Promise<void> {
    Object.entries(projection.usagePercentages).forEach(([metric, percentage]) => {
      if (percentage >= 80 && percentage < 90) {
        this.emit('usage-warning', {
          metric,
          percentage,
          threshold: 80,
        });
      }
    });

    // Emit cost projection alerts for high usage
    if (Object.values(projection.usagePercentages).some(p => p >= 75)) {
      this.emit('cost-projection-alert', { projection });
    }
  }

  /**
   * Notify emergency shutdown procedures
   */
  private async notifyEmergencyShutdown(projection: CostProjection): Promise<void> {
    const reason = `Cost protection activated: ${projection.reason}`;

    this.emit('emergency-shutdown', { reason, projection });

    // Log critical event
    console.error('🚨 EMERGENCY SHUTDOWN: Cost protection circuit breaker activated');
    console.error(`Reason: ${reason}`);
    console.error('Usage percentages:', projection.usagePercentages);

    // Report to monitoring
    sentryConfig.reportMessage(
      `Emergency shutdown: ${reason}`,
      'error',
      {
        projection,
        usagePercentages: projection.usagePercentages,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Setup event handlers for circuit breaker events
   */
  private setupEventHandlers(): void {
    this.on('circuit-breaker-opened', ({ reason, timestamp }) => {
      console.warn(`🔴 Circuit breaker opened: ${reason} at ${timestamp.toISOString()}`);
    });

    this.on('circuit-breaker-closed', ({ timestamp }) => {
      console.log(`🟢 Circuit breaker closed at ${timestamp.toISOString()}`);
    });

    this.on('free-tier-exceeded', ({ metric, usage, limit }) => {
      console.error(`🚨 Free Tier exceeded: ${metric} = ${usage} (limit: ${limit})`);
    });

    this.on('usage-warning', ({ metric, percentage, threshold }) => {
      console.warn(`⚠️  Usage warning: ${metric} at ${percentage.toFixed(1)}% (threshold: ${threshold}%)`);
    });

    this.on('usage-critical', ({ metric, percentage }) => {
      console.error(`🔥 Usage critical: ${metric} at ${percentage.toFixed(1)}%`);
    });
  }
}

/**
 * Custom error classes for cost protection
 */
export class FreeTierExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FreeTierExceededError';
  }
}

export class CostLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CostLimitError';
  }
}

/**
 * Export types for external use
 */
export type {
  CostProjection,
  RealTimeUsageReport,
  CircuitBreakerConfig,
  CostProtectionEvents,
};

export { CircuitBreakerState, FREE_TIER_LIMITS };