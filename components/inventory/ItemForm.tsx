'use client';

import React, { useActionState, useOptimistic, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PhotoUpload } from '@/components/camera/PhotoUpload';
import { LocationSelector } from '@/components/locations/LocationSelector';
import { createItemAction, updateItemAction } from '@/lib/actions/items';
import { AlertCircle, CheckCircle, Loader2, Save, Plus, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocationType } from '@prisma/client';

/**
 * Item data interface
 */
interface Item {
  id?: string;
  name: string;
  description?: string | null;
  locationId: string;
  quantity: number;
  unit: string;
  purchasePrice?: number | null;
  currentValue?: number | null;
  purchaseDate?: Date | string | null;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  status?: any;
  createdAt?: Date;
  updatedAt?: Date;
  location?: any;
  [key: string]: any; // Allow additional properties
}

/**
 * Location data interface
 */
interface Location {
  id: string;
  name: string;
  path: string;
  locationType: LocationType;
  parentId: string | null;
  level: number;
  itemCount?: number;
}

/**
 * ItemForm Component Props
 */
interface ItemFormProps {
  item?: Partial<Item>;
  locations?: Location[];
  onSuccess?: (item: Item) => void;
  onCancel?: () => void;
  onLocationCreate?: (locationData: {
    name: string;
    locationType: LocationType;
    parentId?: string;
    description?: string;
  }) => Promise<Location>;
  className?: string;
  mode?: 'create' | 'edit';
}

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
 * Initial form state
 */
const initialState: FormState = {
  success: false,
  error: undefined,
  fieldErrors: {},
  item: undefined,
  message: undefined,
};

/**
 * ItemForm - React 19 useActionState form for comprehensive item creation and editing.
 * 
 * This component provides a complete item management interface with modern React 19 patterns,
 * security-focused photo upload integration, hierarchical location selection, and mobile-responsive
 * design. Implements optimistic UI updates for immediate user feedback during server operations.
 * 
 * @component
 * @category Inventory Components
 * @since 1.3.0
 * 
 * @param props - The component props
 * @param props.item - Optional existing item data for editing mode
 * @param props.locations - Array of available locations for selection
 * @param props.onSuccess - Callback invoked when item is successfully created/updated
 * @param props.onCancel - Callback for cancel action (shows cancel button when provided)
 * @param props.onLocationCreate - Handler for creating new locations inline
 * @param props.className - Additional CSS classes for styling
 * @param props.mode - Form mode: 'create' for new items, 'edit' for existing items
 * 
 * @returns The rendered form component with all form fields and validation
 * 
 * @example Basic item creation
 * ```tsx
 * <ItemForm 
 *   locations={availableLocations}
 *   onSuccess={(item) => {
 *     console.log('Created item:', item.name);
 *     router.push(`/inventory/${item.id}`);
 *   }}
 *   onCancel={() => router.back()}
 *   onLocationCreate={handleLocationCreation}
 * />
 * ```
 * 
 * @example Editing existing item
 * ```tsx
 * <ItemForm 
 *   item={existingItem}
 *   locations={userLocations}
 *   mode="edit"
 *   onSuccess={(updatedItem) => {
 *     showSuccessMessage('Item updated successfully');
 *     setCurrentItem(updatedItem);
 *   }}
 * />
 * ```
 */
export function ItemForm({
  item,
  locations = [],
  onSuccess,
  onCancel,
  onLocationCreate,
  className,
  mode = 'create'
}: ItemFormProps) {
  // React 19 useActionState for form handling
  const [state, formAction, isPending] = useActionState(
    mode === 'edit' && item?.id 
      ? updateItemAction.bind(null, item.id)
      : createItemAction,
    initialState
  );

  // Local form state
  const [selectedLocationId, setSelectedLocationId] = useState<string>(item?.locationId || '');
  const [photoUrl, setPhotoUrl] = useState<string>(item?.photoUrl || '');
  const [thumbnailUrl, setThumbnailUrl] = useState<string>(item?.thumbnailUrl || '');

  // Optimistic state for immediate UI feedback
  const [optimisticSubmitting, addOptimisticSubmitting] = useOptimistic(
    false,
    (state, newSubmitting: boolean) => newSubmitting
  );

  /**
   * Handle form submission with optimistic UI
   */
  const handleSubmit = useCallback((formData: FormData) => {
    // Add optimistic loading state
    addOptimisticSubmitting(true);
    
    // Add selected location to form data
    if (selectedLocationId) {
      formData.set('locationId', selectedLocationId);
    }

    // Call the server action
    formAction(formData);
  }, [selectedLocationId, formAction, addOptimisticSubmitting]);

  /**
   * Handle successful submission
   */
  React.useEffect(() => {
    if (state.success && state.item && onSuccess) {
      onSuccess(state.item);
    }
  }, [state.success, state.item, onSuccess]);

  /**
   * Handle photo upload success
   */
  const handlePhotoUpload = useCallback((newPhotoUrl: string, newThumbnailUrl: string) => {
    setPhotoUrl(newPhotoUrl);
    setThumbnailUrl(newThumbnailUrl);
  }, []);

  /**
   * Handle photo removal
   */
  const handlePhotoRemove = useCallback(() => {
    setPhotoUrl('');
    setThumbnailUrl('');
  }, []);

  /**
   * Handle location selection
   */
  const handleLocationChange = useCallback((locationId: string, location: Location) => {
    setSelectedLocationId(locationId);
  }, []);

  // Determine if form is submitting
  const isSubmitting = isPending || optimisticSubmitting;

  return (
    <Card className={cn('w-full max-w-2xl mx-auto', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {mode === 'edit' ? (
            <>
              <Edit className="h-5 w-5" />
              Edit Item
            </>
          ) : (
            <>
              <Plus className="h-5 w-5" />
              Add New Item
            </>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form action={handleSubmit} className="space-y-6">
          {/* Item Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Item Name *
            </Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="e.g., Power Drill, Kitchen Table, Winter Coat"
              defaultValue={item?.name || ''}
              disabled={isSubmitting}
              className={cn(
                state.fieldErrors?.name && 'border-destructive focus:border-destructive'
              )}
              autoFocus
            />
            {state.fieldErrors && state.fieldErrors.name && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{state.fieldErrors.name}</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional description of the item, its condition, or notes"
              rows={3}
              defaultValue={item?.description || ''}
              disabled={isSubmitting}
              className={cn(
                state.fieldErrors?.description && 'border-destructive focus:border-destructive'
              )}
            />
            {state.fieldErrors?.description && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{state.fieldErrors.description}</span>
              </div>
            )}
          </div>

          {/* Location Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Location *
            </Label>
            <LocationSelector
              value={selectedLocationId}
              onValueChange={handleLocationChange}
              locations={locations}
              onCreateLocation={onLocationCreate}
              placeholder="Select where this item is located"
              disabled={isSubmitting}
              showCreateButton={true}
              showPath={true}
            />
            {state.fieldErrors?.locationId && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{state.fieldErrors.locationId}</span>
              </div>
            )}
          </div>

          {/* Quantity and Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-sm font-medium">
                Quantity
              </Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                max="999999"
                placeholder="1"
                defaultValue={item?.quantity?.toString() || '1'}
                disabled={isSubmitting}
                className={cn(
                  state.fieldErrors?.quantity && 'border-destructive focus:border-destructive'
                )}
              />
              {state.fieldErrors?.quantity && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{state.fieldErrors.quantity}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit" className="text-sm font-medium">
                Unit
              </Label>
              <Input
                id="unit"
                name="unit"
                type="text"
                placeholder="piece, box, set, etc."
                defaultValue={item?.unit || 'piece'}
                disabled={isSubmitting}
                className={cn(
                  state.fieldErrors?.unit && 'border-destructive focus:border-destructive'
                )}
              />
              {state.fieldErrors?.unit && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{state.fieldErrors.unit}</span>
                </div>
              )}
            </div>
          </div>

          {/* Purchase Price and Current Value */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchasePrice" className="text-sm font-medium">
                Purchase Price
              </Label>
              <Input
                id="purchasePrice"
                name="purchasePrice"
                type="number"
                step="0.01"
                min="0"
                max="999999.99"
                placeholder="0.00"
                defaultValue={item?.purchasePrice?.toString() || ''}
                disabled={isSubmitting}
                className={cn(
                  state.fieldErrors?.purchasePrice && 'border-destructive focus:border-destructive'
                )}
              />
              {state.fieldErrors?.purchasePrice && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{state.fieldErrors.purchasePrice}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentValue" className="text-sm font-medium">
                Current Value
              </Label>
              <Input
                id="currentValue"
                name="currentValue"
                type="number"
                step="0.01"
                min="0"
                max="999999.99"
                placeholder="0.00"
                defaultValue={item?.currentValue?.toString() || ''}
                disabled={isSubmitting}
                className={cn(
                  state.fieldErrors?.currentValue && 'border-destructive focus:border-destructive'
                )}
              />
              {state.fieldErrors?.currentValue && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{state.fieldErrors.currentValue}</span>
                </div>
              )}
            </div>
          </div>

          {/* Purchase Date */}
          <div className="space-y-2">
            <Label htmlFor="purchaseDate" className="text-sm font-medium">
              Purchase Date
            </Label>
            <Input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              defaultValue={
                item?.purchaseDate 
                  ? item.purchaseDate instanceof Date 
                    ? item.purchaseDate.toISOString().split('T')[0]
                    : item.purchaseDate
                  : ''
              }
              disabled={isSubmitting}
              className={cn(
                state.fieldErrors?.purchaseDate && 'border-destructive focus:border-destructive'
              )}
            />
            {state.fieldErrors?.purchaseDate && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{state.fieldErrors.purchaseDate}</span>
              </div>
            )}
          </div>

          {/* Photo Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Photo</Label>
            <PhotoUpload
              itemId={item?.id || 'temp-' + Date.now()}
              currentPhotoUrl={photoUrl}
              currentThumbnailUrl={thumbnailUrl}
              onPhotoUpload={handlePhotoUpload}
              onPhotoRemove={handlePhotoRemove}
              disabled={isSubmitting}
              maxFileSize={10}
            />
          </div>

          {/* Form Status Messages */}
          {state.error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          {state.success && state.message && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>{state.message}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || !selectedLocationId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {mode === 'edit' ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {mode === 'edit' ? 'Update Item' : 'Create Item'}
                </>
              )}
            </Button>

            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
            )}
          </div>

          {/* Form Validation Helper */}
          {!selectedLocationId && (
            <div className="text-sm text-muted-foreground text-center">
              <Badge variant="secondary" className="px-2 py-1">
                Please select a location to save the item
              </Badge>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}