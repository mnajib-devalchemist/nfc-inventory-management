/**
 * Household context utilities for secure multi-tenant inventory management.
 * 
 * Provides utilities to resolve household context from user sessions and
 * validate user permissions for household-scoped operations. Implements
 * security controls to prevent cross-household data access.
 * 
 * @category Security
 * @category Multi-Tenant
 * @since 1.0.0
 */

import { Session } from 'next-auth';
import { prisma } from '@/lib/db';

/**
 * Custom error for household permission violations.
 */
export class PermissionError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * Resolves and validates household context from user session.
 * 
 * This function provides secure household context resolution by:
 * 1. Extracting household ID from authenticated session
 * 2. Validating user still has access to the household
 * 3. Preventing unauthorized cross-household access
 * 
 * @param session - Authenticated user session with household context
 * @returns Promise resolving to validated household ID
 * @throws {PermissionError} When session lacks household context or access is revoked
 * 
 * @example Secure API route usage
 * ```typescript
 * import { auth } from '@/lib/auth/config';
 * import { getHouseholdContext } from '@/lib/utils/household-context';
 * 
 * export async function GET(request: NextRequest) {
 *   const session = await auth();
 *   if (!session?.user?.id) {
 *     return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   
 *   const householdId = await getHouseholdContext(session);
 *   // Now safely use householdId for data access
 * }
 * ```
 */
export async function getHouseholdContext(session: Session): Promise<string> {
  // Validate session has household context
  if (!session?.user?.householdId) {
    throw new PermissionError('No household context available - user session may be incomplete');
  }
  
  if (!session.user.id) {
    throw new PermissionError('Invalid user session - missing user ID');
  }
  
  // Verify user still has access to household (handles revoked access scenarios)
  const userHousehold = await prisma.household.findFirst({
    where: { 
      id: session.user.householdId,
      members: { 
        some: { userId: session.user.id } 
      }
    },
    select: { 
      id: true,
      name: true 
    }
  });
  
  if (!userHousehold) {
    throw new PermissionError(
      `Household access has been revoked or household no longer exists. ` +
      `User: ${session.user.id}, Household: ${session.user.householdId}`
    );
  }
  
  return session.user.householdId;
}

/**
 * Validates that a user has access to a specific household.
 * 
 * @param userId - User ID to check
 * @param householdId - Household ID to validate access for
 * @returns Promise resolving to true if user has access
 * @throws {PermissionError} When user lacks access to household
 */
export async function validateHouseholdAccess(userId: string, householdId: string): Promise<boolean> {
  const userHousehold = await prisma.household.findFirst({
    where: { 
      id: householdId,
      members: { 
        some: { userId: userId } 
      }
    },
    select: { id: true }
  });
  
  if (!userHousehold) {
    throw new PermissionError(`User ${userId} does not have access to household ${householdId}`);
  }
  
  return true;
}

/**
 * Development utility to create test households for realistic testing scenarios.
 * Only available in development/test environments.
 * 
 * @param name - Name of the test household
 * @returns Promise resolving to the created household ID
 * @throws {Error} When called in production environment
 */
export async function createTestHousehold(name: string): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('createTestHousehold is not available in production');
  }
  
  const household = await prisma.household.create({
    data: { name }
  });
  
  return household.id;
}

/**
 * Development utility to assign a user to a specific household.
 * Only available in development/test environments.
 * 
 * @param userId - User ID to assign to household
 * @param householdId - Household ID to assign user to
 * @returns Promise resolving when assignment is complete
 * @throws {Error} When called in production environment
 */
export async function assignUserToHousehold(userId: string, householdId: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('assignUserToHousehold is not available in production');
  }
  
  // Update user's default household
  await prisma.user.update({
    where: { id: userId },
    data: { defaultHouseholdId: householdId }
  });
}

/**
 * Utility to handle household context errors in API routes.
 * Provides consistent error responses for household-related permission failures.
 * 
 * @param error - Error caught during household context resolution
 * @returns Response object with appropriate status code and error message
 */
export function handleHouseholdContextError(error: unknown): Response {
  if (error instanceof PermissionError) {
    return Response.json(
      { 
        error: 'Household access denied',
        message: error.message,
        code: 'HOUSEHOLD_ACCESS_DENIED'
      }, 
      { status: 403 }
    );
  }
  
  // Log unexpected errors for monitoring
  console.error('Unexpected household context error:', error);
  
  return Response.json(
    { 
      error: 'Internal server error',
      message: 'Unable to resolve household context',
      code: 'INTERNAL_ERROR'
    }, 
    { status: 500 }
  );
}