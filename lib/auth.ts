/**
 * Temporary auth module for development
 * This provides a simple auth interface for testing the implementation
 */

export interface User {
  id: string;
  email: string;
  name?: string | null;
  householdId?: string;
}

export interface Session {
  user: User;
}

/**
 * Mock authentication function for development
 * In production, this would integrate with NextAuth.js
 */
export async function auth(): Promise<Session | null> {
  // For development/testing, return a mock user
  // In production, this would validate the actual session
  return {
    user: {
      id: 'dev-user-123',
      email: 'dev@example.com',
      name: 'Dev User',
      householdId: 'dev-household-123'
    }
  };
}