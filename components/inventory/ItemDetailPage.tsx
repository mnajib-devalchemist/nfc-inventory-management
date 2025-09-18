'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhotoGallery } from '@/components/camera/PhotoGallery';
import { PhotoEditor } from '@/components/camera/PhotoEditor';
import { PhotoErrorBoundary } from '@/components/common/PhotoErrorBoundary';
import { ItemForm } from './ItemForm';
import {
  Edit,
  Share2,
  Download,
  ArrowLeft,
  MapPin,
  Calendar,
  DollarSign,
  Package,
  User,
  MoreHorizontal,
  Heart,
  Eye,
  Trash2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ItemStatus } from '@prisma/client';
import type { GalleryPhoto } from '@/lib/hooks/usePhotoGallery';

/**
 * Item interface with photos
 */
interface ItemWithPhotos {
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
    id: string;
    name: string;
    path: string;
  };
  photos?: Array<{
    id: string;
    originalUrl: string;
    thumbnailUrl: string;
    isPrimary: boolean;
    metadata?: {
      width: number;
      height: number;
      fileSize: number;
      captureDate?: string;
    };
  }>;
  creator?: {
    id: string;
    name: string | null;
    email: string;
  };
}

/**
 * Item detail page props
 */
interface ItemDetailPageProps {
  item: ItemWithPhotos;
  onEdit?: (item: ItemWithPhotos) => void;
  onDelete?: (itemId: string) => void;
  onPhotoEdit?: (photoId: string) => void;
  onPhotoDelete?: (photoId: string) => void;
  onSetPrimaryPhoto?: (photoId: string) => void;
  onPhotoShare?: (photoId: string) => void;
  onPhotoDownload?: (photoId: string) => void;
  onBack?: () => void;
  className?: string;
  showEditForm?: boolean;
  enablePhotoEdit?: boolean;
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
 * ItemDetailPage - Complete item view with photo carousel and metadata
 *
 * Provides comprehensive item details with photo carousel, swipe navigation,
 * full-screen photo view with gesture support, photo sharing functionality,
 * and comparison view for before/after edits.
 *
 * @component
 * @category Inventory Components
 * @since 1.3.0 (Story 2.3)
 */
export function ItemDetailPage({
  item,
  onEdit,
  onDelete,
  onPhotoEdit,
  onPhotoDelete,
  onSetPrimaryPhoto,
  onPhotoShare,
  onPhotoDownload,
  onBack,
  className,
  showEditForm = false,
  enablePhotoEdit = true,
}: ItemDetailPageProps) {
  // State
  const [isEditing, setIsEditing] = useState(showEditForm);
  const [selectedPhotoForEdit, setSelectedPhotoForEdit] = useState<string | null>(null);

  /**
   * Convert item photos to gallery format
   */
  const galleryPhotos: GalleryPhoto[] = React.useMemo(() => {
    if (!item.photos || item.photos.length === 0) {
      // Fallback to single photo if no photos array
      if (item.photoUrl && item.thumbnailUrl) {
        return [{
          id: 'primary',
          originalUrl: item.photoUrl,
          thumbnailUrl: item.thumbnailUrl,
          isPrimary: true,
          alt: item.name,
        }];
      }
      return [];
    }

    return item.photos.map(photo => ({
      id: photo.id,
      originalUrl: photo.originalUrl,
      thumbnailUrl: photo.thumbnailUrl,
      isPrimary: photo.isPrimary,
      metadata: photo.metadata,
      alt: `${item.name} - Photo`,
    }));
  }, [item.photos, item.photoUrl, item.thumbnailUrl, item.name]);

  /**
   * Format currency value
   */
  const formatCurrency = useCallback((value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }, []);

  /**
   * Format date
   */
  const formatDate = useCallback((date: Date | null | undefined): string => {
    if (!date) return 'Not specified';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(date));
  }, []);

  /**
   * Handle edit mode toggle
   */
  const handleEditToggle = useCallback(() => {
    setIsEditing(prev => !prev);
  }, []);

  /**
   * Handle edit form success
   */
  const handleEditSuccess = useCallback((updatedItem: any) => {
    setIsEditing(false);
    onEdit?.(updatedItem as ItemWithPhotos);
  }, [onEdit]);

  /**
   * Handle photo edit
   */
  const handlePhotoEdit = useCallback((photoId: string) => {
    setSelectedPhotoForEdit(photoId);
    onPhotoEdit?.(photoId);
  }, [onPhotoEdit]);

  /**
   * Handle photo edit close
   */
  const handlePhotoEditClose = useCallback(() => {
    setSelectedPhotoForEdit(null);
  }, []);

  /**
   * Handle item sharing
   */
  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.name,
          text: item.description || `Check out this item: ${item.name}`,
          url: window.location.href,
        });
      } catch (error) {
        console.log('Share cancelled or failed:', error);
      }
    } else {
      // Fallback to copying URL
      navigator.clipboard.writeText(window.location.href);
      // TODO: Show toast notification
    }
  }, [item.name, item.description]);

  /**
   * Handle copy link
   */
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      // TODO: Show toast notification
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  }, []);

  // Show edit form if editing
  if (isEditing) {
    return (
      <div className={cn('w-full max-w-4xl mx-auto', className)}>
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={handleEditToggle}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Details
          </Button>
        </div>

        <ItemForm
          item={item}
          mode="edit"
          onSuccess={handleEditSuccess}
          onCancel={handleEditToggle}
        />
      </div>
    );
  }

  // Show photo editor if selected
  if (selectedPhotoForEdit && enablePhotoEdit) {
    const selectedPhoto = galleryPhotos.find(p => p.id === selectedPhotoForEdit);
    if (selectedPhoto) {
      return (
        <PhotoErrorBoundary context="photo-editing">
          <PhotoEditor
            imageUrl={selectedPhoto.originalUrl}
            onSave={(blob) => {
              // TODO: Handle photo save
              handlePhotoEditClose();
            }}
            onCancel={handlePhotoEditClose}
            enableCrop={true}
            enableRotate={true}
            enableAdjustments={true}
            securityValidation={true}
          />
        </PhotoErrorBoundary>
      );
    }
  }

  return (
    <PhotoErrorBoundary context="photo-gallery" className={className}>
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          {onBack && (
            <Button
              variant="ghost"
              onClick={onBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleEditToggle}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit Item
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleShare}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Item
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/inventory/${item.id}/export`} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Export Details
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(item.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Item
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Photo Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Photos</h2>

            {galleryPhotos.length > 0 ? (
              <PhotoGallery
                photos={galleryPhotos}
                onPhotoEdit={enablePhotoEdit ? handlePhotoEdit : undefined}
                onPhotoDelete={onPhotoDelete}
                onSetPrimary={onSetPrimaryPhoto}
                onPhotoShare={onPhotoShare}
                onPhotoDownload={onPhotoDownload}
                showMetadata={true}
                enableSlideshow={true}
                maxPhotosPerRow={2}
                itemHeight={180}
              />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Eye className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Photos</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This item doesn't have any photos yet
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleEditToggle}
                    className="flex items-center gap-2"
                  >
                    <Edit className="h-4 w-4" />
                    Add Photos
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Item Details */}
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold">{item.name}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className={cn('text-xs font-medium', STATUS_COLORS[item.status])}
                    >
                      {item.status.toLowerCase()}
                    </Badge>
                    {galleryPhotos.some(p => p.isPrimary) && (
                      <Badge variant="secondary" className="text-xs">
                        <Heart className="h-3 w-3 mr-1" />
                        Has Primary Photo
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {item.description && (
                <p className="text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{item.location.path}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Quantity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{item.quantity} {item.unit}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Current Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{formatCurrency(item.currentValue)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Purchase Date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{formatDate(item.purchaseDate)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Purchase Information */}
            {item.purchasePrice && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Purchase Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Purchase Price:</span>
                    <span>{formatCurrency(item.purchasePrice)}</span>
                  </div>
                  {item.currentValue && item.purchasePrice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Value Change:</span>
                      <span className={cn(
                        'font-medium',
                        item.currentValue > item.purchasePrice
                          ? 'text-green-600'
                          : item.currentValue < item.purchasePrice
                          ? 'text-red-600'
                          : 'text-muted-foreground'
                      )}>
                        {item.currentValue > item.purchasePrice ? '+' : ''}
                        {formatCurrency(item.currentValue - item.purchasePrice)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Item Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span>{formatDate(item.updatedAt)}</span>
                </div>
                {item.creator && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created By:</span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {item.creator.name || item.creator.email}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Photos:</span>
                  <span>{galleryPhotos.length} photo{galleryPhotos.length !== 1 ? 's' : ''}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PhotoErrorBoundary>
  );
}