import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { itemsService } from '@/lib/services';
import { 
  validateCreateItem,
  validateSearchItems,
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
} from '@/lib/validation';
import { getHouseholdContext, handleHouseholdContextError } from '@/lib/utils/household-context';

/**
 * GET /api/v1/items - List items with pagination and filtering
 * 
 * @route GET /api/v1/items
 * @access Private (requires authentication)
 * @param request - Next.js request object with query parameters
 * @returns Promise<Response> JSON response with items array and pagination metadata
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User lacks permission to access items
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

    // 2. Get user's household context with security validation
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
      locationId: searchParams.get('locationId') || undefined,
      status: searchParams.get('status') || undefined,
      tags: searchParams.get('tags')?.split(',') || undefined,
      minValue: searchParams.get('minValue') ? Number(searchParams.get('minValue')) : undefined,
      maxValue: searchParams.get('maxValue') ? Number(searchParams.get('maxValue')) : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
      sortBy: searchParams.get('sortBy') || 'name',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
    };

    // Validate search parameters
    const validatedSearchParams = validateSearchItems(searchData);

    // 4. Execute search
    const result = await itemsService.searchItems(householdId, validatedSearchParams);

    // 5. Return paginated response
    return Response.json({
      data: result.items,
      pagination: result.pagination,
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });

  } catch (error) {
    console.error('GET /api/v1/items error:', error);
    
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
 * POST /api/v1/items - Create a new inventory item
 * 
 * @route POST /api/v1/items
 * @access Private (requires authentication)
 * @param request - Next.js request object with item data in body
 * @returns Promise<Response> JSON response with created item data
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Invalid item data
 * @throws {404} Not Found - Location not found
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

    // 2. Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Parse and validate request body
    const body = await request.json();
    const validatedData = validateCreateItem(body);

    // 4. Create the item
    const item = await itemsService.createItem(
      session.user.id, 
      householdId, 
      validatedData
    );

    // 5. Return success response
    return Response.json(
      createSuccessResponse(item),
      { status: 201 }
    );

  } catch (error) {
    console.error('POST /api/v1/items error:', error);
    
    if (error instanceof Error) {
      // Handle specific business logic errors
      if (error.message.includes('Location not found')) {
        return Response.json(
          createErrorResponse('LOCATION_NOT_FOUND', error.message),
          { status: 404 }
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
      createErrorResponse('INTERNAL_ERROR', 'Failed to create item'),
      { status: 500 }
    );
  }
}