# 💾 Database Schema

## Core Database Design - PostgreSQL 17

```sql
-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    
    -- User preferences for adaptive behavior
    preferences JSONB DEFAULT '{
        "search_suggestions": true,
        "organization_style": "hierarchical",
        "photo_quality": "balanced",
        "notification_frequency": "immediate"
    }'::jsonb,
    
    -- Subscription and feature access
    subscription_tier VARCHAR(20) DEFAULT 'free' 
        CHECK (subscription_tier IN ('free', 'premium', 'family', 'enterprise')),
    subscription_expires TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Multi-user household support
CREATE TABLE households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Household-level settings
    settings JSONB DEFAULT '{
        "shared_locations": true,
        "require_approval_for_edits": false,
        "default_item_visibility": "family"
    }'::jsonb,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User-household relationships with roles
CREATE TABLE household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    role VARCHAR(20) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member', 'guest')),
    
    permissions JSONB DEFAULT '{
        "can_add_items": true,
        "can_edit_items": true,
        "can_delete_items": false,
        "can_invite_members": false,
        "can_manage_locations": true
    }'::jsonb,
    
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(household_id, user_id)
);

-- Hierarchical location management
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Hierarchical structure
    parent_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    path TEXT NOT NULL, -- Computed path like "Home/Garage/Workbench"
    level INTEGER NOT NULL DEFAULT 0,
    
    -- Location metadata
    location_type VARCHAR(20) DEFAULT 'room'
        CHECK (location_type IN ('building', 'room', 'furniture', 'container', 'area')),
    
    -- Computed statistics (updated via triggers)
    item_count INTEGER DEFAULT 0,
    total_value DECIMAL(10,2) DEFAULT 0,
    last_accessed TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main items table with full-text search
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id),
    
    -- Basic item information
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Inventory details
    quantity INTEGER DEFAULT 1,
    unit VARCHAR(20) DEFAULT 'piece',
    
    -- Financial information
    purchase_price DECIMAL(10,2),
    current_value DECIMAL(10,2),
    purchase_date DATE,
    
    -- Item status and coordination
    status VARCHAR(20) DEFAULT 'available'
        CHECK (status IN ('available', 'borrowed', 'maintenance', 'lost', 'sold')),
    borrowed_by UUID REFERENCES users(id),
    borrowed_at TIMESTAMP,
    borrowed_until TIMESTAMP,
    
    -- Flexible metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Full-text search vector (automatically maintained)
    search_vector tsvector,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id)
);

-- Photo management with optimization tracking
CREATE TABLE item_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    
    -- File storage information
    original_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    optimized_url TEXT,
    
    -- Image metadata
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    
    -- Processing information
    processing_status VARCHAR(20) DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    optimization_savings DECIMAL(5,2), -- Percentage saved through optimization
    
    -- Display ordering
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by UUID NOT NULL REFERENCES users(id)
);

-- Tagging system for flexible organization
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#6B7280', -- Hex color for UI
    usage_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(household_id, name)
);

CREATE TABLE item_tags (
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    
    PRIMARY KEY (item_id, tag_id)
);
```

## Indexes for Performance

```sql
-- Full-text search indexes
CREATE INDEX idx_items_search_vector ON items USING GIN(search_vector);
CREATE INDEX idx_items_name_trgm ON items USING GIN(name gin_trgm_ops);

-- Location hierarchy and filtering
CREATE INDEX idx_locations_path ON locations(path);
CREATE INDEX idx_locations_parent_id ON locations(parent_id);
CREATE INDEX idx_items_location_household ON items(location_id, household_id);

-- User access patterns
CREATE INDEX idx_items_created_by_created_at ON items(created_by, created_at DESC);
CREATE INDEX idx_household_members_lookup ON household_members(user_id, household_id);

-- Status and coordination
CREATE INDEX idx_items_status_borrowed ON items(status, borrowed_by) WHERE status = 'borrowed';
CREATE INDEX idx_items_borrowed_until ON items(borrowed_until) WHERE borrowed_until IS NOT NULL;
```

---
