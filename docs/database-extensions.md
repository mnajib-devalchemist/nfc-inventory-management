# PostgreSQL Extensions Requirements

## Overview

The NFC Digital Inventory Management System requires specific PostgreSQL extensions for optimal performance. This document outlines the required extensions, installation procedures, and fallback mechanisms when extensions are unavailable.

## Required Extensions

### 1. pg_trgm (Trigram Matching)
**Status**: Critical for search functionality
**Purpose**: Enables similarity-based text search and fuzzy matching
**Fallback**: ILIKE-based pattern matching (reduced performance)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Benefits**:
- Fast trigram-based text similarity scoring
- Efficient partial text matching
- Support for similarity() and word_similarity() functions
- GIN/GiST index support for trigram searches

**Performance Impact**: 5-10x faster search performance compared to ILIKE fallback

### 2. unaccent (Accent Removal)
**Status**: Recommended for international text support
**Purpose**: Removes accents from text for better search matching
**Fallback**: Accent-sensitive search only

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```

**Benefits**:
- Matches "café" when searching for "cafe"
- Better international text search experience
- Accent-insensitive sorting and comparison

### 3. uuid-ossp (UUID Generation)
**Status**: Required for primary key generation
**Purpose**: Provides optimized UUID generation functions
**Fallback**: JavaScript-based UUID generation (slower)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**Benefits**:
- Hardware-optimized UUID generation
- Better performance for high-volume UUID creation
- Standard UUID v4 compliance

## Installation Procedures

### Development Environment

1. **Local PostgreSQL Installation**:
```bash
# Ubuntu/Debian
sudo apt-get install postgresql-contrib

# macOS with Homebrew
brew install postgresql

# Extensions are typically included in contrib packages
```

2. **Docker PostgreSQL**:
```dockerfile
FROM postgres:17
RUN apt-get update && apt-get install -y postgresql-contrib
```

3. **Database Setup**:
```sql
-- Connect to your database as superuser
\c inventory_dev

-- Install required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify installation
SELECT extname, extversion FROM pg_extension;
```

### Production Environment

#### AWS RDS PostgreSQL
```sql
-- RDS includes most extensions by default
-- Connect as master user
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

#### Google Cloud SQL
```sql
-- Cloud SQL supports these extensions
-- Use the Cloud SQL console or gcloud CLI to enable
gcloud sql instances patch INSTANCE_NAME --database-flags=shared_preload_libraries=pg_trgm
```

#### Azure Database for PostgreSQL
```sql
-- Most extensions available by default
-- May require shared_preload_libraries configuration
```

#### Self-Hosted PostgreSQL
```bash
# Install contrib package
sudo apt-get install postgresql-17-contrib

# Restart PostgreSQL service
sudo systemctl restart postgresql

# Create extensions as superuser
sudo -u postgres psql -d inventory_prod -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

## Extension Validation

The application automatically validates extension availability on startup:

```typescript
import { validateDatabaseConfiguration } from '@/lib/db/extensions';

// During application startup
const validation = await validateDatabaseConfiguration();
if (!validation.valid) {
  console.error('Database validation failed');
  process.exit(1);
}

validation.warnings.forEach(warning => console.warn(warning));
validation.recommendations.forEach(rec => console.info(rec));
```

## Fallback Mechanisms

When extensions are unavailable, the application implements graceful fallbacks:

### Search Functionality
- **With pg_trgm**: Full-text search with similarity scoring
- **Without pg_trgm**: ILIKE pattern matching with slower performance

### Text Processing
- **With unaccent**: Accent-insensitive search
- **Without unaccent**: Exact text matching only

### UUID Generation
- **With uuid-ossp**: Native PostgreSQL UUID generation
- **Without uuid-ossp**: JavaScript-based UUID generation

## Performance Impact

| Feature | With Extensions | Without Extensions | Performance Difference |
|---------|-----------------|-------------------|----------------------|
| Text Search | <100ms | <500ms | 5x slower |
| UUID Generation | <1ms | <5ms | 5x slower |
| International Text | Full support | Limited | Feature degradation |

## Troubleshooting

### Common Issues

1. **Permission Denied**:
```sql
-- Solution: Connect as superuser or database owner
\c postgres postgres
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

2. **Extension Not Available**:
```bash
# Solution: Install contrib package
sudo apt-get install postgresql-contrib-17
```

3. **Shared Library Not Found**:
```sql
-- Solution: Add to shared_preload_libraries
ALTER SYSTEM SET shared_preload_libraries = 'pg_trgm';
-- Restart PostgreSQL
```

### Verification Commands

```sql
-- Check available extensions
SELECT name, default_version, installed_version 
FROM pg_available_extensions 
WHERE name IN ('pg_trgm', 'unaccent', 'uuid-ossp');

-- Check installed extensions
SELECT extname, extversion, extrelocatable 
FROM pg_extension 
WHERE extname IN ('pg_trgm', 'unaccent', 'uuid-ossp');

-- Test extension functionality
SELECT similarity('test', 'tset'); -- Should return value > 0 with pg_trgm
SELECT unaccent('café'); -- Should return 'cafe' with unaccent
SELECT uuid_generate_v4(); -- Should return UUID with uuid-ossp
```

## Environment-Specific Notes

### Docker Compose
```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: inventory
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
```

### init.sql
```sql
-- Auto-install extensions during container startup
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## Monitoring and Maintenance

### Performance Monitoring
```sql
-- Monitor extension usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexname LIKE '%_gin' OR indexname LIKE '%_gist';
```

### Index Maintenance
```sql
-- Periodic index maintenance for search performance
REINDEX INDEX CONCURRENTLY idx_items_search_vector;
VACUUM ANALYZE items;
```

This configuration ensures optimal search performance while maintaining compatibility across different PostgreSQL deployment environments.