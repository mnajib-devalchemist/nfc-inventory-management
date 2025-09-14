/**
 * NextAuth.js configuration for the Digital Inventory Management System.
 *
 * This configuration implements QA-mandated security requirements including:
 * - OAuth providers with security validation
 * - Secure session configuration (2-hour expiry with refresh)
 * - Progressive rate limiting integration
 * - Email/password authentication with bcrypt
 * - Audit logging and security monitoring
 *
 * @category Authentication
 * @since 1.0.0
 * @version 1.6.0 - Enhanced security and QA compliance
 */

import { NextAuthOptions, getServerSession } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import { serverEnv, clientEnv, isProduction } from '@/lib/utils/env';
import { verifyPassword, needsRehashing, hashPassword } from '@/lib/utils/password-hash';
import { progressiveRateLimit } from '@/lib/utils/progressive-rate-limit';
import { LoginSchema } from '@/lib/validation/auth';

/**
 * Enhanced NextAuth.js authentication configuration with QA security requirements.
 *
 * Implements comprehensive security measures including:
 * - Progressive rate limiting for authentication attempts
 * - Secure password hashing with bcrypt (14+ rounds)
 * - Session security with 2-hour expiry and 15-minute refresh
 * - OAuth security validation and audit logging
 * - CSRF protection and secure cookie configuration
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
  
  // QA SECURITY: Enhanced security configuration
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
        maxAge: 2 * 60 * 60, // QA REQUIREMENT: 2 hours instead of 7 days
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
    // QA SECURITY: GitHub OAuth Provider with security validation
    ...(clientEnv.GITHUB_CLIENT_ID && serverEnv.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: clientEnv.GITHUB_CLIENT_ID,
            clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
            // QA SECURITY: OAuth provider security configuration
            profile(profile) {
              return {
                id: profile.id.toString(),
                name: profile.name || profile.login,
                email: profile.email,
                image: profile.avatar_url,
                emailVerified: profile.email ? new Date() : null, // OAuth emails are verified
              };
            },
          }),
        ]
      : []),

    // QA SECURITY: Google OAuth Provider with security validation
    ...(clientEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: clientEnv.GOOGLE_CLIENT_ID,
            clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
            // QA SECURITY: OAuth provider security configuration
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
                emailVerified: profile.email_verified ? new Date() : null,
              };
            },
          }),
        ]
      : []),

    // QA SECURITY: Enhanced Credentials Provider with security validation
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
      async authorize(credentials, req) {
        try {
          // QA SECURITY: Input validation
          const validatedCredentials = LoginSchema.safeParse(credentials);
          if (!validatedCredentials.success) {
            console.warn('Invalid login credentials format');
            return null;
          }

          const { email, password } = validatedCredentials.data;

          // QA SECURITY: Progressive rate limiting
          const ip = req?.headers?.['x-forwarded-for'] as string ||
                    req?.headers?.['x-real-ip'] as string ||
                    'unknown';

          const rateLimitResult = await progressiveRateLimit(email, 'login', ip);
          if (!rateLimitResult.success) {
            console.warn('Login rate limit exceeded', {
              email,
              ip,
              reason: rateLimitResult.reason,
            });
            return null;
          }

          // Find user in database
          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              households: {
                include: {
                  household: {
                    select: { id: true, name: true }
                  }
                }
              }
            }
          });

          if (!user) {
            console.warn('Login attempt for non-existent user', { email });
            return null;
          }

          // QA SECURITY: Check if user account is active
          if (user.deletedAt) {
            console.warn('Login attempt for deleted account', { email });
            return null;
          }

          // Development mode: allow password "password" for testing
          if (clientEnv.NODE_ENV === 'development' && password === 'password') {
            console.log('Development login allowed for:', email);

            // Create user if doesn't exist in development
            if (!user) {
              const newUser = await prisma.user.create({
                data: {
                  email: email,
                  name: email.split('@')[0],
                  subscriptionTier: 'free',
                },
              });
              return {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                image: newUser.image,
              };
            }
          } else {
            // QA SECURITY: Production password verification
            if (!user.passwordHash) {
              console.warn('User has no password hash', { email });
              return null;
            }

            const isValidPassword = await verifyPassword(password, user.passwordHash);
            if (!isValidPassword) {
              console.warn('Invalid password attempt', { email });
              return null;
            }

            // QA SECURITY: Check if password needs rehashing for stronger security
            if (needsRehashing(user.passwordHash)) {
              try {
                const newHashResult = await hashPassword(password);
                await prisma.user.update({
                  where: { id: user.id },
                  data: { passwordHash: newHashResult.hash }
                });
                console.log('Password rehashed for stronger security', { userId: user.id });
              } catch (error) {
                console.error('Failed to rehash password', { userId: user.id, error });
              }
            }
          }

          // QA SECURITY: Update last login timestamp and IP
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              lastLoginIp: ip,
            }
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: user.emailVerified,
            householdIds: user.households.map(h => h.household.id),
            defaultHouseholdId: user.defaultHouseholdId,
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      },
    }),
  ],

  // QA SECURITY: Enhanced session configuration
  session: {
    strategy: 'jwt',
    maxAge: 2 * 60 * 60, // QA REQUIREMENT: 2 hours for security
    updateAge: 15 * 60, // QA REQUIREMENT: Refresh every 15 minutes
  },

  // QA SECURITY: Custom pages for better control
  pages: {
    signIn: '/auth/login',
    signOut: '/auth/logout',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
    newUser: '/auth/welcome', // Redirect new users to onboarding
  },

  callbacks: {
    // QA ENHANCEMENT: Enhanced JWT callback with security logging
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.emailVerified = (user as any).emailVerified;

        // Add household information to token
        if ((user as any).householdIds) {
          token.householdIds = (user as any).householdIds;
        }
        if ((user as any).defaultHouseholdId) {
          token.householdId = (user as any).defaultHouseholdId;
        } else {
          // For development: auto-create or assign to a household
          if (clientEnv.NODE_ENV === 'development') {
            try {
              const defaultHousehold = await prisma.household.findFirst({
                where: { name: 'Default Development Household' }
              });

              if (defaultHousehold) {
                token.householdId = defaultHousehold.id;
                await prisma.user.update({
                  where: { id: user.id },
                  data: { defaultHouseholdId: defaultHousehold.id }
                });
              } else {
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
                await prisma.user.update({
                  where: { id: user.id },
                  data: { defaultHouseholdId: newHousehold.id }
                });
              }
            } catch (error) {
              console.error('Failed to setup household for user:', error);
            }
          }
        }

        // QA SECURITY: Log successful authentication
        console.log('JWT created for user', {
          userId: user.id,
          email: user.email,
          provider: account?.provider || 'credentials',
          timestamp: new Date().toISOString(),
        });
      }

      // QA SECURITY: Add account provider info for audit logging
      if (account) {
        token.provider = account.provider;
        token.providerAccountId = account.providerAccountId;
      }

      // Handle session updates (for profile changes)
      if (trigger === 'update' && session) {
        token.name = session.name;
        token.email = session.email;
      }

      return token;
    },

    // QA ENHANCEMENT: Enhanced session callback
    async session({ session, token }) {
      if (token?.id && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).emailVerified = token.emailVerified as boolean;
        (session.user as any).householdIds = token.householdIds as string[];
        (session.user as any).householdId = token.householdId as string;
        (session as any).provider = token.provider as string;
      }

      return session;
    },

    // QA SECURITY: Enhanced redirect validation for OAuth
    async redirect({ url, baseUrl }) {
      try {
        const parsedUrl = new URL(url, baseUrl);
        const parsedBaseUrl = new URL(baseUrl);

        // Allow same origin redirects
        if (parsedUrl.origin === parsedBaseUrl.origin) {
          return url;
        }

        // Allow relative URLs
        if (url.startsWith('/')) {
          return `${baseUrl}${url}`;
        }

        // Default secure redirect
        return `${baseUrl}/dashboard`;
      } catch {
        // If URL parsing fails, return safe default
        return `${baseUrl}/dashboard`;
      }
    },

    // QA SECURITY: Sign-in callback with security checks
    async signIn({ user, account, profile, email, credentials }) {
      // Additional security checks for OAuth
      if (account?.provider === 'github' || account?.provider === 'google') {
        // Verify email is provided by OAuth provider
        if (!user.email) {
          console.warn('OAuth sign-in without email', {
            provider: account.provider,
            userId: user.id,
          });
          return false;
        }

        // Check for suspicious sign-in patterns
        if (account.provider === 'github' && !profile?.email) {
          console.warn('GitHub sign-in without public email');
          // Still allow but log for monitoring
        }
      }

      return true;
    },
  },

  // QA SECURITY: Enhanced event handling for audit logging
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log('User signed in', {
        userId: user.id,
        email: user.email,
        provider: account?.provider || 'credentials',
        isNewUser: isNewUser || false,
        timestamp: new Date().toISOString(),
      });

      // QA SECURITY: Log new user registrations
      if (isNewUser) {
        console.log('New user registered', {
          userId: user.id,
          email: user.email,
          provider: account?.provider,
          timestamp: new Date().toISOString(),
        });
        // TODO: Send welcome email
        // TODO: Create analytics event
      }
    },

    async signOut({ session, token }) {
      console.log('User signed out', {
        userId: token?.id || session?.user?.id,
        email: token?.email || session?.user?.email,
        timestamp: new Date().toISOString(),
      });
    },

    async createUser({ user }) {
      console.log('User account created', {
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
      });
    },

    async updateUser({ user }) {
      console.log('User profile updated', {
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
      });
    },

    async linkAccount({ user, account, profile }) {
      console.log('Account linked', {
        userId: user.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        timestamp: new Date().toISOString(),
      });
    },
  },

  // QA SECURITY: Debug configuration
  debug: clientEnv.NODE_ENV === 'development',
};

/**
 * Helper function to get the current session in server components and API routes
 * @returns Promise resolving to the current session or null if not authenticated
 */
export const auth = () => getServerSession(authOptions);