import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { itemsService } from '@/lib/services';
import { 
  validateUpdateItem,
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
} from '@/lib/validation';
import { getHouseholdContext, handleHouseholdContextError } from '@/lib/utils/household-context';

/**
 * GET /api/v1/items/{id} - Get single item with details
 * 
 * @route GET /api/v1/items/{id}
 * @access Private (requires authentication)
 * @param request - Next.js request object
 * @param context - Route context with item ID
 * @returns Promise<Response> JSON response with item data
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {404} Not Found - Item not found
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
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
    const { id: itemId } = await params;
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Get the item
    const item = await itemsService.getItemById(itemId, householdId);

    if (!item) {
      return Response.json(
        createErrorResponse('ITEM_NOT_FOUND', 'Item not found'),
        { status: 404 }
      );
    }

    // 4. Return item data
    return Response.json(createSuccessResponse(item));

  } catch (error) {
    const resolvedParams = await params;
    console.error(`GET /api/v1/items/${resolvedParams.id} error:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return Response.json(
          createErrorResponse('ITEM_NOT_FOUND', 'Item not found'),
          { status: 404 }
        );
      }
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to retrieve item'),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/items/{id} - Update an existing item
 * 
 * @route PATCH /api/v1/items/{id}
 * @access Private (requires authentication)
 * @param request - Next.js request object with update data
 * @param context - Route context with item ID
 * @returns Promise<Response> JSON response with updated item data
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Invalid update data
 * @throws {404} Not Found - Item not found
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function PATCH(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
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
    const { id: itemId } = await params;
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }
    
    const body = await request.json();
    const validatedData = validateUpdateItem(body);

    // 3. Update the item
    const updatedItem = await itemsService.updateItem(
      session.user.id,
      itemId,
      householdId,
      validatedData
    );

    // 4. Return updated item
    return Response.json(createSuccessResponse(updatedItem));

  } catch (error) {
    const resolvedParams = await params;
    console.error(`PATCH /api/v1/items/${resolvedParams.id} error:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return Response.json(
          createErrorResponse('ITEM_NOT_FOUND', 'Item not found'),
          { status: 404 }
        );
      }
      
      if (error.message.includes('Location not found')) {
        return Response.json(
          createErrorResponse('LOCATION_NOT_FOUND', error.message),
          { status: 400 }
        );
      }
      
      const validationError = handleValidationError(error);
      return Response.json(validationError, { 
        status: validationError.error === 'VALIDATION_ERROR' ? 400 : 500 
      });
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to update item'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/items/{id} - Delete an item (soft delete)
 * 
 * @route DELETE /api/v1/items/{id}
 * @access Private (requires authentication)
 * @param request - Next.js request object
 * @param context - Route context with item ID
 * @returns Promise<Response> JSON response confirming deletion
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {404} Not Found - Item not found
 * @throws {409} Conflict - Item cannot be deleted (e.g., currently borrowed)
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function DELETE(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
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
    const { id: itemId } = await params;
    // Get user's household context with security validation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Delete the item
    await itemsService.deleteItem(session.user.id, itemId, householdId);

    // 4. Return success response
    return Response.json(
      createSuccessResponse({ message: 'Item deleted successfully' })
    );

  } catch (error) {
    const resolvedParams = await params;
    console.error(`DELETE /api/v1/items/${resolvedParams.id} error:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return Response.json(
          createErrorResponse('ITEM_NOT_FOUND', 'Item not found'),
          { status: 404 }
        );
      }
      
      if (error.message.includes('borrowed')) {
        return Response.json(
          createErrorResponse('ITEM_BORROWED', error.message),
          { status: 409 }
        );
      }
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to delete item'),
      { status: 500 }
    );
  }
}