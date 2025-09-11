# 🔒 Security Architecture

## Authentication & Authorization

```typescript
interface SecurityArchitecture {
  authentication: {
    provider: "NextAuth.js v5 with OAuth providers";
    implementation: `
      // auth.config.ts
      export const authConfig = {
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
        callbacks: {
          jwt({ token, user }) {
            if (user) {
              token.id = user.id;
              token.householdIds = user.householdIds;
            }
            return token;
          },
          session({ session, token }) {
            session.user.id = token.id;
            session.user.householdIds = token.householdIds;
            return session;
          },
        },
        session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 }, // 7 days
      };
    `;
  };
  
  authorization: {
    strategy: "Role-based access control with household-level permissions";
    implementation: `
      // middleware/auth.ts
      export async function validateUserPermission(
        userId: string,
        action: string,
        resource: { householdId: string; resourceId?: string }
      ): Promise<boolean> {
        const membership = await prisma.householdMember.findFirst({
          where: {
            userId,
            householdId: resource.householdId,
          },
        });
        
        if (!membership) return false;
        
        const permissions = membership.permissions as any;
        return permissions[action] === true;
      }
    `;
  };
}
```

## Data Protection

```typescript
interface DataProtection {
  encryption: {
    atRest: "PostgreSQL transparent data encryption (TDE)";
    inTransit: "TLS 1.3 for all HTTP communications";
    sensitive: "AES-256 encryption for export documents";
  };
  
  dataValidation: {
    input: "Zod schemas for all API inputs with sanitization";
    output: "Response validation to prevent data leakage";
    implementation: `
      // lib/validation/items.ts
      export const CreateItemSchema = z.object({
        name: z.string().min(1).max(200).trim(),
        description: z.string().max(1000).optional(),
        locationId: z.string().uuid(),
        quantity: z.number().int().positive().default(1),
        value: z.number().positive().optional(),
        tags: z.array(z.string().max(50)).max(10).default([]),
      });
      
      // Sanitize HTML content to prevent XSS
      export const sanitizeHtml = (content: string): string => {
        return DOMPurify.sanitize(content, {
          ALLOWED_TAGS: [],
          ALLOWED_ATTR: [],
        });
      };
    `;
  };
  
  privacyCompliance: {
    gdpr: "Data export, deletion, and consent management";
    ccpa: "California privacy rights implementation";
    dataMinimization: "Collect only necessary data for functionality";
  };
}
```

## API Security

```typescript
interface APISecurityMeasures {
  rateLimit: {
    implementation: "Redis-based sliding window rate limiting";
    limits: {
      authenticated: "1000 requests per hour per user";
      unauthenticated: "100 requests per hour per IP";
      fileUploads: "10 uploads per minute per user";
    };
    code: `
      // middleware/rate-limit.ts
      export async function rateLimit(
        key: string, 
        limit: number, 
        window: number
      ): Promise<{ success: boolean; remaining: number }> {
        const redis = Redis.fromEnv();
        const current = await redis.incr(key);
        
        if (current === 1) {
          await redis.expire(key, window);
        }
        
        return {
          success: current <= limit,
          remaining: Math.max(0, limit - current),
        };
      }
    `;
  };
  
  contentSecurity: {
    csp: "Strict Content Security Policy for XSS prevention";
    headers: `
      // Security headers in next.config.js
      const securityHeaders = [
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://*.amazonaws.com",
            "connect-src 'self' https://api.stripe.com",
          ].join('; '),
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options', 
          value: 'nosniff',
        },
      ];
    `;
  };
  
  fileUploadSecurity: {
    validation: "MIME type checking and file signature verification";
    scanning: "Virus scanning for uploaded files";
    storage: "Isolated S3 bucket with restricted permissions";
    implementation: `
      // lib/upload/security.ts
      const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      
      export async function validateUpload(file: File): Promise<ValidationResult> {
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          return { valid: false, error: 'File too large' };
        }
        
        // Check MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          return { valid: false, error: 'Invalid file type' };
        }
        
        // Verify file signature matches MIME type
        const buffer = await file.arrayBuffer();
        const signature = await detectFileType(buffer);
        
        if (signature.mime !== file.type) {
          return { valid: false, error: 'File signature mismatch' };
        }
        
        return { valid: true };
      }
    `;
  };
}
```

---
