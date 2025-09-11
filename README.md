# Digital Inventory Manager

NFC-Enabled Digital Inventory Management System built with Next.js 15.2, TypeScript, and modern web technologies.

## 🚀 Features

- **Modern Stack**: Next.js 15.2 with App Router, React 19, TypeScript 5.6+
- **Authentication**: NextAuth.js with OAuth (GitHub, Google) and credentials support
- **Database**: PostgreSQL with Prisma ORM for production, SQLite for development
- **UI Components**: shadcn/ui with Tailwind CSS for consistent design
- **Monitoring**: Sentry error tracking and PostHog analytics
- **Testing**: Jest unit tests and Playwright e2e tests
- **CI/CD**: GitHub Actions for automated testing and deployment
- **Type Safety**: Full TypeScript coverage with strict configuration

## 🛠 Tech Stack

- **Framework**: Next.js 15.2 (App Router)
- **Language**: TypeScript 5.6+
- **Database**: PostgreSQL 17 / SQLite (development)
- **ORM**: Prisma 6.10
- **Authentication**: NextAuth.js v4
- **UI**: Tailwind CSS + shadcn/ui components
- **Testing**: Jest + React Testing Library + Playwright
- **Deployment**: Vercel
- **Monitoring**: Sentry + PostHog

## 📋 Prerequisites

- Node.js 20+ 
- npm 10+
- PostgreSQL 17+ (for production)

## 🔧 Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd inventory-mgmt
   ```

2. **Install dependencies**
   ```bash
   npm ci
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your configuration. For development, the defaults should work:
   ```env
   DATABASE_URL="file:./dev.db"
   NEXTAUTH_SECRET="development-secret-key-change-in-production-minimum-32-characters"
   NEXTAUTH_URL="http://localhost:3000"
   NODE_ENV="development"
   ```

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open the application**
   Visit [http://localhost:3000](http://localhost:3000)

## 🧪 Testing

### Unit Tests
```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

### End-to-End Tests
```bash
npm run test:e2e          # Run Playwright tests
```

### Type Checking
```bash
npm run type-check        # TypeScript type checking
```

### Linting
```bash
npm run lint              # ESLint
npm run lint:fix          # Auto-fix issues
```

## 🔐 Authentication

The app supports multiple authentication methods:

- **Development**: Use any email with password `"password"`
- **OAuth**: GitHub and Google (configure with environment variables)
- **Production**: Implement proper credential validation

### Development Login
- Email: `test@example.com`
- Password: `password`

## 📁 Project Structure

```
inventory-mgmt/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Authentication pages
│   ├── (dashboard)/         # Protected dashboard pages
│   ├── api/                 # API routes
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── ui/                  # shadcn/ui components
│   └── common/              # Shared components
├── lib/                     # Utilities and configuration
│   ├── actions/             # Server actions
│   ├── auth/                # Authentication config
│   ├── config/              # App configuration
│   ├── db/                  # Database utilities
│   ├── types/               # TypeScript types
│   └── utils/               # Utility functions
├── prisma/                  # Database schema and migrations
├── tests/                   # Test files
│   ├── unit/                # Unit tests
│   ├── e2e/                 # End-to-end tests
│   └── setup/               # Test configuration
└── docs/                    # Project documentation
```

## 🚀 Deployment

### Vercel Deployment

1. **Connect to Vercel**
   - Import project to Vercel
   - Configure environment variables
   - Deploy

2. **Environment Variables**
   Set these in Vercel dashboard:
   ```
   DATABASE_URL=postgresql://...
   NEXTAUTH_SECRET=your-secret-key
   NEXTAUTH_URL=https://your-domain.vercel.app
   # OAuth providers (optional)
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   # Monitoring (optional)
   SENTRY_DSN=...
   POSTHOG_KEY=...
   ```

3. **Database Migration**
   ```bash
   npx prisma migrate deploy
   ```

## 🔒 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | Database connection string | Yes | - |
| `NEXTAUTH_SECRET` | NextAuth.js secret (32+ chars) | Yes | - |
| `NEXTAUTH_URL` | Application base URL | Yes | - |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | No | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret | No | - |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | No | - |
| `SENTRY_DSN` | Sentry error monitoring DSN | No | - |
| `POSTHOG_KEY` | PostHog analytics key | No | - |

## 📊 Monitoring

- **Error Tracking**: Sentry integration for error monitoring
- **Analytics**: PostHog for user behavior tracking  
- **Performance**: Built-in Next.js analytics and monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

If you encounter issues:

1. Check the [Issues](https://github.com/your-repo/issues) page
2. Review the documentation in `/docs`
3. Ensure all environment variables are set correctly
4. Verify database connectivity

## 🔄 Development Workflow

1. **Feature Development**
   - Create feature branch from `main`
   - Implement feature with tests
   - Run full test suite
   - Submit PR for review

2. **Testing Strategy**
   - Unit tests for components and utilities
   - Integration tests for API routes
   - E2E tests for critical user flows

3. **Code Quality**
   - TypeScript strict mode enabled
   - ESLint and Prettier for code formatting
   - Husky hooks for pre-commit checks
   - 80%+ test coverage requirement