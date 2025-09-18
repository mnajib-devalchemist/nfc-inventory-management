'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { resourceCleanup, MemoryMonitor } from '@/lib/utils/memory-management';

/**
 * Photo interface for gallery display
 */
export interface GalleryPhoto {
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
  alt?: string;
}

/**
 * Gallery navigation state
 */
export interface GalleryState {
  photos: GalleryPhoto[];
  currentIndex: number;
  isLightboxOpen: boolean;
  isZoomed: boolean;
  zoomLevel: number;
  selectedPhotos: Set<string>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Virtual scrolling configuration
 */
interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
}

/**
 * Photo gallery management hook with performance optimizations
 *
 * Implements virtual scrolling for large photo sets, memory-efficient loading,
 * zoom functionality with gesture support, and accessibility features.
 *
 * @param photos - Array of photos to display
 * @param options - Gallery configuration options
 */
export function usePhotoGallery(
  photos: GalleryPhoto[],
  options: {
    enableVirtualScrolling?: boolean;
    virtualScrollConfig?: Partial<VirtualScrollConfig>;
    enableZoom?: boolean;
    maxZoomLevel?: number;
    enableSelection?: boolean;
    lazyLoadThreshold?: number;
  } = {}
) {
  const {
    enableVirtualScrolling = true,
    virtualScrollConfig = {},
    enableZoom = true,
    maxZoomLevel = 5,
    enableSelection = false,
    lazyLoadThreshold = 3
  } = options;

  // State management
  const [state, setState] = useState<GalleryState>({
    photos,
    currentIndex: 0,
    isLightboxOpen: false,
    isZoomed: false,
    zoomLevel: 1,
    selectedPhotos: new Set(),
    isLoading: false,
    error: null,
  });

  // Refs for DOM elements and cleanup
  const galleryRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const loadedImages = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const memoryMonitor = useRef<MemoryMonitor>(MemoryMonitor.getInstance());

  // Virtual scrolling configuration
  const virtualConfig: VirtualScrollConfig = {
    itemHeight: 200,
    containerHeight: 600,
    overscan: 5,
    ...virtualScrollConfig
  };

  /**
   * Update photos when prop changes
   */
  useEffect(() => {
    setState(prev => ({
      ...prev,
      photos,
      currentIndex: Math.min(prev.currentIndex, photos.length - 1)
    }));
  }, [photos]);

  /**
   * Set up intersection observer for lazy loading
   */
  useEffect(() => {
    if (!enableVirtualScrolling) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const photoId = entry.target.getAttribute('data-photo-id');
            if (photoId && !loadedImages.current.has(photoId)) {
              loadedImages.current.add(photoId);
              // Trigger image load
              const img = entry.target.querySelector('img') as HTMLImageElement;
              if (img && img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
              }
            }
          }
        });
      },
      {
        rootMargin: `${lazyLoadThreshold * virtualConfig.itemHeight}px`,
        threshold: 0.1
      }
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, [enableVirtualScrolling, lazyLoadThreshold, virtualConfig.itemHeight]);

  /**
   * Memory cleanup on unmount
   */
  useEffect(() => {
    const currentResourceId = `photo-gallery-${Date.now()}`;

    // Register cleanup for this gallery instance
    resourceCleanup.register(currentResourceId, () => {
      // Clean up loaded images
      loadedImages.current.clear();

      // Disconnect observer
      observerRef.current?.disconnect();

      // Clean up any blob URLs
      state.photos.forEach(photo => {
        if (photo.originalUrl.startsWith('blob:')) {
          URL.revokeObjectURL(photo.originalUrl);
        }
        if (photo.thumbnailUrl.startsWith('blob:')) {
          URL.revokeObjectURL(photo.thumbnailUrl);
        }
      });
    });

    return () => {
      resourceCleanup.cleanup(currentResourceId);
    };
  }, [state.photos]);

  /**
   * Calculate visible items for virtual scrolling
   */
  const getVisibleRange = useCallback((scrollTop: number = 0): { start: number; end: number } => {
    if (!enableVirtualScrolling) {
      return { start: 0, end: state.photos.length };
    }

    const start = Math.max(0, Math.floor(scrollTop / virtualConfig.itemHeight) - virtualConfig.overscan);
    const end = Math.min(
      state.photos.length,
      Math.ceil((scrollTop + virtualConfig.containerHeight) / virtualConfig.itemHeight) + virtualConfig.overscan
    );

    return { start, end };
  }, [enableVirtualScrolling, state.photos.length, virtualConfig]);

  /**
   * Open lightbox at specific photo
   */
  const openLightbox = useCallback((index: number) => {
    if (index < 0 || index >= state.photos.length) return;

    setState(prev => ({
      ...prev,
      currentIndex: index,
      isLightboxOpen: true,
      isZoomed: false,
      zoomLevel: 1
    }));

    // Preload adjacent photos
    preloadAdjacentPhotos(index);
  }, [state.photos.length]);

  /**
   * Close lightbox
   */
  const closeLightbox = useCallback(() => {
    setState(prev => ({
      ...prev,
      isLightboxOpen: false,
      isZoomed: false,
      zoomLevel: 1
    }));
  }, []);

  /**
   * Navigate to next photo
   */
  const nextPhoto = useCallback(() => {
    setState(prev => {
      const nextIndex = (prev.currentIndex + 1) % prev.photos.length;
      preloadAdjacentPhotos(nextIndex);
      return {
        ...prev,
        currentIndex: nextIndex,
        isZoomed: false,
        zoomLevel: 1
      };
    });
  }, []);

  /**
   * Navigate to previous photo
   */
  const prevPhoto = useCallback(() => {
    setState(prev => {
      const prevIndex = prev.currentIndex === 0 ? prev.photos.length - 1 : prev.currentIndex - 1;
      preloadAdjacentPhotos(prevIndex);
      return {
        ...prev,
        currentIndex: prevIndex,
        isZoomed: false,
        zoomLevel: 1
      };
    });
  }, []);

  /**
   * Toggle zoom
   */
  const toggleZoom = useCallback(() => {
    if (!enableZoom) return;

    setState(prev => ({
      ...prev,
      isZoomed: !prev.isZoomed,
      zoomLevel: prev.isZoomed ? 1 : 2
    }));
  }, [enableZoom]);

  /**
   * Set specific zoom level
   */
  const setZoom = useCallback((level: number) => {
    if (!enableZoom) return;

    const clampedLevel = Math.max(1, Math.min(maxZoomLevel, level));
    setState(prev => ({
      ...prev,
      isZoomed: clampedLevel > 1,
      zoomLevel: clampedLevel
    }));
  }, [enableZoom, maxZoomLevel]);

  /**
   * Toggle photo selection
   */
  const toggleSelection = useCallback((photoId: string) => {
    if (!enableSelection) return;

    setState(prev => {
      const newSelected = new Set(prev.selectedPhotos);
      if (newSelected.has(photoId)) {
        newSelected.delete(photoId);
      } else {
        newSelected.add(photoId);
      }
      return {
        ...prev,
        selectedPhotos: newSelected
      };
    });
  }, [enableSelection]);

  /**
   * Select all photos
   */
  const selectAll = useCallback(() => {
    if (!enableSelection) return;

    setState(prev => ({
      ...prev,
      selectedPhotos: new Set(prev.photos.map(p => p.id))
    }));
  }, [enableSelection]);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    if (!enableSelection) return;

    setState(prev => ({
      ...prev,
      selectedPhotos: new Set()
    }));
  }, [enableSelection]);

  /**
   * Preload adjacent photos for smooth navigation
   */
  const preloadAdjacentPhotos = useCallback((centerIndex: number) => {
    const indicesToPreload = [
      centerIndex - 1,
      centerIndex + 1
    ].filter(index => index >= 0 && index < state.photos.length);

    indicesToPreload.forEach(index => {
      const photo = state.photos[index];
      if (photo && !loadedImages.current.has(photo.id)) {
        const img = new Image();
        img.onload = () => {
          loadedImages.current.add(photo.id);
        };
        img.onerror = () => {
          console.warn(`Failed to preload image: ${photo.id}`);
        };
        img.src = photo.originalUrl;
      }
    });
  }, [state.photos]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!state.isLightboxOpen) return;

    switch (event.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        prevPhoto();
        break;
      case 'ArrowRight':
        nextPhoto();
        break;
      case ' ':
      case 'Enter':
        toggleZoom();
        event.preventDefault();
        break;
      case '+':
      case '=':
        setZoom(state.zoomLevel + 0.5);
        event.preventDefault();
        break;
      case '-':
        setZoom(state.zoomLevel - 0.5);
        event.preventDefault();
        break;
    }
  }, [state.isLightboxOpen, state.zoomLevel, closeLightbox, prevPhoto, nextPhoto, toggleZoom, setZoom]);

  /**
   * Set up keyboard event listeners
   */
  useEffect(() => {
    if (state.isLightboxOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [state.isLightboxOpen, handleKeyDown]);

  /**
   * Handle touch gestures for mobile
   */
  const handleTouchGestures = useCallback(() => {
    // TODO: Implement touch gesture handling for mobile zoom and navigation
    // This would include pinch-to-zoom, swipe navigation, etc.
  }, []);

  /**
   * Get current photo
   */
  const currentPhoto = state.photos[state.currentIndex] || null;

  /**
   * Check if photo is loaded
   */
  const isPhotoLoaded = useCallback((photoId: string) => {
    return loadedImages.current.has(photoId);
  }, []);

  /**
   * Get memory usage statistics
   */
  const getMemoryStats = useCallback(() => {
    return memoryMonitor.current.getCurrentMemoryStats();
  }, []);

  return {
    // State
    ...state,
    currentPhoto,

    // Navigation
    openLightbox,
    closeLightbox,
    nextPhoto,
    prevPhoto,

    // Zoom
    toggleZoom,
    setZoom,

    // Selection
    toggleSelection,
    selectAll,
    clearSelection,

    // Virtual scrolling
    getVisibleRange,
    isPhotoLoaded,

    // Refs
    galleryRef,
    lightboxRef,

    // Performance
    getMemoryStats,
    preloadAdjacentPhotos,

    // Utilities
    virtualConfig,
  };
}

/**
 * Hook for photo zoom with gesture support
 */
export function usePhotoZoom(
  imageRef: React.RefObject<HTMLImageElement>,
  options: {
    maxZoom?: number;
    enablePinchZoom?: boolean;
    enableDoubleClickZoom?: boolean;
  } = {}
) {
  const {
    maxZoom = 5,
    enablePinchZoom = true,
    enableDoubleClickZoom = true
  } = options;

  const [zoomState, setZoomState] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
    isZooming: false
  });

  const lastTouchDistance = useRef<number>(0);
  const lastTouchCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /**
   * Calculate distance between two touch points
   */
  const getTouchDistance = useCallback((touches: TouchList) => {
    if (touches.length < 2) return 0;

    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  /**
   * Calculate center point between two touches
   */
  const getTouchCenter = useCallback((touches: TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };

    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }, []);

  /**
   * Handle touch start
   */
  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (!enablePinchZoom || event.touches.length !== 2) return;

    event.preventDefault();
    lastTouchDistance.current = getTouchDistance(event.touches);
    lastTouchCenter.current = getTouchCenter(event.touches);

    setZoomState(prev => ({ ...prev, isZooming: true }));
  }, [enablePinchZoom, getTouchDistance, getTouchCenter]);

  /**
   * Handle touch move
   */
  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (!enablePinchZoom || event.touches.length !== 2 || lastTouchDistance.current === 0) return;

    event.preventDefault();

    const currentDistance = getTouchDistance(event.touches);
    const currentCenter = getTouchCenter(event.touches);

    const scaleDelta = currentDistance / lastTouchDistance.current;
    const newScale = Math.max(1, Math.min(maxZoom, zoomState.scale * scaleDelta));

    // Calculate translation to keep zoom centered
    const deltaX = currentCenter.x - lastTouchCenter.current.x;
    const deltaY = currentCenter.y - lastTouchCenter.current.y;

    setZoomState(prev => ({
      ...prev,
      scale: newScale,
      translateX: prev.translateX + deltaX,
      translateY: prev.translateY + deltaY
    }));

    lastTouchDistance.current = currentDistance;
    lastTouchCenter.current = currentCenter;
  }, [enablePinchZoom, maxZoom, zoomState.scale, getTouchDistance, getTouchCenter]);

  /**
   * Handle touch end
   */
  const handleTouchEnd = useCallback(() => {
    if (!enablePinchZoom) return;

    lastTouchDistance.current = 0;
    setZoomState(prev => ({ ...prev, isZooming: false }));
  }, [enablePinchZoom]);

  /**
   * Handle double click zoom
   */
  const handleDoubleClick = useCallback((event: MouseEvent) => {
    if (!enableDoubleClickZoom) return;

    event.preventDefault();

    const newScale = zoomState.scale > 1 ? 1 : 2;

    setZoomState(prev => ({
      ...prev,
      scale: newScale,
      translateX: newScale === 1 ? 0 : prev.translateX,
      translateY: newScale === 1 ? 0 : prev.translateY
    }));
  }, [enableDoubleClickZoom, zoomState.scale]);

  /**
   * Reset zoom
   */
  const resetZoom = useCallback(() => {
    setZoomState({
      scale: 1,
      translateX: 0,
      translateY: 0,
      isZooming: false
    });
  }, []);

  /**
   * Set up event listeners
   */
  useEffect(() => {
    const element = imageRef.current;
    if (!element) return;

    if (enablePinchZoom) {
      element.addEventListener('touchstart', handleTouchStart, { passive: false });
      element.addEventListener('touchmove', handleTouchMove, { passive: false });
      element.addEventListener('touchend', handleTouchEnd);
    }

    if (enableDoubleClickZoom) {
      element.addEventListener('dblclick', handleDoubleClick);
    }

    return () => {
      if (element) {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchmove', handleTouchMove);
        element.removeEventListener('touchend', handleTouchEnd);
        element.removeEventListener('dblclick', handleDoubleClick);
      }
    };
  }, [imageRef, enablePinchZoom, enableDoubleClickZoom, handleTouchStart, handleTouchMove, handleTouchEnd, handleDoubleClick]);

  return {
    zoomState,
    resetZoom,
    transform: `scale(${zoomState.scale}) translate(${zoomState.translateX}px, ${zoomState.translateY}px)`,
  };
}