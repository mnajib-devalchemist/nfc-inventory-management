# Technology Stack Specifications

## Overview

This document provides the complete technology stack specifications for the NFC-Enabled Digital Inventory Management System, including exact versions, configuration details, and integration requirements.

## Core Framework & Runtime

### **Next.js 15.2 (App Router)**
```json
{
  "next": "15.2.0",
  "react": "19.0.0",
  "react-dom": "19.0.0"
}
```

**Key Features:**
- App Router with React Server Components
- Server Actions for form handling
- Built-in image optimization
- Edge runtime support
- Incremental Static Regeneration (ISR)

**Configuration:**
```javascript
// next.config.js
const nextConfig = {
  experimental: {
    serverActions: true,
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  },
};
```

### **React 19**
**New Features Used:**
- `useActionState` for form state management
- `useOptimistic` for optimistic UI updates
- `use()` hook for async data fetching
- Server Actions for server-side mutations
- Enhanced Suspense boundaries

**Example Usage:**
```typescript
import { useActionState, useOptimistic } from 'react';
import { createItemAction } from '@/lib/actions/items';

export function ItemForm() {
  const [state, formAction, isPending] = useActionState(createItemAction, {
    success: false,
    error: null,
  });
  
  return (
    <form action={formAction}>
      {/* Form implementation */}
    </form>
  );
}
```

### **TypeScript 5.6+**
```json
{
  "typescript": "^5.6.0",
  "@types/react": "^18.0.0",
  "@types/react-dom": "^18.0.0",
  "@types/node": "^20.0.0"
}
```

**Configuration:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

## Database & ORM

### **PostgreSQL 17**
**Version:** `17.0+`
**Extensions Required:**
- `pg_trgm` - Trigram matching for fuzzy search
- `unaccent` - Remove accents for better search
- `uuid-ossp` - UUID generation
- `pgcrypto` - Encryption functions

**Configuration:**
```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Full-text search configuration
CREATE TEXT SEARCH CONFIGURATION inventory_search (COPY = english);
```

### **Prisma 6.10**
```json
{
  "prisma": "^6.10.0",
  "@prisma/client": "^6.10.0"
}
```

**Configuration:**
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["fullTextSearch", "postgresqlExtensions"]
}

datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
  extensions = [uuidOssp(map: "uuid-ossp"), pgTrgm(map: "pg_trgm")]
}
```

## Frontend Technologies

### **UI Framework: shadcn/ui**
```json
{
  "@radix-ui/react-accordion": "^1.1.2",
  "@radix-ui/react-dialog": "^1.0.5",
  "@radix-ui/react-dropdown-menu": "^2.0.6",
  "@radix-ui/react-form": "^0.0.3",
  "@radix-ui/react-popover": "^1.0.7",
  "@radix-ui/react-separator": "^1.0.3",
  "@radix-ui/react-slot": "^1.0.2",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.0.0",
  "tailwind-merge": "^2.0.0"
}
```

### **Tailwind CSS v4.1**
```json
{
  "tailwindcss": "^4.1.0",
  "@tailwindcss/typography": "^0.5.10",
  "@tailwindcss/forms": "^0.5.7",
  "autoprefixer": "^10.4.16",
  "postcss": "^8.4.31"
}
```

**Configuration:**
```javascript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography'), require('@tailwindcss/forms')],
};
```

### **Icons: Lucide React**
```json
{
  "lucide-react": "^0.400.0"
}
```

## Backend Technologies

### **Authentication: NextAuth.js v5**
```json
{
  "next-auth": "^5.0.0-beta.4",
  "@auth/prisma-adapter": "^1.0.0"
}
```

**Configuration:**
```typescript
// lib/auth/config.ts
import { NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 }, // 7 days
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      return session;
    },
  },
};
```

### **Validation: Zod**
```json
{
  "zod": "^3.22.4",
  "@hookform/resolvers": "^3.3.2"
}
```

### **Image Processing: Sharp.js**
```json
{
  "sharp": "^0.32.6"
}
```

**Configuration:**
```typescript
// lib/utils/photos.ts
import sharp from 'sharp';

export const processImage = async (buffer: Buffer) => {
  const processed = await sharp(buffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();

  const thumbnail = await sharp(buffer)
    .resize(200, 200, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { processed, thumbnail };
};
```

## Caching & Storage

### **Redis: Upstash**
```json
{
  "@upstash/redis": "^1.25.0"
}
```

**Configuration:**
```typescript
// lib/config/redis.ts
import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

### **AWS SDK v3**
```json
{
  "@aws-sdk/client-s3": "^3.450.0",
  "@aws-sdk/s3-request-presigner": "^3.450.0",
  "@aws-sdk/client-cloudfront": "^3.450.0"
}
```

**S3 Configuration:**
```typescript
// lib/config/storage.ts
import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
```

## External Services

### **Payment Processing: Stripe**
```json
{
  "stripe": "^14.0.0",
  "@stripe/stripe-js": "^2.1.11"
}
```

### **Email: SendGrid**
```json
{
  "@sendgrid/mail": "^8.1.0"
}
```

### **Monitoring: Sentry**
```json
{
  "@sentry/nextjs": "^7.85.0"
}
```

**Configuration:**
```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### **Analytics: PostHog**
```json
{
  "posthog-js": "^1.90.0",
  "posthog-node": "^3.6.0"
}
```

## Development Tools

### **Code Quality**
```json
{
  "eslint": "^8.54.0",
  "eslint-config-next": "^14.0.0",
  "@typescript-eslint/eslint-plugin": "^6.12.0",
  "@typescript-eslint/parser": "^6.12.0",
  "prettier": "^3.1.0",
  "prettier-plugin-tailwindcss": "^0.5.7"
}
```

### **Testing**
```json
{
  "jest": "^29.7.0",
  "jest-environment-jsdom": "^29.7.0",
  "@testing-library/react": "^14.1.2",
  "@testing-library/jest-dom": "^6.1.5",
  "@testing-library/user-event": "^14.5.1",
  "@playwright/test": "^1.40.0",
  "msw": "^2.0.0"
}
```

### **Development Utilities**
```json
{
  "husky": "^8.0.3",
  "lint-staged": "^15.1.0",
  "concurrently": "^8.2.2",
  "nodemon": "^3.0.2"
}
```

## Progressive Web App

### **PWA Configuration**
```json
{
  "next-pwa": "^5.6.0",
  "workbox-webpack-plugin": "^7.0.0"
}
```

**Manifest:**
```json
{
  "name": "Digital Inventory Manager",
  "short_name": "DigiInventory",
  "description": "NFC-Enabled Digital Inventory Management System",
  "theme_color": "#2563eb",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "scope": "/",
  "start_url": "/dashboard",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## Environment Variables

### **Required Environment Variables**
```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/inventory"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# AWS
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_S3_BUCKET_NAME="inventory-photos-prod"
AWS_CLOUDFRONT_DOMAIN="your-cloudfront-domain"

# Redis
UPSTASH_REDIS_REST_URL="your-upstash-url"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"

# External Services
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
SENDGRID_API_KEY="your-sendgrid-key"
SENTRY_DSN="your-sentry-dsn"
POSTHOG_KEY="your-posthog-key"
```

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "playwright test",
    "test:coverage": "jest --coverage",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts",
    "build-storybook": "storybook build",
    "storybook": "storybook dev -p 6006"
  }
}
```

## Version Compatibility Matrix

| Technology | Version | Compatibility Notes |
|------------|---------|-------------------|
| Node.js | 20.x LTS | Required for Next.js 15.2 |
| Next.js | 15.2.x | Latest stable with App Router |
| React | 19.x | Latest with concurrent features |
| PostgreSQL | 17.x | Latest with improved FTS |
| TypeScript | 5.6+ | Latest with improved inference |
| Tailwind CSS | 4.1.x | Latest with performance improvements |
| Prisma | 6.10.x | Latest with PostgreSQL 17 support |

## Performance Benchmarks

### **Target Performance Metrics**
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **First Input Delay**: < 100ms
- **Cumulative Layout Shift**: < 0.1
- **Time to Interactive**: < 3.5s

### **Bundle Size Targets**
- **Initial JavaScript Bundle**: < 200KB gzipped
- **Total Page Weight**: < 1MB
- **Image Optimization**: 80%+ size reduction
- **Cache Hit Ratio**: > 85%

This technology stack provides a modern, scalable foundation optimized for performance, developer experience, and AI agent implementation.