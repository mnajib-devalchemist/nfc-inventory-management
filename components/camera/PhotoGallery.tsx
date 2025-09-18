'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PhotoErrorBoundary } from '@/components/common/PhotoErrorBoundary';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3X3,
  List,
  Download,
  Edit,
  Trash2,
  Share2,
  MoreHorizontal,
  Image as ImageIcon,
  Play,
  Pause,
  RotateCw,
  Heart,
  Eye,
  Calendar,
  Camera,
  MapPin
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { usePhotoGallery, usePhotoZoom, type GalleryPhoto } from '@/lib/hooks/usePhotoGallery';

/**
 * Photo gallery component props
 */
interface PhotoGalleryProps {
  photos: GalleryPhoto[];
  onPhotoEdit?: (photoId: string) => void;
  onPhotoDelete?: (photoId: string) => void;
  onSetPrimary?: (photoId: string) => void;
  onPhotoShare?: (photoId: string) => void;
  onPhotoDownload?: (photoId: string) => void;
  className?: string;
  showMetadata?: boolean;
  enableSelection?: boolean;
  enableSlideshow?: boolean;
  enableVirtualScrolling?: boolean;
  maxPhotosPerRow?: number;
  itemHeight?: number;
  showControls?: boolean;
}

/**
 * Gallery view mode
 */
type ViewMode = 'grid' | 'list';

/**
 * PhotoGallery - Grid view of item photos with lightbox and zoom
 *
 * Implements virtual scrolling for large photo sets, lightbox modal with
 * full-screen photo viewing, zoom functionality with pinch-to-zoom on mobile,
 * photo navigation with keyboard shortcuts, metadata display with privacy
 * controls, and comprehensive accessibility features.
 *
 * @component
 * @category Media Components
 * @since 1.3.0 (Story 2.3)
 */
export function PhotoGallery({
  photos,
  onPhotoEdit,
  onPhotoDelete,
  onSetPrimary,
  onPhotoShare,
  onPhotoDownload,
  className,
  showMetadata = true,
  enableSelection = false,
  enableSlideshow = true,
  enableVirtualScrolling = true,
  maxPhotosPerRow = 4,
  itemHeight = 200,
  showControls = true,
}: PhotoGalleryProps) {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isSlideshow, setIsSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState<NodeJS.Timeout | null>(null);

  // Gallery hook
  const {
    currentPhoto,
    currentIndex,
    isLightboxOpen,
    isZoomed,
    zoomLevel,
    selectedPhotos,
    openLightbox,
    closeLightbox,
    nextPhoto,
    prevPhoto,
    toggleZoom,
    setZoom,
    toggleSelection,
    selectAll,
    clearSelection,
    getVisibleRange,
    isPhotoLoaded,
    galleryRef,
    lightboxRef,
    getMemoryStats,
  } = usePhotoGallery(photos, {
    enableVirtualScrolling,
    enableSelection,
    enableZoom: true,
    maxZoomLevel: 5,
    lazyLoadThreshold: 2,
    virtualScrollConfig: {
      itemHeight,
      containerHeight: 600,
      overscan: 3,
    },
  });

  // Zoom hook for lightbox
  const lightboxImageRef = useRef<HTMLImageElement>(null);
  const { zoomState, resetZoom, transform } = usePhotoZoom(lightboxImageRef, {
    maxZoom: 5,
    enablePinchZoom: true,
    enableDoubleClickZoom: true,
  });

  /**
   * Start slideshow
   */
  const startSlideshow = useCallback(() => {
    if (!enableSlideshow || photos.length <= 1) return;

    setIsSlideshow(true);
    const interval = setInterval(() => {
      nextPhoto();
    }, 3000); // 3 seconds per photo

    setSlideshowInterval(interval);
  }, [enableSlideshow, photos.length, nextPhoto]);

  /**
   * Stop slideshow
   */
  const stopSlideshow = useCallback(() => {
    setIsSlideshow(false);
    if (slideshowInterval) {
      clearInterval(slideshowInterval);
      setSlideshowInterval(null);
    }
  }, [slideshowInterval]);

  /**
   * Clean up slideshow on unmount
   */
  useEffect(() => {
    return () => {
      if (slideshowInterval) {
        clearInterval(slideshowInterval);
      }
    };
  }, [slideshowInterval]);

  /**
   * Format file size
   */
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  /**
   * Format date
   */
  const formatDate = useCallback((dateString?: string): string => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  }, []);

  /**
   * Handle photo click
   */
  const handlePhotoClick = useCallback((index: number) => {
    openLightbox(index);
    resetZoom();
  }, [openLightbox, resetZoom]);

  /**
   * Handle lightbox close
   */
  const handleLightboxClose = useCallback(() => {
    stopSlideshow();
    resetZoom();
    closeLightbox();
  }, [stopSlideshow, resetZoom, closeLightbox]);

  /**
   * Get grid columns based on screen size and maxPhotosPerRow
   */
  const getGridCols = useCallback(() => {
    return Math.min(maxPhotosPerRow, photos.length);
  }, [maxPhotosPerRow, photos.length]);

  // Early return if no photos
  if (photos.length === 0) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Photos</h3>
          <p className="text-sm text-muted-foreground">
            Add photos to see them here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <PhotoErrorBoundary context="photo-gallery" className={className}>
      <div className="space-y-4">
        {/* Gallery Controls */}
        {showControls && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
              </Badge>

              {selectedPhotos.size > 0 && (
                <Badge variant="default" className="text-xs">
                  {selectedPhotos.size} selected
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-r-none"
                >
                  <Grid3X3 className="h-4 w-4" />
                  <span className="sr-only">Grid view</span>
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-l-none"
                >
                  <List className="h-4 w-4" />
                  <span className="sr-only">List view</span>
                </Button>
              </div>

              {/* Selection Controls */}
              {enableSelection && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                    disabled={selectedPhotos.size === photos.length}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    disabled={selectedPhotos.size === 0}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Photo Grid/List */}
        <div
          ref={galleryRef}
          className={cn(
            'relative overflow-auto',
            viewMode === 'grid' &&
              `grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-${getGridCols()}`,
            viewMode === 'list' && 'space-y-4'
          )}
          style={{ maxHeight: enableVirtualScrolling ? '600px' : 'auto' }}
          role="grid"
          aria-label={`Photo gallery with ${photos.length} photos`}
        >
          {photos.map((photo, index) => (
            <PhotoGridItem
              key={photo.id}
              photo={photo}
              index={index}
              viewMode={viewMode}
              isSelected={selectedPhotos.has(photo.id)}
              isLoaded={isPhotoLoaded(photo.id)}
              showMetadata={showMetadata}
              enableSelection={enableSelection}
              onClick={() => handlePhotoClick(index)}
              onSelect={() => toggleSelection(photo.id)}
              onEdit={() => onPhotoEdit?.(photo.id)}
              onDelete={() => onPhotoDelete?.(photo.id)}
              onSetPrimary={() => onSetPrimary?.(photo.id)}
              onShare={() => onPhotoShare?.(photo.id)}
              onDownload={() => onPhotoDownload?.(photo.id)}
              formatFileSize={formatFileSize}
              formatDate={formatDate}
            />
          ))}
        </div>

        {/* Lightbox Modal */}
        {isLightboxOpen && currentPhoto && (
          <div
            ref={lightboxRef}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Photo lightbox"
            onClick={handleLightboxClose}
          >
            <div
              className="relative w-full h-full flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Lightbox Controls */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-black/50 text-white border-white/20">
                    {currentIndex + 1} of {photos.length}
                  </Badge>
                  {currentPhoto.isPrimary && (
                    <Badge variant="default" className="bg-yellow-500 text-black">
                      <Heart className="h-3 w-3 mr-1" />
                      Primary
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Slideshow Controls */}
                  {enableSlideshow && photos.length > 1 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={isSlideshow ? stopSlideshow : startSlideshow}
                      className="bg-black/50 text-white border-white/20"
                    >
                      {isSlideshow ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      <span className="sr-only">
                        {isSlideshow ? 'Pause slideshow' : 'Start slideshow'}
                      </span>
                    </Button>
                  )}

                  {/* Zoom Controls */}
                  <div className="flex items-center gap-1 bg-black/50 rounded border border-white/20">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoom(zoomLevel - 0.5)}
                      disabled={zoomLevel <= 1}
                      className="text-white hover:bg-white/20"
                    >
                      <ZoomOut className="h-4 w-4" />
                      <span className="sr-only">Zoom out</span>
                    </Button>
                    <span className="px-2 text-sm text-white">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoom(zoomLevel + 0.5)}
                      disabled={zoomLevel >= 5}
                      className="text-white hover:bg-white/20"
                    >
                      <ZoomIn className="h-4 w-4" />
                      <span className="sr-only">Zoom in</span>
                    </Button>
                  </div>

                  {/* Close Button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLightboxClose}
                    className="bg-black/50 text-white border-white/20"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close lightbox</span>
                  </Button>
                </div>
              </div>

              {/* Navigation Arrows */}
              {photos.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={prevPhoto}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white border-white/20 rounded-full w-12 h-12 p-0"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>

                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={nextPhoto}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white border-white/20 rounded-full w-12 h-12 p-0"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

              {/* Main Photo */}
              <div className="relative max-w-full max-h-full overflow-hidden">
                <img
                  ref={lightboxImageRef}
                  src={currentPhoto.originalUrl}
                  alt={currentPhoto.alt || `Photo ${currentIndex + 1}`}
                  className="max-w-full max-h-full object-contain cursor-zoom-in transition-transform duration-200"
                  style={{
                    transform: zoomState.scale > 1 ? transform : `scale(${zoomLevel})`,
                    cursor: zoomLevel > 1 ? 'zoom-out' : 'zoom-in'
                  }}
                  onClick={toggleZoom}
                  onLoad={() => console.log('Photo loaded in lightbox')}
                  onError={() => console.error('Failed to load photo in lightbox')}
                />
              </div>

              {/* Photo Metadata Overlay */}
              {showMetadata && currentPhoto.metadata && (
                <div className="absolute bottom-4 left-4 right-4 bg-black/50 text-white p-4 rounded border border-white/20">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {currentPhoto.metadata.width && currentPhoto.metadata.height && (
                      <div className="flex items-center gap-2">
                        <Maximize2 className="h-4 w-4" />
                        <span>{currentPhoto.metadata.width} × {currentPhoto.metadata.height}</span>
                      </div>
                    )}

                    {currentPhoto.metadata.fileSize && (
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        <span>{formatFileSize(currentPhoto.metadata.fileSize)}</span>
                      </div>
                    )}

                    {currentPhoto.metadata.captureDate && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(currentPhoto.metadata.captureDate)}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      <span>Photo {currentIndex + 1} of {photos.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PhotoErrorBoundary>
  );
}

/**
 * Individual photo grid item component
 */
interface PhotoGridItemProps {
  photo: GalleryPhoto;
  index: number;
  viewMode: ViewMode;
  isSelected: boolean;
  isLoaded: boolean;
  showMetadata: boolean;
  enableSelection: boolean;
  onClick: () => void;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetPrimary?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  formatFileSize: (bytes: number) => string;
  formatDate: (dateString?: string) => string;
}

function PhotoGridItem({
  photo,
  index,
  viewMode,
  isSelected,
  isLoaded,
  showMetadata,
  enableSelection,
  onClick,
  onSelect,
  onEdit,
  onDelete,
  onSetPrimary,
  onShare,
  onDownload,
  formatFileSize,
  formatDate,
}: PhotoGridItemProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-200',
        'hover:shadow-lg hover:shadow-black/10',
        isSelected && 'ring-2 ring-primary ring-offset-2',
        viewMode === 'list' && 'flex flex-row'
      )}
      role="gridcell"
      tabIndex={0}
      aria-label={`Photo ${index + 1}: ${photo.alt || 'No description'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Photo Container */}
      <div
        className={cn(
          'relative overflow-hidden bg-muted',
          viewMode === 'grid' && 'aspect-square',
          viewMode === 'list' && 'w-24 h-24 flex-shrink-0'
        )}
      >
        {/* Loading Skeleton */}
        {!isLoaded && !imageError && (
          <Skeleton className="absolute inset-0 w-full h-full" />
        )}

        {/* Photo Image */}
        {!imageError && (
          <img
            src={isLoaded ? photo.thumbnailUrl : undefined}
            data-src={photo.thumbnailUrl}
            data-photo-id={photo.id}
            alt={photo.alt || `Photo ${index + 1}`}
            className={cn(
              'w-full h-full object-cover transition-all duration-200',
              'group-hover:scale-105 cursor-pointer',
              !isLoaded && 'invisible'
            )}
            onClick={onClick}
            onError={handleImageError}
            loading="lazy"
          />
        )}

        {/* Error State */}
        {imageError && (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Primary Badge */}
        {photo.isPrimary && (
          <Badge
            variant="default"
            className="absolute top-2 left-2 bg-yellow-500 text-black text-xs"
          >
            <Heart className="h-3 w-3 mr-1" />
            Primary
          </Badge>
        )}

        {/* Selection Checkbox */}
        {enableSelection && (
          <div className="absolute top-2 right-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onSelect}
              className="w-4 h-4 text-primary border-2 border-white rounded focus:ring-primary focus:ring-2"
              aria-label={`Select photo ${index + 1}`}
            />
          </div>
        )}

        {/* Action Buttons Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="bg-white/90 text-black hover:bg-white"
            >
              <Eye className="h-4 w-4" />
              <span className="sr-only">View photo</span>
            </Button>

            {/* Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-white/90 text-black hover:bg-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Photo actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onSetPrimary && !photo.isPrimary && (
                  <DropdownMenuItem onClick={onSetPrimary}>
                    <Heart className="h-4 w-4 mr-2" />
                    Set as Primary
                  </DropdownMenuItem>
                )}
                {onShare && (
                  <DropdownMenuItem onClick={onShare}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                )}
                {onDownload && (
                  <DropdownMenuItem onClick={onDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Photo Metadata */}
      {showMetadata && photo.metadata && viewMode === 'list' && (
        <CardContent className="flex-1 p-4 space-y-2">
          <h4 className="font-medium text-sm">
            Photo {index + 1}
            {photo.isPrimary && (
              <Badge variant="outline" className="ml-2 text-xs">
                Primary
              </Badge>
            )}
          </h4>

          <div className="space-y-1 text-xs text-muted-foreground">
            {photo.metadata.width && photo.metadata.height && (
              <div className="flex items-center gap-1">
                <Maximize2 className="h-3 w-3" />
                <span>{photo.metadata.width} × {photo.metadata.height}</span>
              </div>
            )}

            {photo.metadata.fileSize && (
              <div className="flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                <span>{formatFileSize(photo.metadata.fileSize)}</span>
              </div>
            )}

            {photo.metadata.captureDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(photo.metadata.captureDate)}</span>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}