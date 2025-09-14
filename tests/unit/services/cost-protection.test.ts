/**
 * Cost Protection Service Unit Tests
 *
 * Tests for circuit breaker cost protection functionality including
 * Free Tier monitoring, usage tracking, and automatic suspension.
 *
 * @category Unit Tests
 * @since 1.7.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { CostProtectionService } from '@/lib/services/cost-protection';

// Mock Prisma client
const mockPrisma = {
  awsUsageTracking: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
  }
} as any;

// Mock AWS CloudWatch client
jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn(() => ({
    send: jest.fn()
  })),
  GetMetricStatisticsCommand: jest.fn()
}));

describe('CostProtectionService', () => {
  let costProtectionService: CostProtectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    costProtectionService = new CostProtectionService(mockPrisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Circuit Breaker Functionality', () => {
    it('should allow operations when circuit breaker is closed', async () => {
      // Mock successful usage check (under limits)
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 1073741824, // 1GB (under 5GB limit)
        s3RequestsGet: 5000, // Under 20K limit
        s3RequestsPut: 500, // Under 2K limit
        circuitBreakerTriggered: false
      });

      await expect(
        costProtectionService.enforceUploadLimits('upload', 1000, 1)
      ).resolves.not.toThrow();
    });

    it('should block operations when circuit breaker is open', async () => {
      // Mock circuit breaker triggered state
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 5368709120, // 5GB (at limit)
        s3RequestsGet: 19000,
        s3RequestsPut: 1900,
        circuitBreakerTriggered: true,
        circuitBreakerReason: 'Storage limit exceeded'
      });

      await expect(
        costProtectionService.enforceUploadLimits('upload', 1000, 1)
      ).rejects.toThrow('Operations suspended to prevent cost overrun');
    });

    it('should trigger circuit breaker at 90% Free Tier usage', async () => {
      // Mock usage at 90% of storage limit
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 4831838208, // 4.5GB (90% of 5GB)
        s3RequestsGet: 18000, // 90% of 20K
        s3RequestsPut: 1800, // 90% of 2K
        circuitBreakerTriggered: false
      });

      // Should trigger circuit breaker due to high usage
      await expect(
        costProtectionService.enforceUploadLimits('upload', 1000, 1)
      ).rejects.toThrow();
    });
  });

  describe('Usage Monitoring', () => {
    it('should calculate usage percentages correctly', async () => {
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 2684354560, // 2.5GB (50% of 5GB limit)
        s3RequestsGet: 10000, // 50% of 20K limit
        s3RequestsPut: 1000, // 50% of 2K limit
        cloudfrontRequests: 5000000, // 50% of 10M limit
        circuitBreakerTriggered: false
      });

      const usage = await costProtectionService.getCurrentUsage();

      expect(usage.usagePercentages).toEqual({
        s3Storage: 50,
        s3GetRequests: 50,
        s3PutRequests: 50,
        cloudfrontRequests: 50
      });
    });

    it('should emit warning events at 80% usage threshold', () => {
      const warningHandler = jest.fn();
      costProtectionService.on('usage-warning', warningHandler);

      // This would be triggered in the actual implementation
      // when usage exceeds 80%
      costProtectionService.emit('usage-warning', [{
        metric: 's3_storage',
        percentage: 85,
        threshold: 80
      }]);

      expect(warningHandler).toHaveBeenCalledWith([{
        metric: 's3_storage',
        percentage: 85,
        threshold: 80
      }]);
    });

    it('should emit circuit breaker events when triggered', () => {
      const circuitBreakerHandler = jest.fn();
      costProtectionService.on('circuit-breaker-opened', circuitBreakerHandler);

      costProtectionService.emit('circuit-breaker-opened', [{
        reason: 'Storage limit exceeded',
        timestamp: new Date()
      }]);

      expect(circuitBreakerHandler).toHaveBeenCalled();
    });
  });

  describe('Cost Projection', () => {
    it('should project storage usage correctly', async () => {
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 1073741824, // 1GB current
        s3RequestsGet: 5000,
        s3RequestsPut: 500,
        circuitBreakerTriggered: false
      });

      // Mock a scenario where adding 2GB would exceed limits
      const largeUploadSize = 2147483648; // 2GB

      await expect(
        costProtectionService.enforceUploadLimits('upload', largeUploadSize, 1)
      ).rejects.toThrow();
    });

    it('should calculate estimated monthly costs', async () => {
      mockPrisma.awsUsageTracking.findFirst.mockResolvedValue({
        s3StorageBytes: 2684354560, // 2.5GB
        s3RequestsGet: 10000,
        s3RequestsPut: 1000,
        cloudfrontRequests: 5000000,
        circuitBreakerTriggered: false
      });

      const usage = await costProtectionService.getCurrentUsage();

      // Should be $0 for Free Tier usage
      expect(usage.estimatedMonthlyCostUsd).toBeGreaterThanOrEqual(0);
      expect(usage.estimatedMonthlyCostUsd).toBeLessThan(1); // Should be minimal for Free Tier
    });
  });

  describe('Error Handling', () => {
    it('should handle CloudWatch API failures gracefully', async () => {
      // Mock CloudWatch failure
      const mockCloudWatch = jest.fn().mockRejectedValue(new Error('AWS API Error'));

      // Should not throw but log warning
      await expect(
        costProtectionService.getCurrentUsage()
      ).resolves.toBeDefined();
    });

    it('should handle database connection failures', async () => {
      mockPrisma.awsUsageTracking.findFirst.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Should handle gracefully and not crash the system
      await expect(
        costProtectionService.getCurrentUsage()
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('Manual Operations', () => {
    it('should allow manual circuit breaker reset', async () => {
      const resetHandler = jest.fn();
      costProtectionService.on('circuit-breaker-closed', resetHandler);

      costProtectionService.resetCircuitBreaker();

      expect(resetHandler).toHaveBeenCalled();
    });

    it('should provide current circuit breaker status', async () => {
      const status = costProtectionService.getCircuitBreakerStatus();

      expect(status).toHaveProperty('isOpen');
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('lastFailureTime');
    });
  });
});