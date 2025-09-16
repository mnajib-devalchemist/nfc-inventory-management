# Story 2.1: AWS S3 Image Infrastructure Setup Guide

This guide walks through setting up the complete AWS infrastructure required for Story 2.1: AWS S3 Image Infrastructure & Optimization.

## Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** configured with appropriate permissions
3. **Node.js 20+** and npm installed
4. **Environment variables** configured

## Required AWS Permissions

Your AWS user/role needs these permissions:
- `s3:*` (full S3 access)
- `cloudfront:*` (CloudFront access)
- `cloudwatch:*` (CloudWatch access)
- `iam:PassRole` (for service roles)

## Environment Variables

Add these to your `.env.local` file:

```bash
# AWS Configuration (Required)
AWS_REGION="us-west-2"
AWS_ACCESS_KEY_ID="your-access-key-id"
AWS_SECRET_ACCESS_KEY="your-secret-access-key"
AWS_ACCOUNT_ID="your-12-digit-account-id"

# S3 Configuration
AWS_S3_BUCKET_NAME="inventory-photos-production"

# CloudFront (Will be provided after setup)
AWS_CLOUDFRONT_DISTRIBUTION_ID=""
AWS_CLOUDFRONT_DOMAIN=""
```

## Setup Steps

### Step 1: Run Infrastructure Setup Script

```bash
npm run setup:aws-infrastructure
```

This script will:
- ✅ Create S3 bucket `inventory-photos-production` with versioning
- ✅ Configure security policies (encryption, public access block)
- ✅ Set up lifecycle rules for cost optimization
- ✅ Configure CORS policies for Vercel uploads
- ✅ Create CloudFront distribution for global delivery
- ✅ Set up CloudWatch billing alerts
- ✅ Configure bucket policies for CloudFront access

### Step 2: Update Environment Variables

After the script completes, update your `.env.local` with the provided values:

```bash
AWS_CLOUDFRONT_DISTRIBUTION_ID="E1234567890ABC"
AWS_CLOUDFRONT_DOMAIN="d1234567890abc.cloudfront.net"
```

### Step 3: Wait for CloudFront Deployment

CloudFront distributions take 10-15 minutes to deploy globally. You can check the status in the AWS Console.

### Step 4: Test S3 Connection

```bash
npm run test:s3-connection
```

This will verify:
- ✅ S3 configuration and connectivity
- ✅ Upload/download functionality
- ✅ Presigned URL generation
- ✅ Multi-format upload support

### Step 5: Configure S3 Lifecycle Rules (Optional)

```bash
npm run setup:s3-lifecycle
```

This optimizes storage costs by:
- Moving photos to cheaper storage after 90 days
- Cleaning up incomplete uploads after 7 days

## Vercel Deployment Configuration

The project is already configured for optimal Vercel deployment:

- **Memory**: 1GB for photo processing endpoints
- **Timeout**: 30 seconds for image processing
- **Sharp.js**: Optimized for serverless deployment
- **Cost Protection**: Circuit breaker patterns enabled

## Cost Monitoring

The setup includes automatic cost protection:

### Free Tier Limits
- **S3 Storage**: 5GB (alert at 50GB)
- **S3 Requests**: 20,000 GET, 2,000 PUT
- **CloudFront**: 10M requests, 1TB transfer

### Billing Alerts
- S3 storage approaching limits
- Request count monitoring
- Automatic service suspension if limits exceeded

## Verification Checklist

After setup, verify these components are working:

- [ ] S3 bucket exists and is accessible
- [ ] CloudFront distribution is deployed
- [ ] Photo upload API accepts files
- [ ] Images are processed to ~100KB target size
- [ ] Thumbnails are generated automatically
- [ ] Error handling provides clear feedback
- [ ] Cost monitoring alerts are active

## Troubleshooting

### Common Issues

1. **"Bucket already exists" error**
   - Choose a different bucket name (must be globally unique)
   - Update `AWS_S3_BUCKET_NAME` in environment variables

2. **CloudFront deployment timeout**
   - Distributions can take up to 15 minutes
   - Check AWS Console for deployment status

3. **Permission denied errors**
   - Verify AWS credentials have required permissions
   - Check AWS CLI configuration: `aws sts get-caller-identity`

4. **Sharp.js errors on Vercel**
   - Already configured for serverless deployment
   - Worker threads disabled due to deployment constraints

### Useful Commands

```bash
# Check AWS configuration
aws sts get-caller-identity

# List S3 buckets
aws s3 ls

# Check CloudFront distributions
aws cloudfront list-distributions

# Test photo upload locally
npm run dev
# Upload a photo through the UI at localhost:3000
```

## Security Notes

- S3 bucket blocks all public access
- All access goes through CloudFront CDN
- Images served with proper caching headers
- EXIF metadata stripped for privacy
- Server-side encryption enabled (AES256)

## Performance Optimization

- Images compressed to ~100KB target size
- Multiple formats generated (WebP, AVIF, JPEG)
- CDN caching for global performance
- Progressive JPEG encoding
- Adaptive quality based on file size

## Architecture Overview

```
User Upload → API Endpoint → Sharp.js Processing → S3 Storage → CloudFront CDN → Global Delivery
                    ↓
              Cost Protection → Circuit Breaker → Service Suspension (if needed)
                    ↓
              CloudWatch Alerts → Billing Monitoring → Admin Notifications
```

This infrastructure provides the foundation for scalable, cost-effective image storage and delivery as specified in Story 2.1.