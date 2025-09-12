'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { itemsService } from '@/lib/services/items';
import { 
  CreateItemSchema, 
  UpdateItemSchema,
  validateCreateItem,
  validateUpdateItem 
} from '@/lib/validation/items';
import { redirect } from 'next/navigation';

/**
 * Form state interface for React 19 useActionState
 */
interface FormState {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  item?: any;
  message?: string;
}

/**
 * Server action for creating a new inventory item with React 19 useActionState pattern.
 * 
 * Handles complete item creation workflow including authentication verification,
 * data validation using Zod schemas, database transaction management, and path
 * revalidation for optimal Next.js cache management.
 * 
 * @route Server Action (called via useActionState)
 * @access Private (requires authentication)
 * @since 1.3.0
 * 
 * @param prevState - Previous form state from React 19 useActionState
 * @param formData - Form data from client submission containing item fields
 * @returns Promise resolving to updated form state with success/error information
 * 
 * @throws {ValidationError} When form data fails Zod schema validation
 * @throws {AuthenticationError} When user session is invalid or missing
 * @throws {DatabaseError} When item creation fails due to database constraints
 * 
 * @example Usage in React 19 component
 * ```typescript
 * const [state, formAction, isPending] = useActionState(createItemAction, {
 *   success: false,
 *   error: null,
 * });
 * 
 * return (
 *   <form action={formAction}>
 *     <input name="name" required />
 *     <input name="locationId" required />
 *     <button type="submit">Create Item</button>
 *   </form>
 * );
 * ```
 */
export async function createItemAction(prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    // 1. Get authenticated user session
    const session = await auth();
    if (!session?.user?.id) {
      return { 
        success: false, 
        error: 'Authentication required',
        fieldErrors: {}
      };
    }

    // 2. Extract and validate form data
    const rawData = {
      name: formData.get('name')?.toString(),
      description: formData.get('description')?.toString() || undefined,
      locationId: formData.get('locationId')?.toString(),
      quantity: Number(formData.get('quantity')) || 1,
      unit: formData.get('unit')?.toString() || 'piece',
      purchasePrice: formData.get('purchasePrice') ? Number(formData.get('purchasePrice')) : undefined,
      currentValue: formData.get('currentValue') ? Number(formData.get('currentValue')) : undefined,
      purchaseDate: formData.get('purchaseDate')?.toString() || undefined,
    };

    // 3. Validate data against schema
    const validatedData = validateCreateItem(rawData);

    // 4. Get user's household ID (assuming from session or user profile)
    // Note: This would need to be implemented based on your household management
    const householdId = session.user.householdId || 'temp-household-id';

    // 5. Create the item
    const item = await itemsService.createItem(
      session.user.id,
      householdId,
      validatedData
    );

    // 6. Revalidate relevant paths
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      item,
      message: 'Item created successfully',
      fieldErrors: {}
    };

  } catch (error: any) {
    console.error('Create item action error:', error);

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {};
      error.errors.forEach((err: any) => {
        if (err.path.length > 0) {
          fieldErrors[err.path[0]] = err.message;
        }
      });

      return {
        success: false,
        error: 'Please check the form for errors',
        fieldErrors
      };
    }

    // Handle service layer errors
    return {
      success: false,
      error: error.message || 'Failed to create item',
      fieldErrors: {}
    };
  }
}

/**
 * Server action for updating an inventory item
 */
export async function updateItemAction(itemId: string, prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    // 1. Get authenticated user session
    const session = await auth();
    if (!session?.user?.id) {
      return { 
        success: false, 
        error: 'Authentication required',
        fieldErrors: {}
      };
    }

    // 2. Extract and validate form data (only include changed fields)
    const rawData: any = {};
    
    const name = formData.get('name')?.toString();
    if (name) rawData.name = name;
    
    const description = formData.get('description')?.toString();
    if (description !== undefined) rawData.description = description || undefined;
    
    const locationId = formData.get('locationId')?.toString();
    if (locationId) rawData.locationId = locationId;
    
    const quantity = formData.get('quantity')?.toString();
    if (quantity) rawData.quantity = Number(quantity);
    
    const unit = formData.get('unit')?.toString();
    if (unit) rawData.unit = unit;
    
    const purchasePrice = formData.get('purchasePrice')?.toString();
    if (purchasePrice) rawData.purchasePrice = Number(purchasePrice);
    
    const currentValue = formData.get('currentValue')?.toString();
    if (currentValue) rawData.currentValue = Number(currentValue);
    
    const purchaseDate = formData.get('purchaseDate')?.toString();
    if (purchaseDate) rawData.purchaseDate = purchaseDate;

    // 3. Validate data against schema
    const validatedData = validateUpdateItem(rawData);

    // 4. Get user's household ID
    const householdId = session.user.householdId || 'temp-household-id';

    // 5. Update the item
    const item = await itemsService.updateItem(
      session.user.id,
      itemId,
      householdId,
      validatedData
    );

    // 6. Revalidate relevant paths
    revalidatePath('/inventory');
    revalidatePath(`/inventory/${itemId}`);
    revalidatePath('/dashboard');

    return {
      success: true,
      item,
      message: 'Item updated successfully',
      fieldErrors: {}
    };

  } catch (error: any) {
    console.error('Update item action error:', error);

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {};
      error.errors.forEach((err: any) => {
        if (err.path.length > 0) {
          fieldErrors[err.path[0]] = err.message;
        }
      });

      return {
        success: false,
        error: 'Please check the form for errors',
        fieldErrors
      };
    }

    // Handle service layer errors
    return {
      success: false,
      error: error.message || 'Failed to update item',
      fieldErrors: {}
    };
  }
}

/**
 * Server action for deleting an inventory item
 */
export async function deleteItemAction(itemId: string) {
  try {
    // 1. Get authenticated user session
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    // 2. Get user's household ID
    const householdId = session.user.householdId || 'temp-household-id';

    // 3. Delete the item (soft delete)
    await itemsService.deleteItem(
      session.user.id,
      itemId,
      householdId
    );

    // 4. Revalidate relevant paths
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Item deleted successfully'
    };

  } catch (error: any) {
    console.error('Delete item action error:', error);
    
    return {
      success: false,
      error: error.message || 'Failed to delete item'
    };
  }
}

/**
 * Helper function to redirect after successful item creation
 */
export async function redirectToInventory() {
  redirect('/inventory');
}

/**
 * Helper function to redirect to item details
 */
export async function redirectToItem(itemId: string) {
  redirect(`/inventory/${itemId}`);
}