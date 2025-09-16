# CloudWatch Monitoring & Alerts Guide

This guide explains how to monitor and manage AWS costs and performance using CloudWatch alerts for your inventory management system.

## Overview

The system includes comprehensive cost protection and monitoring to prevent AWS Free Tier overruns and alert you to potential issues. All alerts are configured for **you as the admin** - end users never see these.

## Alert Types

### 🚨 Critical Cost Protection Alerts

1. **S3 Storage Alert** - Triggers at 80% of 5GB Free Tier limit
2. **S3 Request Alert** - Triggers at 90% of request limits
3. **Billing Cost Alert** - Triggers when estimated charges exceed thresholds
4. **CloudFront Usage Alert** - Monitors CDN data transfer

### 📊 Performance Monitoring

- Image processing performance metrics
- Upload success/failure rates
- Circuit breaker status
- Cost projection trends

## Setting Up Alerts (First Time)

### 1. AWS Infrastructure Setup

```bash
# Set up all AWS infrastructure including CloudWatch alerts
npm run setup:aws-infrastructure
```

This creates:
- S3 bucket with security policies
- CloudFront distribution
- CloudWatch billing alerts
- Cost monitoring thresholds

### 2. Test Alert Configuration

```bash
# Validate CloudWatch alerts are working
npm run test:cloudwatch-alerts
```

This will:
- Check existing alarm configurations
- Test metrics retrieval
- Validate cost protection integration
- Create/delete test alarms

### 3. Configure Email Notifications (Recommended)

1. Go to AWS Console → SNS (Simple Notification Service)
2. Create a new topic: `inventory-mgmt-alerts`
3. Subscribe your email to the topic
4. Update CloudWatch alarms to send to this SNS topic

## Monitoring Your System

### Real-Time Cost Protection

The system automatically monitors usage and will:

1. **Warning at 80%** - Log warnings about approaching limits
2. **Circuit breaker at 90%** - Block new uploads to prevent cost overruns
3. **Alert notifications** - Send you emails/SMS when thresholds are exceeded

### Check Current Usage

```typescript
// Via Cost Protection Service
const costProtection = new CostProtectionService(prisma);
const usage = await costProtection.getCurrentUsage();

console.log(`S3 Storage: ${usage.s3Storage.percentage}% of Free Tier`);
console.log(`S3 Requests: ${usage.s3Requests.percentage}% of Free Tier`);
```

### Manual Circuit Breaker Reset

If the system blocks uploads due to high usage:

```typescript
// Reset circuit breaker (use carefully!)
await costProtection.resetCircuitBreaker();
```

## Understanding Alerts

### When You'll Get Alerted

| Alert Type | Threshold | Action Required |
|------------|-----------|-----------------|
| S3 Storage Warning | 4GB (80% of 5GB) | Monitor usage, consider cleanup |
| S3 Storage Critical | 4.5GB (90% of 5GB) | Immediate cleanup required |
| Cost Alert | $1.00 estimated | Review usage patterns |
| Circuit Breaker | Any 90% threshold | System auto-protects, review usage |

### Alert Response Actions

1. **Storage Warnings**
   - Check large/old photos for deletion
   - Review user upload patterns
   - Consider implementing automatic cleanup

2. **Cost Alerts**
   - Review CloudWatch billing dashboard
   - Check for unusual usage spikes
   - Validate Free Tier limits aren't exceeded

3. **Circuit Breaker Triggered**
   - Review usage logs
   - Clean up unnecessary data
   - Reset circuit breaker only after resolving issue

## Testing & Validation

### Integration Tests

The system includes comprehensive CloudWatch integration tests:

```bash
# Run CloudWatch integration tests
npm test tests/integration/monitoring/cloudwatch-alerts.test.ts
```

Tests validate:
- ✅ Alarm creation and configuration
- ✅ Metrics retrieval functionality
- ✅ Cost protection integration
- ✅ Threshold validation
- ✅ Error handling

### Manual Validation Script

```bash
# Run full CloudWatch validation
npm run test:cloudwatch-alerts
```

This script:
- Lists all configured alarms
- Tests metric collection
- Validates cost protection
- Creates/deletes test alarms

## Production Deployment

### Pre-Production Checklist

- [ ] AWS credentials configured
- [ ] CloudWatch alerts created
- [ ] SNS notifications set up
- [ ] Cost thresholds validated
- [ ] Circuit breaker tested
- [ ] Integration tests passing

### Environment Variables Required

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_CLOUDFRONT_DISTRIBUTION_ID=your-distribution-id
```

## Troubleshooting

### Common Issues

**Q: Alerts not triggering**
- Check AWS credentials have CloudWatch permissions
- Verify alarm states in AWS Console
- Ensure SNS topic subscriptions are confirmed

**Q: Circuit breaker blocking legitimate uploads**
- Check current usage with `getCurrentUsage()`
- Review threshold configurations
- Reset circuit breaker after investigating

**Q: Integration tests failing**
- Verify AWS credentials are set
- Check internet connectivity to AWS
- Validate IAM permissions for CloudWatch

### Debug Commands

```bash
# Check AWS connectivity
npm run test:s3-connection

# Validate CloudWatch permissions
npm run test:cloudwatch-alerts

# Check circuit breaker status
# (Check application logs for circuit breaker state)
```

## Security Considerations

- **Never commit AWS credentials** to version control
- **Use IAM roles** in production environments
- **Limit CloudWatch permissions** to necessary operations only
- **Monitor alert configuration changes** in AWS CloudTrail

## Cost Management Best Practices

1. **Set conservative thresholds** - Start with low limits and adjust up
2. **Monitor regularly** - Check CloudWatch dashboards weekly
3. **Automate cleanup** - Implement lifecycle policies for old data
4. **Test in staging** - Validate alert thresholds before production
5. **Document incidents** - Keep records of alert triggers and responses

## Support

If you encounter issues with CloudWatch monitoring:

1. Check the integration test output for specific errors
2. Review AWS CloudWatch logs and console
3. Validate IAM permissions for CloudWatch operations
4. Ensure all required environment variables are set

The monitoring system is designed to be fail-safe - if CloudWatch is unavailable, the cost protection service will still function with local limits.