import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { locationsService } from '@/lib/services';
import { 
  validateCreateLocation,
  validateSearchLocations,
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
} from '@/lib/validation';
import { getHouseholdContext, handleHouseholdContextError } from '@/lib/utils/household-context';

/**
 * GET /api/v1/locations - List locations with hierarchy and filtering
 * 
 * @route GET /api/v1/locations
 * @access Private (requires authentication)
 * @param request - Next.js request object with query parameters
 * @returns Promise<Response> JSON response with locations array
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Invalid query parameters
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    // 2. Get user's household
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Extract and validate query parameters
    const { searchParams } = new URL(request.url);
    const searchData = {
      query: searchParams.get('q') || undefined,
      parentId: searchParams.get('parentId') || undefined,
      locationType: searchParams.get('locationType') || undefined,
      includeEmpty: searchParams.get('includeEmpty') ? searchParams.get('includeEmpty') === 'true' : true,
      minLevel: searchParams.get('minLevel') ? Number(searchParams.get('minLevel')) : undefined,
      maxLevel: searchParams.get('maxLevel') ? Number(searchParams.get('maxLevel')) : undefined,
      sortBy: searchParams.get('sortBy') || 'name',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
    };

    // Validate search parameters
    const validatedSearchParams = validateSearchLocations(searchData);

    // 4. Execute search
    const result = await locationsService.searchLocations(householdId, validatedSearchParams);

    // 5. Return response
    return Response.json(createSuccessResponse(result.locations));

  } catch (error) {
    console.error('GET /api/v1/locations error:', error);
    
    if (error instanceof Error) {
      const validationError = handleValidationError(error);
      return Response.json(validationError, { 
        status: validationError.error === 'VALIDATION_ERROR' ? 400 : 500 
      });
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/locations - Create a new location
 * 
 * @route POST /api/v1/locations
 * @access Private (requires authentication)
 * @param request - Next.js request object with location data in body
 * @returns Promise<Response> JSON response with created location data
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Invalid location data or hierarchy violation
 * @throws {404} Not Found - Parent location not found
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    // 2. Get user's household
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Parse and validate request body
    const body = await request.json();
    const validatedData = validateCreateLocation(body);

    // 4. Create the location
    const location = await locationsService.createLocation(
      session.user.id, 
      householdId, 
      validatedData
    );

    // 5. Return success response
    return Response.json(
      createSuccessResponse(location),
      { status: 201 }
    );

  } catch (error) {
    console.error('POST /api/v1/locations error:', error);
    
    if (error instanceof Error) {
      // Handle specific business logic errors
      if (error.message.includes('not found')) {
        return Response.json(
          createErrorResponse('PARENT_LOCATION_NOT_FOUND', error.message),
          { status: 404 }
        );
      }
      
      if (error.message.includes('hierarchy') || error.message.includes('depth')) {
        return Response.json(
          createErrorResponse('HIERARCHY_VIOLATION', error.message),
          { status: 400 }
        );
      }
      
      if (error.message.includes('access denied')) {
        return Response.json(
          createErrorResponse('ACCESS_DENIED', error.message),
          { status: 403 }
        );
      }
      
      const validationError = handleValidationError(error);
      return Response.json(validationError, { 
        status: validationError.error === 'VALIDATION_ERROR' ? 400 : 500 
      });
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to create location'),
      { status: 500 }
    );
  }
}