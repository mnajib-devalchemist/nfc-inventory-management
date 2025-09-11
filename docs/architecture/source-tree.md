# Source Tree Structure

## Project Organization

This document defines the complete file and directory structure for the NFC-Enabled Digital Inventory Management System, optimized for Next.js 15.2 App Router and AI agent implementation.

```
inventory-mgmt/
├── .bmad-core/                    # BMad agent configuration
│   ├── checklists/
│   ├── data/
│   ├── tasks/
│   ├── templates/
│   ├── utils/
│   └── core-config.yaml
├── .ai/                           # AI development logs
│   └── debug-log.md
├── .github/                       # GitHub Actions & templates
│   ├── workflows/
│   │   ├── deploy.yml
│   │   ├── test.yml
│   │   └── security-scan.yml
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── .next/                         # Next.js build output (gitignored)
├── .vscode/                       # VS Code configuration
│   ├── settings.json
│   ├── extensions.json
│   └── launch.json
├── docs/                          # Documentation
│   ├── architecture/              # Architecture documentation (sharded)
│   │   ├── index.md              # Architecture navigation
│   │   ├── backend-architecture.md
│   │   ├── frontend-architecture.md
│   │   ├── database-schema.md
│   │   ├── security-architecture.md
│   │   ├── deployment-strategy.md
│   │   ├── coding-standards.md   # Development standards
│   │   ├── tech-stack.md         # Technology specifications
│   │   └── source-tree.md        # This file
│   ├── stories/                  # User stories and epics
│   ├── prd.md                    # Product Requirements Document
│   └── brief.md                  # Original project brief
├── app/                          # Next.js 15.2 App Router
│   ├── (auth)/                   # Authentication route group
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/              # Main application routes
│   │   ├── dashboard/
│   │   │   └── page.tsx         # Main inventory dashboard
│   │   ├── inventory/
│   │   │   ├── page.tsx         # Inventory list/grid view
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx     # Item details
│   │   │   │   └── edit/page.tsx
│   │   │   └── new/page.tsx     # Add new item
│   │   ├── search/
│   │   │   ├── page.tsx         # Advanced search interface
│   │   │   └── results/page.tsx
│   │   ├── locations/
│   │   │   ├── page.tsx         # Location hierarchy
│   │   │   ├── [id]/page.tsx    # Location details
│   │   │   └── new/page.tsx     # Create location
│   │   ├── family/
│   │   │   ├── page.tsx         # Family coordination
│   │   │   ├── invites/page.tsx
│   │   │   ├── activity/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── settings/
│   │   │   ├── page.tsx         # User preferences
│   │   │   ├── account/page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   └── export/page.tsx
│   │   └── layout.tsx           # Dashboard layout with navigation
│   ├── api/                     # API routes
│   │   ├── auth/                # NextAuth.js routes
│   │   │   └── [...nextauth]/route.ts
│   │   ├── v1/                  # API v1 endpoints
│   │   │   ├── items/
│   │   │   │   ├── route.ts     # GET, POST /api/v1/items
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── route.ts # GET, PATCH, DELETE /api/v1/items/[id]
│   │   │   │   │   └── photos/
│   │   │   │   │       └── route.ts # POST /api/v1/items/[id]/photos
│   │   │   │   └── bulk/route.ts    # POST /api/v1/items/bulk
│   │   │   ├── search/
│   │   │   │   ├── route.ts     # GET /api/v1/search
│   │   │   │   ├── suggestions/route.ts
│   │   │   │   └── feedback/route.ts
│   │   │   ├── locations/
│   │   │   │   ├── route.ts     # Location CRUD
│   │   │   │   └── [id]/route.ts
│   │   │   ├── family/
│   │   │   │   ├── households/route.ts
│   │   │   │   ├── members/route.ts
│   │   │   │   ├── invites/route.ts
│   │   │   │   └── activity/route.ts
│   │   │   ├── exports/
│   │   │   │   ├── route.ts     # Export requests
│   │   │   │   └── [id]/route.ts
│   │   │   ├── photos/
│   │   │   │   └── [id]/route.ts
│   │   │   └── users/
│   │   │       └── me/route.ts
│   │   ├── webhooks/            # External webhooks
│   │   │   ├── stripe/route.ts
│   │   │   └── sentry/route.ts
│   │   ├── cron/                # Scheduled jobs
│   │   │   ├── daily-maintenance/route.ts
│   │   │   └── weekly-analytics/route.ts
│   │   └── health/route.ts      # Health check endpoint
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root layout
│   ├── loading.tsx              # Global loading UI
│   ├── error.tsx                # Global error boundary
│   ├── not-found.tsx            # 404 page
│   └── page.tsx                 # Landing page
├── components/                  # React components
│   ├── ui/                      # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── form.tsx
│   │   ├── dialog.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── separator.tsx
│   │   ├── command.tsx
│   │   ├── popover.tsx
│   │   └── index.ts             # Barrel exports
│   ├── inventory/               # Inventory-specific components
│   │   ├── ItemCard.tsx         # Individual item display
│   │   ├── ItemModal.tsx        # Item details modal
│   │   ├── ItemForm.tsx         # Add/edit item form
│   │   ├── ItemGrid.tsx         # Grid layout for items
│   │   ├── ItemList.tsx         # List layout for items
│   │   ├── BulkActions.tsx      # Multi-select operations
│   │   └── index.ts
│   ├── search/                  # Search components
│   │   ├── SearchBar.tsx        # Global search input
│   │   ├── SearchResults.tsx    # Results display
│   │   ├── SearchFilters.tsx    # Advanced filtering
│   │   ├── SearchTips.tsx       # User education
│   │   ├── SavedSearches.tsx    # Quick searches
│   │   └── index.ts
│   ├── camera/                  # Camera & photo components
│   │   ├── CameraCapture.tsx    # Camera interface
│   │   ├── PhotoEditor.tsx      # Basic editing tools
│   │   ├── PhotoGallery.tsx     # Photo grid display
│   │   ├── PhotoUpload.tsx      # Drag-drop upload
│   │   ├── OptimizedImage.tsx   # Image optimization wrapper
│   │   └── index.ts
│   ├── locations/               # Location management
│   │   ├── LocationTree.tsx     # Hierarchical display
│   │   ├── LocationBreadcrumbs.tsx
│   │   ├── LocationStats.tsx    # Analytics display
│   │   ├── QuickLocations.tsx   # Favorites
│   │   └── index.ts
│   ├── family/                  # Family sharing components
│   │   ├── FamilySetup.tsx      # Initial setup
│   │   ├── ActivityFeed.tsx     # Real-time updates
│   │   ├── MemberManagement.tsx # Invite/manage members
│   │   ├── CoordinationAlerts.tsx # Borrowed items
│   │   └── index.ts
│   ├── layout/                  # Layout components
│   │   ├── Shell.tsx            # Main app shell
│   │   ├── Header.tsx           # Global header
│   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   ├── Footer.tsx           # App footer
│   │   ├── Navigation.tsx       # Nav components
│   │   └── index.ts
│   ├── common/                  # Shared components
│   │   ├── ErrorBoundary.tsx    # Error handling
│   │   ├── Loading.tsx          # Loading states
│   │   ├── EmptyState.tsx       # No data states
│   │   ├── ConfirmDialog.tsx    # Confirmation modals
│   │   ├── Toast.tsx            # Notifications
│   │   └── index.ts
│   └── index.ts                 # Main barrel export
├── lib/                         # Utility libraries
│   ├── actions/                 # Server actions
│   │   ├── items.ts             # Item-related actions
│   │   ├── search.ts            # Search actions
│   │   ├── photos.ts            # Photo processing actions
│   │   ├── family.ts            # Family coordination actions
│   │   ├── auth.ts              # Authentication actions
│   │   └── index.ts
│   ├── services/                # Business logic services
│   │   ├── items.ts             # ItemsService
│   │   ├── search.ts            # SearchService
│   │   ├── photos.ts            # PhotoService
│   │   ├── locations.ts         # LocationsService
│   │   ├── family.ts            # FamilyCoordinationService
│   │   ├── notifications.ts     # NotificationService
│   │   ├── exports.ts           # ExportService
│   │   ├── imports.ts           # ImportService
│   │   ├── analytics.ts         # AnalyticsService
│   │   └── index.ts
│   ├── db/                      # Database utilities
│   │   ├── index.ts             # Prisma client
│   │   ├── migrations/          # Database migrations
│   │   ├── seeds/               # Database seeders
│   │   └── schema.prisma        # Prisma schema
│   ├── auth/                    # Authentication utilities
│   │   ├── config.ts            # NextAuth configuration
│   │   ├── providers.ts         # OAuth providers
│   │   ├── callbacks.ts         # Auth callbacks
│   │   └── middleware.ts        # Auth middleware
│   ├── validation/              # Zod schemas
│   │   ├── items.ts             # Item validation schemas
│   │   ├── search.ts            # Search validation schemas
│   │   ├── users.ts             # User validation schemas
│   │   ├── family.ts            # Family validation schemas
│   │   ├── common.ts            # Shared validation utilities
│   │   └── index.ts
│   ├── utils/                   # Utility functions
│   │   ├── cn.ts                # Tailwind class utility
│   │   ├── formatting.ts        # Data formatting
│   │   ├── dates.ts             # Date utilities
│   │   ├── files.ts             # File handling
│   │   ├── search.ts            # Search utilities
│   │   ├── photos.ts            # Photo processing utilities
│   │   ├── constants.ts         # App constants
│   │   ├── env.ts               # Environment validation
│   │   └── index.ts
│   ├── hooks/                   # Custom React hooks
│   │   ├── useItems.ts          # Item management hooks
│   │   ├── useSearch.ts         # Search functionality hooks
│   │   ├── useCamera.ts         # Camera integration hooks
│   │   ├── useFamily.ts         # Family coordination hooks
│   │   ├── useDebounce.ts       # Debouncing utility
│   │   ├── useLocalStorage.ts   # Local storage hooks
│   │   └── index.ts
│   ├── types/                   # TypeScript type definitions
│   │   ├── items.ts             # Item type definitions
│   │   ├── users.ts             # User type definitions
│   │   ├── family.ts            # Family type definitions
│   │   ├── search.ts            # Search type definitions
│   │   ├── api.ts               # API response types
│   │   ├── database.ts          # Database types
│   │   └── index.ts
│   └── config/                  # Configuration files
│       ├── database.ts          # Database configuration
│       ├── storage.ts           # S3/Storage configuration
│       ├── email.ts             # SendGrid configuration
│       ├── monitoring.ts        # Sentry/PostHog configuration
│       └── index.ts
├── public/                      # Static assets
│   ├── icons/                   # App icons and favicons
│   │   ├── icon-192x192.png
│   │   ├── icon-512x512.png
│   │   ├── apple-touch-icon.png
│   │   └── favicon.ico
│   ├── images/                  # Static images
│   │   ├── logo.svg
│   │   ├── placeholder.png
│   │   └── onboarding/
│   ├── manifest.json            # PWA manifest
│   └── robots.txt               # SEO robots file
├── styles/                      # Additional styles (if needed)
│   └── components.css           # Component-specific styles
├── tests/                       # Test files
│   ├── __mocks__/               # Jest mocks
│   ├── fixtures/                # Test data fixtures
│   ├── setup/                   # Test setup files
│   │   ├── jest.setup.js
│   │   ├── test-db.js
│   │   └── msw.js               # Mock Service Worker setup
│   ├── unit/                    # Unit tests
│   │   ├── components/
│   │   ├── services/
│   │   ├── utils/
│   │   └── hooks/
│   ├── integration/             # Integration tests
│   │   ├── api/
│   │   ├── database/
│   │   └── auth/
│   └── e2e/                     # End-to-end tests
│       ├── auth.spec.ts
│       ├── inventory.spec.ts
│       ├── search.spec.ts
│       ├── family.spec.ts
│       └── playwright.config.ts
├── scripts/                     # Development scripts
│   ├── setup.sh                 # Initial project setup
│   ├── migrate.sh               # Database migrations
│   ├── seed.sh                  # Database seeding
│   ├── backup.sh                # Database backup
│   ├── deploy.sh                # Deployment script
│   └── health-check.sh          # Health monitoring
├── .env.example                 # Environment variables template
├── .env.local                   # Local development environment (gitignored)
├── .gitignore                   # Git ignore rules
├── .eslintrc.json               # ESLint configuration
├── .prettierrc                  # Prettier configuration
├── jest.config.js               # Jest test configuration
├── next.config.js               # Next.js configuration
├── package.json                 # Dependencies and scripts
├── package-lock.json            # Locked dependency versions
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
├── components.json              # shadcn/ui configuration
├── middleware.ts                # Next.js middleware (auth, rate limiting)
├── instrumentation.ts           # Next.js instrumentation (monitoring)
└── README.md                    # Project documentation
```

## Key Design Principles

### **1. Feature-Based Organization**
- Components grouped by feature domain (inventory, search, camera, family)
- Services mirror component organization
- Clear boundaries between features

### **2. Next.js 15.2 App Router Optimization**
- Route groups for logical organization
- Server components in app/ directory
- Client components in components/ directory
- API routes follow RESTful conventions

### **3. AI Agent Implementation Ready**
- Single responsibility per file
- Clear naming conventions
- Consistent barrel exports (index.ts files)
- Modular service architecture

### **4. Scalability Considerations**
- Easy to add new features without restructuring
- Component library can be extracted to separate package
- Service layer can be moved to microservices if needed
- Clear separation between business logic and presentation

### **5. Development Workflow Support**
- Comprehensive test structure (unit, integration, e2e)
- Development scripts for common tasks
- Configuration files at appropriate levels
- Clear documentation structure

## File Naming Conventions

- **Components**: PascalCase (e.g., `ItemCard.tsx`)
- **Pages**: kebab-case for directories, `page.tsx` for files
- **API Routes**: kebab-case directories, `route.ts` for files
- **Services**: camelCase (e.g., `itemsService.ts`)
- **Utils**: camelCase (e.g., `dateUtils.ts`)
- **Types**: camelCase (e.g., `itemTypes.ts`)
- **Constants**: SCREAMING_SNAKE_CASE for values, camelCase for files

## Import/Export Patterns

### **Barrel Exports**
Each feature directory includes an `index.ts` file for clean imports:

```typescript
// components/inventory/index.ts
export { ItemCard } from './ItemCard';
export { ItemModal } from './ItemModal';
export { ItemForm } from './ItemForm';
export { ItemGrid } from './ItemGrid';

// Usage
import { ItemCard, ItemModal } from '@/components/inventory';
```

### **Service Layer Pattern**
```typescript
// lib/services/items.ts
export class ItemsService {
  // Implementation
}

export const itemsService = new ItemsService();

// lib/services/index.ts
export { itemsService } from './items';
export { searchService } from './search';

// Usage
import { itemsService } from '@/lib/services';
```

This structure provides a solid foundation for the 12-week implementation timeline while maintaining clarity for AI agent development.