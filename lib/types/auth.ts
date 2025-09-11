/**
 * Authentication type definitions for NextAuth.js integration.
 * 
 * Extends NextAuth.js types to include custom user properties and
 * session data specific to the Digital Inventory Management System.
 * 
 * @category Authentication Types
 * @since 1.0.0
 */

import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

/**
 * Extended User interface including custom properties.
 */
interface ExtendedUser extends DefaultUser {
  /** User's subscription tier */
  subscriptionTier?: string;
  /** User preferences as JSON string */
  preferences?: string;
}

/**
 * Extended Session interface including custom user data.
 */
interface ExtendedSession extends DefaultSession {
  /** Authentication provider used for sign-in */
  provider?: string;
  user: ExtendedUser;
}

/**
 * Extended JWT token interface including custom claims.
 */
interface ExtendedJWT extends DefaultJWT {
  /** Authentication provider */
  provider?: string;
}

declare module 'next-auth' {
  /**
   * The shape of the user object returned in the OAuth providers' `profile` callback,
   * or the second parameter of the `session` callback, when using a database.
   */
  interface User extends ExtendedUser {}

  /**
   * The shape of the account object returned in the OAuth providers' `account` callback,
   * Usually contains information about the provider being used and also any token data.
   */
  interface Account {}

  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session extends ExtendedSession {}
}

declare module 'next-auth/jwt' {
  /**
   * Returned by the `jwt` callback and `getToken`, when using JWT sessions
   */
  interface JWT extends ExtendedJWT {}
}

/**
 * Authentication provider configuration.
 */
export interface AuthProvider {
  /** Provider ID (e.g., 'github', 'google') */
  id: string;
  /** Display name for the provider */
  name: string;
  /** Provider icon or logo URL */
  icon?: string;
  /** Whether the provider is enabled */
  enabled: boolean;
}

/**
 * User registration data.
 */
export interface RegisterData {
  /** User's email address */
  email: string;
  /** User's display name */
  name: string;
  /** User's password (credentials provider only) */
  password?: string;
  /** User's preferred subscription tier */
  subscriptionTier?: string;
}

/**
 * User login credentials.
 */
export interface LoginCredentials {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
  /** Remember user session */
  remember?: boolean;
}