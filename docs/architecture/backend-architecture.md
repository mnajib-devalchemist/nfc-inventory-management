# 🏗️ Backend Architecture

Based on Next.js 15.2 serverless-first approach with API routes, PostgreSQL 17, and AWS services integration, here's the complete backend architecture optimized for inventory management and family sharing:

## Service Architecture

```typescript
// Core Backend Services Structure
interface BackendArchitecture {
  apiLayer: {
    routes: "Next.js 15.2 API Routes with App Router";
    validation: "Zod schemas for request/response validation";
    authentication: "NextAuth.js v5 with JWT sessions";
    rateLimit: "Upstash Redis for API rate limiting";
    monitoring: "Sentry for error tracking and performance";
  };
  
  businessLogic: {
    itemsService: "CRUD operations with business rule validation";
    searchService: "PostgreSQL FTS with user pattern learning";
    photoService: "Sharp.js processing with S3 storage pipeline";
    familyService: "Multi-user coordination and permission management";
    exportService: "Document generation for insurance and backup purposes";
  };
  
  dataLayer: {
    database: "PostgreSQL 17 with full-text search extensions";
    caching: "Upstash Redis for query results and session storage";
    storage: "AWS S3 for photos with CloudFront CDN";
    search: "Native PostgreSQL FTS with custom ranking algorithms";
  };
}
```

## API Design Patterns

```typescript
// RESTful API with React 19 Actions Integration
interface APIDesign {
  endpoints: {
    // Items Management
    "GET /api/v1/items": "List items with pagination, filtering, and search";
    "POST /api/v1/items": "Create new item with photo upload support";
    "GET /api/v1/items/{id}": "Get single item with full details and activity history";
    "PATCH /api/v1/items/{id}": "Update item with optimistic UI support";
    "DELETE /api/v1/items/{id}": "Soft delete with family notification";
    
    // Search & Discovery
    "GET /api/v1/search": "Full-text search with facets and suggestions";
    "GET /api/v1/search/suggestions": "Autocomplete suggestions based on user history";
    "POST /api/v1/search/feedback": "Learning feedback for search improvement";
    
    // Family Coordination
    "POST /api/v1/items/{id}/borrow": "Mark item as borrowed with notifications";
    "POST /api/v1/items/{id}/return": "Return borrowed item with status update";
    "GET /api/v1/family/activity": "Real-time family activity feed";
    
    // Photo Management
    "POST /api/v1/items/{id}/photos": "Upload and process photos with Sharp.js";
    "DELETE /api/v1/photos/{id}": "Remove photo with S3 cleanup";
    
    // Export & Backup
    "POST /api/v1/exports": "Create export job (CSV, PDF, insurance)";
    "GET /api/v1/exports/{id}": "Check export status and download";
  };
  
  responseFormat: {
    success: `{
      "data": T,
      "meta": {
        "timestamp": "2024-01-01T00:00:00Z",
        "version": "v1",
        "requestId": "uuid"
      }
    }`;
    
    error: `{
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "User-friendly error message", 
        "details": ["Specific validation errors"],
        "requestId": "uuid"
      }
    }`;
  };
}
```

## Database Service Layer

```typescript
// Service Layer with Business Logic
class ItemsService {
  async createItem(userId: string, data: CreateItemInput): Promise<Item> {
    return await prisma.$transaction(async (tx) => {
      // 1. Validate user permissions
      await this.validateUserPermissions(tx, userId, data.locationId);
      
      // 2. Create item with search vector
      const item = await tx.item.create({
        data: {
          ...data,
          createdBy: userId,
          searchVector: this.generateSearchVector(data.name, data.description),
        },
      });
      
      // 3. Update location statistics
      await this.updateLocationStats(tx, data.locationId);
      
      // 4. Create activity log entry
      await tx.activityLog.create({
        data: {
          action: 'item_added',
          entityType: 'item',
          entityId: item.id,
          userId,
          description: `Added "${item.name}" to inventory`,
        },
      });
      
      // 5. Notify family members
      await this.notifyFamilyMembers(userId, 'item_added', item);
      
      return item;
    });
  }

  async searchItems(userId: string, query: SearchQuery): Promise<SearchResults> {
    // 1. Log search for learning
    await this.logSearchQuery(userId, query);
    
    // 2. Build PostgreSQL FTS query
    const searchResults = await prisma.$queryRaw`
      SELECT 
        items.*,
        locations.path as location_path,
        ts_rank(search_vector, plainto_tsquery('english', ${query.text})) as rank,
        SIMILARITY(items.name, ${query.text}) as name_similarity
      FROM items
      JOIN locations ON items.location_id = locations.id
      WHERE 
        items.household_id = ${query.householdId}
        AND search_vector @@ plainto_tsquery('english', ${query.text})
      ORDER BY 
        GREATEST(rank, name_similarity) DESC,
        items.created_at DESC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    `;
    
    // 3. Update user search patterns for learning
    await this.updateSearchPatterns(userId, query, searchResults);
    
    return {
      items: searchResults,
      totalCount: await this.getSearchCount(query),
      suggestions: await this.generateSearchSuggestions(userId, query),
    };
  }
}

class PhotoService {
  async processAndUploadPhoto(itemId: string, photoData: Buffer): Promise<ItemPhoto> {
    // 1. Process image with Sharp.js
    const processed = await sharp(photoData)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
    
    const thumbnail = await sharp(photoData)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    // 2. Upload to S3 with optimized paths
    const [originalUrl, thumbnailUrl] = await Promise.all([
      this.uploadToS3(processed, `items/${itemId}/photos/${Date.now()}-original.jpg`),
      this.uploadToS3(thumbnail, `items/${itemId}/photos/${Date.now()}-thumb.jpg`),
    ]);
    
    // 3. Save to database
    const photo = await prisma.itemPhoto.create({
      data: {
        itemId,
        originalUrl,
        thumbnailUrl,
        fileSize: processed.length,
        processingStatus: 'completed',
        optimizationSavings: ((photoData.length - processed.length) / photoData.length) * 100,
      },
    });
    
    // 4. Invalidate CDN cache
    await this.invalidateCloudFrontCache([originalUrl, thumbnailUrl]);
    
    return photo;
  }
}
```

## Real-time Coordination System

```typescript
// Family Coordination with WebSocket-like functionality
class FamilyCoordinationService {
  async borrowItem(itemId: string, borrowerId: string, duration?: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. Update item status
      const item = await tx.item.update({
        where: { id: itemId },
        data: {
          status: 'borrowed',
          borrowedBy: borrowerId,
          borrowedAt: new Date(),
          borrowedUntil: duration ? new Date(Date.now() + duration * 1000) : null,
        },
        include: { location: true, household: { include: { members: true } } },
      });
      
      // 2. Create activity log
      await tx.activityLog.create({
        data: {
          action: 'item_borrowed',
          entityType: 'item', 
          entityId: itemId,
          userId: borrowerId,
          description: `Borrowed "${item.name}" from ${item.location.path}`,
          metadata: { duration, expectedReturn: item.borrowedUntil },
        },
      });
      
      // 3. Send real-time notifications to family members
      const familyMembers = item.household.members.filter(m => m.userId !== borrowerId);
      await Promise.all(
        familyMembers.map(member => 
          this.sendNotification(member.userId, {
            type: 'ITEM_BORROWED',
            title: `${item.name} was borrowed`,
            message: `${borrower.name} borrowed ${item.name} from ${item.location.path}`,
            itemId: item.id,
          })
        )
      );
      
      // 4. Schedule return reminder if duration specified
      if (item.borrowedUntil) {
        await this.scheduleReturnReminder(itemId, borrowerId, item.borrowedUntil);
      }
    });
  }
  
  async sendNotification(userId: string, notification: NotificationData): Promise<void> {
    // 1. Save notification to database
    await prisma.notification.create({
      data: {
        userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata || {},
      },
    });
    
    // 2. Send push notification if user has subscription
    const pushSubscription = await this.getUserPushSubscription(userId);
    if (pushSubscription) {
      await webpush.sendNotification(pushSubscription, JSON.stringify(notification));
    }
    
    // 3. Send email for important notifications
    if (notification.type === 'ITEM_BORROWED' || notification.type === 'RETURN_REMINDER') {
      await this.sendEmailNotification(userId, notification);
    }
  }
}
```

## Background Job Processing

```typescript
// Background Jobs with Vercel Cron + Queue System
interface BackgroundJobs {
  scheduledJobs: {
    "daily-maintenance": "Clean up expired exports, optimize database";
    "weekly-analytics": "Generate usage reports and optimization suggestions";
    "monthly-backups": "Create full database snapshots";
  };
  
  queuedJobs: {
    "photo-optimization": "Batch process uploaded photos with Sharp.js";
    "search-indexing": "Update search vectors for improved accuracy";
    "export-generation": "Create PDF/CSV exports for large inventories";
    "notification-delivery": "Send batched email notifications";
  };
  
  implementation: `
    // api/cron/daily-maintenance.ts
    export async function GET(request: Request) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== \`Bearer \${process.env.CRON_SECRET}\`) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      // Clean up expired exports
      await prisma.exportRequest.deleteMany({
        where: {
          status: 'completed',
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      });
      
      // Update location statistics
      await prisma.$executeRaw\`
        UPDATE locations 
        SET item_count = (
          SELECT COUNT(*) FROM items WHERE location_id = locations.id
        ),
        total_value = (
          SELECT COALESCE(SUM(current_value), 0) FROM items WHERE location_id = locations.id
        )
      \`;
      
      return Response.json({ success: true });
    }
  `;
}
```

---
