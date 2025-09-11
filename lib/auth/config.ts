/**
 * NextAuth.js configuration for the Digital Inventory Management System.
 * 
 * This configuration provides authentication using the Prisma adapter with support
 * for OAuth providers (GitHub, Google) and credentials-based authentication.
 * Includes session management, callbacks, and user data persistence.
 * 
 * @category Authentication
 * @since 1.0.0
 */

import { NextAuthOptions, getServerSession } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import { serverEnv, clientEnv, isProduction } from '@/lib/utils/env';

/**
 * NextAuth.js authentication configuration.
 * 
 * Configures authentication providers, session management, callbacks,
 * and database persistence using Prisma adapter.
 * 
 * @example Using in API routes
 * ```typescript
 * import { authOptions } from '@/lib/auth/config';
 * import NextAuth from 'next-auth';
 * 
 * export default NextAuth(authOptions);
 * ```
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  
  // Security configuration
  secret: serverEnv.NEXTAUTH_SECRET,
  useSecureCookies: isProduction,
  cookies: {
    sessionToken: {
      name: `${isProduction ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProduction,
        maxAge: 7 * 24 * 60 * 60, // 7 days
      },
    },
    callbackUrl: {
      name: `${isProduction ? '__Secure-' : ''}next-auth.callback-url`,
      options: {
        sameSite: 'lax',
        path: '/',
        secure: isProduction,
      },
    },
    csrfToken: {
      name: `${isProduction ? '__Host-' : ''}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProduction,
      },
    },
  },
  
  providers: [
    // GitHub OAuth Provider (optional)
    ...(clientEnv.GITHUB_CLIENT_ID && serverEnv.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: clientEnv.GITHUB_CLIENT_ID,
            clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
            profile(profile) {
              return {
                id: profile.id.toString(),
                name: profile.name || profile.login,
                email: profile.email,
                image: profile.avatar_url,
              };
            },
          }),
        ]
      : []),

    // Google OAuth Provider (optional)
    ...(clientEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: clientEnv.GOOGLE_CLIENT_ID,
            clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
              };
            },
          }),
        ]
      : []),

    // Credentials Provider for development
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { 
          label: 'Email', 
          type: 'email', 
          placeholder: 'you@example.com' 
        },
        password: { 
          label: 'Password', 
          type: 'password' 
        },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // For development, accept any email with password "password"
        if (clientEnv.NODE_ENV === 'development' && credentials.password === 'password') {
          let user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user) {
            // Create user if doesn't exist in development
            user = await prisma.user.create({
              data: {
                email: credentials.email,
                name: credentials.email.split('@')[0],
                subscriptionTier: 'free',
              },
            });
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        }

        // In production, implement proper password verification here
        return null;
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // Include user ID in JWT token
      if (user) {
        token.id = user.id;
        
        // Get user's default household for session context
        if (user.defaultHouseholdId) {
          token.householdId = user.defaultHouseholdId;
        } else {
          // For development: auto-create or assign to a household
          if (clientEnv.NODE_ENV === 'development') {
            // Find or create a default household for development
            const defaultHousehold = await prisma.household.findFirst({
              where: { name: 'Default Development Household' }
            });
            
            if (defaultHousehold) {
              token.householdId = defaultHousehold.id;
              // Update user's default household
              await prisma.user.update({
                where: { id: user.id },
                data: { defaultHouseholdId: defaultHousehold.id }
              });
            } else {
              // Create default household for development
              const newHousehold = await prisma.household.create({
                data: { 
                  name: 'Default Development Household',
                  members: {
                    create: {
                      userId: user.id,
                      role: 'admin'
                    }
                  }
                }
              });
              token.householdId = newHousehold.id;
              // Update user's default household
              await prisma.user.update({
                where: { id: user.id },
                data: { defaultHouseholdId: newHousehold.id }
              });
            }
          }
        }
      }
      
      // Include account provider info
      if (account) {
        token.provider = account.provider;
      }

      return token;
    },

    async session({ session, token }) {
      // Include user ID, household ID and provider in session
      if (token?.id && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).householdId = token.householdId as string;
        (session as any).provider = token.provider as string;
      }

      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      
      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) return url;
      
      return `${baseUrl}/dashboard`;
    },
  },

  events: {
    async signIn({ user, account, isNewUser }) {
      console.log(`User ${user.email} signed in with ${account?.provider}`);
      
      if (isNewUser) {
        console.log(`New user registered: ${user.email}`);
        // Could send welcome email here
      }
    },

    async signOut({ session }) {
      console.log(`User ${session?.user?.email} signed out`);
    },
  },

  debug: clientEnv.NODE_ENV === 'development',
};

/**
 * Helper function to get the current session in server components and API routes
 * @returns Promise resolving to the current session or null if not authenticated
 */
export const auth = () => getServerSession(authOptions);