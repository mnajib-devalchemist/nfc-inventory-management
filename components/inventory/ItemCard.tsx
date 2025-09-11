'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  MapPin, 
  Calendar,
  DollarSign,
  Package,
  ExternalLink,
  Image as ImageIcon
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ItemStatus } from '@prisma/client';

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
 * ItemCard Component Props
 */
interface ItemCardProps {
  item: Item;
  onEdit?: (item: Item) => void;
  onDelete?: (itemId: string) => void;
  onView?: (itemId: string) => void;
  showActions?: boolean;
  variant?: 'default' | 'compact';
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
 * ItemCard - Individual item display component with photo and actions
 * 
 * Provides a visual representation of an inventory item with:
 * - Photo thumbnail display with fallback
 * - Item metadata and location
 * - Status indication with color coding
 * - Action dropdown for edit/delete operations
 * - Mobile-responsive design
 * 
 * @component
 */
export function ItemCard({
  item,
  onEdit,
  onDelete,
  onView,
  showActions = true,
  variant = 'default',
  className
}: ItemCardProps) {
  const [imageError, setImageError] = useState(false);

  /**
   * Handle image load error
   */
  const handleImageError = () => {
    setImageError(true);
  };

  /**
   * Format currency value
   */
  const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '';
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
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(date));
  };

  /**
   * Get primary photo URL
   */
  const getPrimaryPhotoUrl = (): string | null => {
    // Check for direct photo URLs
    if (!imageError && item.thumbnailUrl) {
      return item.thumbnailUrl;
    }
    
    // Check photos array
    if (item.photos && item.photos.length > 0) {
      const primaryPhoto = item.photos.find(photo => photo.isPrimary) || item.photos[0];
      return primaryPhoto.thumbnailUrl;
    }
    
    return null;
  };

  const photoUrl = getPrimaryPhotoUrl();
  const isCompact = variant === 'compact';

  return (
    <Card className={cn(
      'group relative overflow-hidden transition-all duration-200',
      'hover:shadow-md hover:shadow-black/5',
      'hover:scale-[1.01] active:scale-[0.99]',
      isCompact ? 'h-auto' : 'h-full',
      className
    )}>
      {/* Photo Section */}
      <div className={cn(
        'relative overflow-hidden bg-muted',
        isCompact ? 'aspect-square sm:aspect-[4/3]' : 'aspect-[4/3]'
      )}>
        {photoUrl && !imageError ? (
          <img
            src={photoUrl}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            onError={handleImageError}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
        
        {/* Status Badge Overlay */}
        <div className="absolute top-2 left-2">
          <Badge 
            variant="outline" 
            className={cn(
              'text-xs font-medium bg-white/90 backdrop-blur-sm',
              STATUS_COLORS[item.status]
            )}
          >
            {item.status.toLowerCase()}
          </Badge>
        </div>

        {/* Actions Dropdown */}
        {showActions && (onEdit || onDelete || onView) && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="sm"
                  className="h-8 w-8 p-0 bg-white/90 backdrop-blur-sm hover:bg-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onView && (
                  <DropdownMenuItem 
                    onClick={() => onView(item.id)}
                    className="cursor-pointer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem 
                    onClick={() => onEdit(item)}
                    className="cursor-pointer"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem 
                    onClick={() => onDelete(item.id)}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Quick View Overlay (on click if no specific actions) */}
        {onView && !showActions && (
          <button
            onClick={() => onView(item.id)}
            className="absolute inset-0 w-full h-full bg-black/0 hover:bg-black/10 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
            aria-label={`View ${item.name}`}
          />
        )}
      </div>

      {/* Content Section */}
      <CardHeader className={cn('pb-2', isCompact && 'pb-1')}>
        <div className="space-y-1">
          {/* Item Name */}
          <h3 className={cn(
            'font-semibold leading-tight line-clamp-2',
            isCompact ? 'text-sm' : 'text-base'
          )}>
            {item.name}
          </h3>

          {/* Location */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className={cn(
              'text-xs truncate',
              isCompact ? 'max-w-[120px]' : 'max-w-full'
            )}>
              {item.location.path}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className={cn('pt-0', isCompact && 'pb-3')}>
        <div className="space-y-2">
          {/* Description (non-compact only) */}
          {!isCompact && item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}

          {/* Metadata Row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              {/* Quantity */}
              <div className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                <span>{item.quantity} {item.unit}</span>
              </div>

              {/* Current Value */}
              {item.currentValue && (
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  <span className="font-medium">
                    {formatCurrency(item.currentValue)}
                  </span>
                </div>
              )}
            </div>

            {/* Purchase Date */}
            {item.purchaseDate && !isCompact && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(item.purchaseDate)}</span>
              </div>
            )}
          </div>

          {/* Additional Metadata (non-compact only) */}
          {!isCompact && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>
                Added {formatDate(item.createdAt)}
              </span>
              {item.creator && (
                <span className="truncate max-w-[120px]">
                  by {item.creator.name || item.creator.email}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* Click area for compact variant */}
      {isCompact && onView && (
        <button
          onClick={() => onView(item.id)}
          className="absolute inset-0 w-full h-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset rounded-lg"
          aria-label={`View ${item.name}`}
        />
      )}
    </Card>
  );
}