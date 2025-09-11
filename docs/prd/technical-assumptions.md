# Technical Assumptions

Based on your Project Brief technical preferences and MVP constraints, here are the technical decisions that will guide the Architect:

## Repository Structure: Monorepo

**Decision:** Single repository containing web application with future React Native mobile app capability
**Rationale:** 
- Simplified dependency management and shared TypeScript types between platforms
- Easier development workflow for solo developer initially  
- Enables code sharing for business logic and component libraries
- Supports planned NFC mobile app integration in Phase 2
- Version control simplicity during rapid MVP development phase

**Implementation Approach:**
- Next.js web application as primary deliverable
- Shared utilities and types in `/packages/shared` directory
- Future React Native app in `/apps/mobile` when NFC features required
- Component library for UI consistency across platforms

## Service Architecture

**CRITICAL DECISION:** Start with Next.js serverless functions, migrate to containerized services at scale

**MVP Architecture (0-1,000 users):**
- Next.js 14+ with API routes for all backend functionality
- Serverless functions on Vercel for automatic scaling and cost optimization
- Direct PostgreSQL connections through Prisma ORM with connection pooling
- AWS S3 integration through Next.js API routes for image handling

**Scale Architecture (1,000+ users):**
- Migrate to containerized Node.js/Express services on AWS ECS
- Separate image processing microservice for optimization pipeline
- Dedicated search service if Elasticsearch migration required
- Maintain API compatibility during architectural transition

**Justification:** Serverless-first approach minimizes operational complexity and infrastructure costs during bootstrap phase while maintaining clear migration path for scaling.

## Testing Requirements

**CRITICAL DECISION:** Pragmatic testing approach balancing quality with development velocity

**MVP Testing Strategy:**
- **Unit Testing:** Core business logic and utility functions using Jest
- **Integration Testing:** Database operations and API endpoints with test database
- **Manual Testing:** UI workflows and user experience validation with beta users
- **No E2E Initially:** Avoid Cypress/Playwright complexity until product-market fit established

**Post-MVP Testing Enhancement:**
- Component testing with React Testing Library once UI patterns stabilized
- End-to-end testing for critical user journeys (search, add item, photo upload)
- Performance testing for database queries and image processing pipelines
- Accessibility testing automation to maintain WCAG AA compliance

**Rationale:** Focus testing effort on backend reliability and core functionality rather than UI automation, which changes rapidly during early iterations.

## Additional Technical Assumptions and Requests

**Frontend Technology Stack:**
- **Next.js 14+** with App Router for improved performance and developer experience
- **React 18** with TypeScript for type safety and modern development patterns  
- **Tailwind CSS** for rapid UI development and consistent design system
- **shadcn/ui** component library for accessible, customizable UI components
- **Lucide React** for consistent iconography throughout the application

**Backend and Database:**
- **PostgreSQL 15+** with full-text search capabilities and flexible location indexing for adaptive search
- **Prisma ORM** for type-safe database operations with support for flexible location schema (text fields + structured hierarchy)
- **PostgreSQL pattern analysis** for learning user location naming preferences and search optimization
- **AWS S3** for image storage with CloudFront CDN for global delivery
- **Sharp.js** for server-side image optimization and compression

**Authentication and Security:**
- **NextAuth.js** for authentication with email/password and potential social logins
- **bcryptjs** for password hashing with proper salt rounds
- **Rate limiting** implementation for API endpoints to prevent abuse
- **CORS** configuration for secure cross-origin requests

**Development and Deployment:**
- **Vercel** for frontend deployment and serverless function hosting
- **AWS RDS** for managed PostgreSQL database with automated backups
- **GitHub Actions** for CI/CD pipeline with automated testing and deployment
- **Sentry** for error tracking and performance monitoring in production

**Search Enhancement Planning:**
- **$2,000 budget allocated** for Elasticsearch migration if PostgreSQL inadequate
- **OpenAI API integration** consideration for AI-powered search and item descriptions
- **Algolia** as alternative search service if self-hosted solutions insufficient

**Cost Optimization Measures:**
- **Image compression pipeline** targeting 100KB maximum per image
- **Database query optimization** with proper indexing and connection pooling
- **CDN implementation** to reduce bandwidth costs for image delivery  
- **Monitoring and alerting** for AWS service usage to prevent cost overruns

**Integration Requirements:**
- **Stripe** for payment processing with webhook handling for subscription management
- **SendGrid or AWS SES** for transactional emails (welcome, password reset, notifications)
- **Posthog or Google Analytics** for user behavior tracking and product analytics
- **GitHub API** potential integration for issue tracking and user feedback collection

**Security and Compliance:**
- **Data encryption** at rest (AWS RDS) and in transit (HTTPS everywhere)
- **Environment variable management** for sensitive configuration data
- **GDPR compliance** architecture supporting user data export and deletion
- **Content Security Policy** headers to prevent XSS and other security vulnerabilities
