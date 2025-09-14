-- Migration State Management Schema
-- Comprehensive migration tracking with checkpointing and rollback capabilities

-- Migration state tracking table
CREATE TABLE IF NOT EXISTS migration_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_type VARCHAR(50) NOT NULL DEFAULT 'photo_s3_migration',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'rollback', 'rollback_failed')),

    -- Progress tracking
    batch_size INTEGER DEFAULT 100,
    last_processed_id UUID,
    total_items INTEGER DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,

    -- Timing information
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    paused_at TIMESTAMP,
    resumed_at TIMESTAMP,
    estimated_completion_at TIMESTAMP,

    -- State data
    checkpoint_data JSONB DEFAULT '{}'::jsonb,
    error_details JSONB DEFAULT '[]'::jsonb,
    rollback_data JSONB DEFAULT '{}'::jsonb,

    -- Configuration
    migration_config JSONB DEFAULT '{}'::jsonb,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),

    -- Performance metrics
    avg_processing_time_ms INTEGER DEFAULT 0,
    throughput_items_per_second DECIMAL(10,2) DEFAULT 0,

    -- Cost tracking
    estimated_cost_usd DECIMAL(10,4) DEFAULT 0,
    actual_cost_usd DECIMAL(10,4) DEFAULT 0,

    CONSTRAINT migration_state_progress_check
        CHECK (processed_count >= 0 AND processed_count <= total_items),
    CONSTRAINT migration_state_counts_check
        CHECK (success_count + error_count + skipped_count = processed_count)
);

-- Migration batch tracking for granular control
CREATE TABLE IF NOT EXISTS migration_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_id UUID NOT NULL REFERENCES migration_state(id) ON DELETE CASCADE,
    batch_number INTEGER NOT NULL,

    -- Batch boundaries
    start_id UUID,
    end_id UUID,
    item_ids JSONB DEFAULT '[]'::jsonb,

    -- Batch status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

    -- Progress
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    successful_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,

    -- Timing
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    processing_time_ms INTEGER DEFAULT 0,

    -- Results
    results JSONB DEFAULT '{}'::jsonb,
    errors JSONB DEFAULT '[]'::jsonb,

    -- S3 operations tracking
    s3_operations JSONB DEFAULT '{
        "uploads": 0,
        "downloads": 0,
        "deletes": 0,
        "list_operations": 0,
        "bytes_transferred": 0
    }'::jsonb,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT migration_batches_items_check
        CHECK (processed_items >= 0 AND processed_items <= total_items),
    CONSTRAINT migration_batches_counts_check
        CHECK (successful_items + failed_items <= processed_items)
);

-- Migration item tracking for individual photo migration
CREATE TABLE IF NOT EXISTS migration_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_id UUID NOT NULL REFERENCES migration_state(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES migration_batches(id) ON DELETE CASCADE,

    -- Item identification
    item_id UUID NOT NULL,
    photo_id UUID,
    original_path TEXT,

    -- Migration details
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped', 'rolled_back')),

    -- File information
    original_size INTEGER,
    processed_size INTEGER,
    file_format VARCHAR(10),

    -- S3 information
    s3_key TEXT,
    s3_url TEXT,
    cdn_url TEXT,

    -- Processing results
    processing_time_ms INTEGER DEFAULT 0,
    compression_ratio DECIMAL(5,2),
    quality_achieved INTEGER,

    -- Error handling
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Rollback data
    rollback_data JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT migration_items_retry_check CHECK (retry_count <= max_retries)
);

-- AWS usage tracking for cost protection
CREATE TABLE IF NOT EXISTS aws_usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Time period
    tracking_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tracking_hour INTEGER NOT NULL DEFAULT EXTRACT(HOUR FROM CURRENT_TIME),

    -- S3 usage
    s3_storage_bytes BIGINT DEFAULT 0,
    s3_requests_get INTEGER DEFAULT 0,
    s3_requests_put INTEGER DEFAULT 0,
    s3_requests_delete INTEGER DEFAULT 0,
    s3_requests_list INTEGER DEFAULT 0,
    s3_data_transfer_bytes BIGINT DEFAULT 0,

    -- CloudFront usage
    cloudfront_requests INTEGER DEFAULT 0,
    cloudfront_data_transfer_bytes BIGINT DEFAULT 0,
    cloudfront_invalidations INTEGER DEFAULT 0,

    -- Cost estimates
    s3_cost_estimate_usd DECIMAL(10,4) DEFAULT 0,
    cloudfront_cost_estimate_usd DECIMAL(10,4) DEFAULT 0,
    total_cost_estimate_usd DECIMAL(10,4) DEFAULT 0,

    -- Free tier status
    s3_storage_free_tier_remaining BIGINT DEFAULT 5368709120, -- 5GB in bytes
    s3_get_requests_free_tier_remaining INTEGER DEFAULT 20000,
    s3_put_requests_free_tier_remaining INTEGER DEFAULT 2000,
    cloudfront_requests_free_tier_remaining INTEGER DEFAULT 10000000, -- 10M requests
    cloudfront_data_transfer_free_tier_remaining BIGINT DEFAULT 1073741824000, -- 1TB in bytes

    -- Circuit breaker status
    circuit_breaker_triggered BOOLEAN DEFAULT FALSE,
    circuit_breaker_reason TEXT,
    circuit_breaker_triggered_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT aws_usage_tracking_hour_check CHECK (tracking_hour >= 0 AND tracking_hour <= 23),
    CONSTRAINT aws_usage_tracking_unique UNIQUE (tracking_date, tracking_hour)
);

-- Migration configuration templates
CREATE TABLE IF NOT EXISTS migration_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,

    -- Configuration
    config JSONB NOT NULL DEFAULT '{
        "batch_size": 100,
        "max_concurrent_batches": 3,
        "retry_failed_items": true,
        "max_retries_per_item": 3,
        "pause_on_error_threshold": 10,
        "enable_cost_protection": true,
        "cost_protection_threshold": 0.9,
        "image_processing": {
            "target_size_kb": 100,
            "formats": ["webp", "avif", "jpeg"],
            "generate_thumbnails": true
        },
        "rollback": {
            "enabled": true,
            "keep_backup_days": 30
        }
    }'::jsonb,

    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_migration_state_status ON migration_state(status);
CREATE INDEX IF NOT EXISTS idx_migration_state_type ON migration_state(migration_type);
CREATE INDEX IF NOT EXISTS idx_migration_state_progress ON migration_state(status, processed_count, total_items);

CREATE INDEX IF NOT EXISTS idx_migration_batches_migration_id ON migration_batches(migration_id);
CREATE INDEX IF NOT EXISTS idx_migration_batches_status ON migration_batches(status);
CREATE INDEX IF NOT EXISTS idx_migration_batches_batch_number ON migration_batches(migration_id, batch_number);

CREATE INDEX IF NOT EXISTS idx_migration_items_migration_id ON migration_items(migration_id);
CREATE INDEX IF NOT EXISTS idx_migration_items_batch_id ON migration_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_migration_items_status ON migration_items(status);
CREATE INDEX IF NOT EXISTS idx_migration_items_item_id ON migration_items(item_id);

CREATE INDEX IF NOT EXISTS idx_aws_usage_tracking_date ON aws_usage_tracking(tracking_date);
CREATE INDEX IF NOT EXISTS idx_aws_usage_tracking_circuit_breaker ON aws_usage_tracking(circuit_breaker_triggered);

-- Functions for migration state management
CREATE OR REPLACE FUNCTION update_migration_progress(
    p_migration_id UUID,
    p_processed_count INTEGER DEFAULT NULL,
    p_success_count INTEGER DEFAULT NULL,
    p_error_count INTEGER DEFAULT NULL,
    p_skipped_count INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE migration_state
    SET
        processed_count = COALESCE(p_processed_count, processed_count),
        success_count = COALESCE(p_success_count, success_count),
        error_count = COALESCE(p_error_count, error_count),
        skipped_count = COALESCE(p_skipped_count, skipped_count),
        updated_at = CURRENT_TIMESTAMP,

        -- Calculate throughput
        throughput_items_per_second = CASE
            WHEN started_at IS NOT NULL AND processed_count > 0 THEN
                processed_count::decimal / GREATEST(1, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)))
            ELSE throughput_items_per_second
        END,

        -- Estimate completion time
        estimated_completion_at = CASE
            WHEN started_at IS NOT NULL AND processed_count > 0 AND total_items > processed_count THEN
                started_at + (
                    (CURRENT_TIMESTAMP - started_at) *
                    (total_items::decimal / processed_count::decimal)
                )::INTERVAL
            ELSE estimated_completion_at
        END
    WHERE id = p_migration_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check Free Tier limits
CREATE OR REPLACE FUNCTION check_free_tier_limits() RETURNS TABLE(
    service TEXT,
    metric TEXT,
    current_usage BIGINT,
    limit_value BIGINT,
    usage_percentage DECIMAL(5,2),
    limit_exceeded BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH current_usage AS (
        SELECT
            s3_storage_bytes,
            s3_requests_get,
            s3_requests_put,
            cloudfront_requests,
            cloudfront_data_transfer_bytes
        FROM aws_usage_tracking
        WHERE tracking_date = CURRENT_DATE
        ORDER BY created_at DESC
        LIMIT 1
    )
    SELECT
        'S3'::TEXT, 'Storage'::TEXT,
        COALESCE(cu.s3_storage_bytes, 0)::BIGINT,
        5368709120::BIGINT, -- 5GB
        (COALESCE(cu.s3_storage_bytes, 0)::decimal / 5368709120 * 100)::decimal(5,2),
        COALESCE(cu.s3_storage_bytes, 0) > 5368709120
    FROM current_usage cu

    UNION ALL

    SELECT
        'S3'::TEXT, 'GET Requests'::TEXT,
        COALESCE(cu.s3_requests_get, 0)::BIGINT,
        20000::BIGINT,
        (COALESCE(cu.s3_requests_get, 0)::decimal / 20000 * 100)::decimal(5,2),
        COALESCE(cu.s3_requests_get, 0) > 20000
    FROM current_usage cu

    UNION ALL

    SELECT
        'S3'::TEXT, 'PUT Requests'::TEXT,
        COALESCE(cu.s3_requests_put, 0)::BIGINT,
        2000::BIGINT,
        (COALESCE(cu.s3_requests_put, 0)::decimal / 2000 * 100)::decimal(5,2),
        COALESCE(cu.s3_requests_put, 0) > 2000
    FROM current_usage cu

    UNION ALL

    SELECT
        'CloudFront'::TEXT, 'Requests'::TEXT,
        COALESCE(cu.cloudfront_requests, 0)::BIGINT,
        10000000::BIGINT, -- 10M
        (COALESCE(cu.cloudfront_requests, 0)::decimal / 10000000 * 100)::decimal(5,2),
        COALESCE(cu.cloudfront_requests, 0) > 10000000
    FROM current_usage cu;
END;
$$ LANGUAGE plpgsql;

-- Insert default migration configuration
INSERT INTO migration_configs (name, description, config, is_default) VALUES (
    'default_photo_migration',
    'Default configuration for photo migration to S3 with cost protection',
    '{
        "batch_size": 50,
        "max_concurrent_batches": 2,
        "retry_failed_items": true,
        "max_retries_per_item": 3,
        "pause_on_error_threshold": 5,
        "enable_cost_protection": true,
        "cost_protection_threshold": 0.85,
        "image_processing": {
            "target_size_kb": 100,
            "formats": ["webp", "avif", "jpeg"],
            "generate_thumbnails": true,
            "strip_exif": true,
            "progressive": true
        },
        "s3": {
            "bucket": "photos",
            "key_prefix": "migrated/",
            "storage_class": "STANDARD"
        },
        "rollback": {
            "enabled": true,
            "keep_backup_days": 30,
            "backup_before_migration": true
        },
        "monitoring": {
            "progress_update_interval_ms": 5000,
            "health_check_interval_ms": 30000,
            "cost_check_interval_ms": 60000
        }
    }'::jsonb,
    true
) ON CONFLICT (name) DO NOTHING;