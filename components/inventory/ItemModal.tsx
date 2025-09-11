'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ItemForm } from './ItemForm';
import { deleteItemAction } from '@/lib/actions/items';
import {
  Edit,
  Trash2,
  MapPin,
  Calendar,
  DollarSign,
  Package,
  User,
  Clock,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemStatus, LocationType } from '@prisma/client';

/**
 * Item data interface
 */
interface Item {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  currentValue?: number | null;
  purchasePrice?: number | null;
  purchaseDate?: Date | null;
  status: ItemStatus;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  location: {
    name: string;
    path: string;
  };
  photos?: Array<{
    id: string;
    thumbnailUrl: string;
    isPrimary: boolean;
  }>;
  creator?: {
    name: string | null;
    email: string;
  };
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
 * ItemModal Component Props
 */
interface ItemModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (item: Item) => void;
  onDelete?: (itemId: string) => void;
  onLocationCreate?: (locationData: {
    name: string;
    locationType: LocationType;
    parentId?: string;
    description?: string;
  }) => Promise<Location>;
  locations?: Location[];
  mode?: 'view' | 'edit';
  className?: string;
}

/**
 * Status badge colors
 */
const STATUS_COLORS = {
  [ItemStatus.AVAILABLE]: 'bg-green-100 text-green-800 border-green-200',
  [ItemStatus.BORROWED]: 'bg-blue-100 text-blue-800 border-blue-200',
  [ItemStatus.MAINTENANCE]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  [ItemStatus.LOST]: 'bg-red-100 text-red-800 border-red-200',
  [ItemStatus.SOLD]: 'bg-gray-100 text-gray-800 border-gray-200',
};

/**
 * ItemModal - Modal for detailed item view and editing
 * 
 * Provides comprehensive item display and editing with:
 * - Full item details with photo gallery
 * - Inline editing with form validation
 * - Delete confirmation with proper error handling
 * - Mobile-responsive design
 * - Status and metadata display
 * 
 * @component
 */
export function ItemModal({
  item,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onLocationCreate,
  locations = [],
  mode = 'view',
  className
}: ItemModalProps) {
  // Local state
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageError, setImageError] = useState(false);

  /**
   * Handle switching to edit mode
   */
  const handleStartEdit = () => {
    setCurrentMode('edit');
  };

  /**
   * Handle successful edit
   */
  const handleEditSuccess = (updatedItem: any) => {
    setCurrentMode('view');
    if (onEdit) {
      onEdit(updatedItem);
    }
  };

  /**
   * Handle cancel edit
   */
  const handleCancelEdit = () => {
    setCurrentMode('view');
  };

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = async () => {
    if (!item) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteItemAction(item.id);
      
      if (result.success) {
        if (onDelete) {
          onDelete(item.id);
        }
        onClose();
      } else {
        setDeleteError(result.error || 'Failed to delete item');
      }
    } catch (error) {
      setDeleteError('Failed to delete item');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  /**
   * Format currency value
   */
  const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };

  /**
   * Format date
   */
  const formatDate = (date: Date | null | undefined): string => {
    if (!date) return 'Not specified';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  /**
   * Get primary photo URL
   */
  const getPrimaryPhotoUrl = (): string | null => {
    if (!item) return null;
    
    // Check for direct photo URLs
    if (!imageError && item.photoUrl) {
      return item.photoUrl;
    }
    
    // Check photos array
    if (item.photos && item.photos.length > 0) {
      const primaryPhoto = item.photos.find(photo => photo.isPrimary) || item.photos[0];
      return primaryPhoto.thumbnailUrl;
    }
    
    return null;
  };

  if (!item) return null;

  const photoUrl = getPrimaryPhotoUrl();

  return (
    <>
      {/* Main Modal */}
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={cn('max-w-4xl max-h-[90vh] overflow-y-auto', className)}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="text-xl font-semibold truncate pr-4">
                {item.name}
              </span>
              <Badge 
                variant="outline" 
                className={cn('flex-shrink-0', STATUS_COLORS[item.status])}
              >
                {item.status.toLowerCase()}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-base">
              {item.description || 'No description provided'}
            </DialogDescription>
          </DialogHeader>

          {/* Content */}
          {currentMode === 'edit' ? (
            /* Edit Mode */
            <div className="py-4">
              <ItemForm
                mode="edit"
                item={item}
                locations={locations}
                onSuccess={handleEditSuccess}
                onCancel={handleCancelEdit}
                onLocationCreate={onLocationCreate}
              />
            </div>
          ) : (
            /* View Mode */
            <div className="space-y-6 py-4">
              {/* Photo Section */}
              {photoUrl && (
                <div className="relative">
                  <img
                    src={photoUrl}
                    alt={item.name}
                    className="w-full max-h-80 object-contain rounded-lg border bg-muted"
                    onError={() => setImageError(true)}
                  />
                </div>
              )}

              {!photoUrl && (
                <div className="w-full h-40 flex items-center justify-center bg-muted rounded-lg border-2 border-dashed">
                  <div className="text-center">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">No photo</p>
                  </div>
                </div>
              )}

              {/* Item Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold text-lg mb-4">Basic Information</h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <div className="text-sm text-muted-foreground">Quantity</div>
                          <div className="font-medium">{item.quantity} {item.unit}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-muted-foreground">Location</div>
                          <div className="font-medium truncate">{item.location.path}</div>
                        </div>
                      </div>

                      {item.purchaseDate && (
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-sm text-muted-foreground">Purchase Date</div>
                            <div className="font-medium">
                              {new Intl.DateTimeFormat('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              }).format(new Date(item.purchaseDate))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Financial Information */}
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold text-lg mb-4">Financial Information</h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <div className="text-sm text-muted-foreground">Purchase Price</div>
                          <div className="font-medium">{formatCurrency(item.purchasePrice)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <div className="text-sm text-muted-foreground">Current Value</div>
                          <div className="font-medium">{formatCurrency(item.currentValue)}</div>
                        </div>
                      </div>

                      {/* Value change indicator */}
                      {item.purchasePrice && item.currentValue && (
                        <div className="pt-2 border-t">
                          <div className="text-sm text-muted-foreground">Value Change</div>
                          <div className={cn(
                            'font-medium flex items-center gap-1',
                            item.currentValue > item.purchasePrice 
                              ? 'text-green-600' 
                              : item.currentValue < item.purchasePrice 
                                ? 'text-red-600'
                                : 'text-muted-foreground'
                          )}>
                            {item.currentValue > item.purchasePrice ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : item.currentValue < item.purchasePrice ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : null}
                            {formatCurrency(item.currentValue - item.purchasePrice)}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Metadata */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">Metadata</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <div className="text-sm text-muted-foreground">Added</div>
                        <div className="text-sm">{formatDate(item.createdAt)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <div className="text-sm text-muted-foreground">Last Modified</div>
                        <div className="text-sm">{formatDate(item.updatedAt)}</div>
                      </div>
                    </div>

                    {item.creator && (
                      <div className="flex items-center gap-3 md:col-span-2">
                        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <div className="text-sm text-muted-foreground">Created by</div>
                          <div className="text-sm">
                            {item.creator.name || item.creator.email}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Error Display */}
              {deleteError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between pt-4 border-t">
                <div className="flex gap-3">
                  <Button onClick={handleStartEdit} variant="default">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Item
                  </Button>
                </div>

                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="destructive"
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Item
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{item.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}