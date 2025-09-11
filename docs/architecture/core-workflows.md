# 🔄 Core Workflows

Based on the PRD's critical user journeys and our component architecture, here are the key system workflows:

## 1. User Search Workflow - Adaptive Learning Pattern

```mermaid
sequenceDiagram
    participant U as User
    participant PWA as Next.js PWA
    participant API as API Routes
    participant Cache as Upstash Redis
    participant Search as Search Engine
    participant DB as PostgreSQL 17
    participant Analytics as Search Analytics

    U->>PWA: Types search query "drill"
    PWA->>API: GET /api/v1/search/suggestions?q=dri
    API->>Cache: Check cached suggestions
    Cache-->>API: Return cached results
    API-->>PWA: Return suggestions ["drill", "driver", "drilling"]

    U->>PWA: Submits search "power drill"
    PWA->>API: GET /api/v1/search?q=power drill
    API->>Cache: Check cache key "search:user123:power_drill"
    Cache-->>API: Cache miss

    API->>Search: Execute search query
    Search->>DB: SELECT with FTS ranking
    Note over DB: Uses ts_vector with location weighting
    DB-->>Search: Return ranked results

    Search->>Analytics: Log search query + results
    Search-->>API: Return search results

    API->>Cache: Cache results (5min TTL)
    API-->>PWA: Return search results with locations
    PWA-->>U: Display results with photos and locations

    U->>PWA: Clicks on "Power Drill" result
    PWA->>Analytics: Track successful search
    Analytics->>DB: Update user search patterns

    Note over Analytics: Learn: User searches "power" but item is "drill"
    Analytics->>DB: Improve synonym mapping for user
```

## 2. Photo Upload Workflow - Optimized Processing Pipeline

```mermaid
sequenceDiagram
    participant U as User
    participant PWA as Next.js PWA
    participant Camera as Camera API
    participant API as API Routes
    participant Sharp as Sharp.js Pipeline
    participant S3 as AWS S3
    participant CDN as CloudFront
    participant WS as WebSocket
    participant DB as PostgreSQL

    U->>PWA: Clicks "Add Photo" for item
    PWA->>Camera: navigator.mediaDevices.getUserMedia()
    Camera-->>PWA: Camera stream ready

    U->>Camera: Takes photo
    Camera-->>PWA: Returns image blob
    PWA->>PWA: Show preview with cropping options

    U->>PWA: Confirms photo upload
    PWA->>API: POST /api/v1/items/{itemId}/photos (multipart)

    API->>Sharp: Process image
    Note over Sharp: Resize, compress to 100KB target
    Sharp->>Sharp: Generate thumbnail (200x200)
    Sharp->>Sharp: Optimize for web delivery
    Sharp-->>API: Return optimized images

    API->>S3: Upload original + thumbnail
    S3-->>API: Return S3 URLs

    API->>CDN: Invalidate cache for updated content
    API->>DB: Save photo metadata
    DB-->>API: Confirm save

    API->>WS: Notify user of completion
    WS-->>PWA: Real-time progress update
    PWA-->>U: Show "Photo processed successfully"

    API-->>PWA: Return photo URLs
    PWA->>CDN: Load optimized photo for display
    CDN-->>PWA: Serve optimized image
    PWA-->>U: Display photo in item gallery
```

## 3. Family Sharing Coordination Workflow

```mermaid
sequenceDiagram
    participant Sarah as Sarah (Family Member)
    participant PWA1 as Sarah's PWA
    participant API as API Routes
    participant DB as PostgreSQL
    participant WS as WebSocket Service
    participant John as John (Family Member)
    participant PWA2 as John's PWA

    Sarah->>PWA1: Marks "Power Drill" as borrowed
    PWA1->>API: POST /api/v1/items/{itemId}/borrow
    API->>DB: Update item status to 'borrowed'
    API->>DB: Create activity log entry

    API->>WS: Broadcast item_borrowed event
    WS->>PWA2: Real-time notification to John
    PWA2-->>John: "Sarah borrowed the Power Drill"

    Note over API: 24 hours later
    API->>API: Check overdue borrowed items
    API->>WS: Send reminder notification
    WS->>PWA1: "Reminder: Power Drill is due back"
    PWA1-->>Sarah: Push notification reminder

    Sarah->>PWA1: Marks item as returned
    PWA1->>API: POST /api/v1/items/{itemId}/return
    API->>DB: Update item status to 'available'
    API->>WS: Broadcast item_returned event
    WS->>PWA2: Notify John of return
    PWA2-->>John: "Power Drill has been returned"
```

## 4. Advanced Workflow: Insurance Export & Valuation

```mermaid
sequenceDiagram
    participant U as User
    participant PWA as PWA
    participant API as API Routes
    participant Valuation as Valuation Service
    participant Legal as Legal Compliance Service
    participant PDF as PDF Generator
    participant DB as Database
    participant Email as Email Service

    U->>PWA: Requests insurance document export
    PWA->>API: POST /api/v1/exports/insurance

    API->>DB: Query all user items with photos
    DB-->>API: Return complete inventory

    API->>Valuation: Calculate current values
    Note over Valuation: Depreciation, market rates, condition
    Valuation-->>API: Return updated valuations

    API->>Legal: Create insurance-compliant document
    Note over Legal: Legal disclaimers, attestation, timestamps
    Legal->>PDF: Generate official insurance document
    Note over PDF: Include item photos with timestamps
    Note over PDF: Include purchase dates and current values
    Note over PDF: Add digital signatures and encryption

    Legal->>DB: Create audit trail record
    Legal->>API: Insurance document ready
    API->>Email: Send secure download link
    Email-->>U: "Your insurance inventory document is ready (expires in 48hrs)"

    U->>PWA: Opens email link
    PWA->>API: GET /api/v1/exports/{exportId}/download
    Note over API: Verify user permissions and link validity
    Legal-->>API: Authorized download
    API-->>PWA: Return secure PDF download
    PWA-->>U: Downloads official insurance document
```

---
