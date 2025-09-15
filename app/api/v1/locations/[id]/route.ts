import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { locationsService } from '@/lib/services';
import { 
  validateUpdateLocation,
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
} from '@/lib/validation';
import { getHouseholdContext, handleHouseholdContextError } from '@/lib/utils/household-context';

/**
 * GET /api/v1/locations/{id} - Get single location with details
 * 
 * @route GET /api/v1/locations/{id}
 * @access Private (requires authentication)
 * @param request - Next.js request object
 * @param context - Route context with location ID
 * @returns Promise<Response> JSON response with location data
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {404} Not Found - Location not found
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function GET(
  request: NextRequest, 
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    // 2. Get parameters
    const { id: locationId } = await context.params;
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Get the location
    const location = await locationsService.getLocationById(locationId, householdId);

    if (!location) {
      return Response.json(
        createErrorResponse('LOCATION_NOT_FOUND', 'Location not found'),
        { status: 404 }
      );
    }

    // 4. Return location data
    return Response.json(createSuccessResponse(location));

  } catch (error) {
    const resolvedParams = await context.params;
    console.error(`GET /api/v1/locations/${resolvedParams.id} error:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return Response.json(
          createErrorResponse('LOCATION_NOT_FOUND', 'Location not found'),
          { status: 404 }
        );
      }
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve location'),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/locations/{id} - Update an existing location
 * 
 * @route PATCH /api/v1/locations/{id}
 * @access Private (requires authentication)
 * @param request - Next.js request object with update data
 * @param context - Route context with location ID
 * @returns Promise<Response> JSON response with updated location data
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Invalid update data or hierarchy violation
 * @throws {404} Not Found - Location not found
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function PATCH(
  request: NextRequest, 
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    // 2. Get parameters and validate request body
    const { id: locationId } = await context.params;
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }
    
    const body = await request.json();
    const validatedData = validateUpdateLocation(body);

    // 3. Update the location
    const updatedLocation = await locationsService.updateLocation(
      session.user.id,
      locationId,
      householdId,
      validatedData
    );

    // 4. Return updated location
    return Response.json(createSuccessResponse(updatedLocation));

  } catch (error) {
    const resolvedParams = await context.params;
    console.error(`PATCH /api/v1/locations/${resolvedParams.id} error:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return Response.json(
          createErrorResponse('LOCATION_NOT_FOUND', 'Location not found'),
          { status: 404 }
        );
      }
      
      if (error.message.includes('hierarchy') || error.message.includes('circular')) {
        return Response.json(
          createErrorResponse('HIERARCHY_VIOLATION', error.message),
          { status: 400 }
        );
      }
      
      const validationError = handleValidationError(error);
      return Response.json(validationError, { 
        status: validationError.error === 'VALIDATION_ERROR' ? 400 : 500 
      });
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to update location'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/locations/{id} - Delete a location
 * 
 * @route DELETE /api/v1/locations/{id}
 * @access Private (requires authentication)
 * @param request - Next.js request object
 * @param context - Route context with location ID
 * @returns Promise<Response> JSON response confirming deletion
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {404} Not Found - Location not found
 * @throws {409} Conflict - Location has children or items
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function DELETE(
  request: NextRequest, 
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    // 2. Get parameters
    const { id: locationId } = await context.params;
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Delete the location
    await locationsService.deleteLocation(session.user.id, locationId, householdId);

    // 4. Return success response
    return Response.json(
      createSuccessResponse({ message: 'Location deleted successfully' })
    );

  } catch (error) {
    const resolvedParams = await context.params;
    console.error(`DELETE /api/v1/locations/${resolvedParams.id} error:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return Response.json(
          createErrorResponse('LOCATION_NOT_FOUND', 'Location not found'),
          { status: 404 }
        );
      }
      
      if (error.message.includes('contains')) {
        return Response.json(
          createErrorResponse('LOCATION_NOT_EMPTY', error.message),
          { status: 409 }
        );
      }
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to delete location'),
      { status: 500 }
    );
  }
}