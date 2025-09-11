'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { validateImageFile } from '@/lib/utils/file-validation';
import { uploadPhotoAction, removePhotoAction } from '@/lib/actions/photos';
import { Upload, X, AlertCircle, CheckCircle, Camera, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * PhotoUpload Component Props
 */
interface PhotoUploadProps {
  itemId?: string;
  currentPhotoUrl?: string;
  currentThumbnailUrl?: string;
  onPhotoUpload?: (photoUrl: string, thumbnailUrl: string) => void;
  onPhotoRemove?: () => void;
  disabled?: boolean;
  className?: string;
  maxFileSize?: number; // in MB
  accept?: string;
}

/**
 * Upload state interface
 */
interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
  validating: boolean;
}

/**
 * PhotoUpload - Secure photo upload component with comprehensive validation
 * 
 * Implements security measures from QA assessment SEC-003:
 * - Client-side file validation before upload
 * - Drag-and-drop with security checks
 * - Image preview with validation feedback
 * - Mobile-responsive design for inventory management
 * 
 * @component
 */
export function PhotoUpload({
  itemId,
  currentPhotoUrl,
  currentThumbnailUrl,
  onPhotoUpload,
  onPhotoRemove,
  disabled = false,
  className,
  maxFileSize = 10, // 10MB default
  accept = 'image/jpeg,image/jpg,image/png,image/webp'
}: PhotoUploadProps) {
  // State management
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: false,
    validating: false
  });
  
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reset component state
   */
  const resetState = useCallback(() => {
    setUploadState({
      uploading: false,
      progress: 0,
      error: null,
      success: false,
      validating: false
    });
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Validate file with comprehensive security checks
   */
  const validateFile = useCallback(async (file: File): Promise<boolean> => {
    setUploadState(prev => ({ ...prev, validating: true, error: null }));

    try {
      // Client-side validation using our secure validation utility
      const validationResult = await validateImageFile(file);
      
      if (!validationResult.valid) {
        setUploadState(prev => ({
          ...prev,
          validating: false,
          error: validationResult.error || 'File validation failed'
        }));
        return false;
      }

      // Additional size check against component props
      const maxSizeBytes = maxFileSize * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setUploadState(prev => ({
          ...prev,
          validating: false,
          error: `File too large. Maximum size is ${maxFileSize}MB.`
        }));
        return false;
      }

      setUploadState(prev => ({ ...prev, validating: false }));
      return true;

    } catch (error) {
      console.error('File validation error:', error);
      setUploadState(prev => ({
        ...prev,
        validating: false,
        error: 'File validation failed'
      }));
      return false;
    }
  }, [maxFileSize]);

  /**
   * Handle file selection and preview
   */
  const handleFileSelect = useCallback(async (file: File) => {
    if (disabled) return;

    // Validate the file
    const isValid = await validateFile(file);
    if (!isValid) return;

    // Create preview URL
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setSelectedFile(file);

    // Clear any previous errors
    setUploadState(prev => ({ ...prev, error: null, success: false }));
  }, [disabled, validateFile]);

  /**
   * Handle drag and drop events
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setDragActive(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // For MVP, we only support single photo per item
    const file = files[0];
    await handleFileSelect(file);
  }, [disabled, handleFileSelect]);

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await handleFileSelect(file);
  }, [handleFileSelect]);

  /**
   * Upload the selected file
   */
  const handleUpload = useCallback(async () => {
    if (!selectedFile || !itemId || disabled) return;

    setUploadState(prev => ({ ...prev, uploading: true, progress: 0, error: null }));

    try {
      // Create FormData for server action
      const formData = new FormData();
      formData.append('photo', selectedFile);

      // Simulate progress (since we can't track real progress with server actions)
      const progressInterval = setInterval(() => {
        setUploadState(prev => ({
          ...prev,
          progress: Math.min(prev.progress + Math.random() * 30, 90)
        }));
      }, 200);

      // Call server action
      const result = await uploadPhotoAction(itemId, formData);

      clearInterval(progressInterval);

      if (result.success) {
        setUploadState(prev => ({
          ...prev,
          uploading: false,
          progress: 100,
          success: true,
          error: null
        }));

        // Notify parent component
        if (onPhotoUpload && result.photoUrl && result.thumbnailUrl) {
          onPhotoUpload(result.photoUrl, result.thumbnailUrl);
        }

        // Reset after success
        setTimeout(resetState, 2000);

      } else {
        setUploadState(prev => ({
          ...prev,
          uploading: false,
          progress: 0,
          error: result.error || 'Upload failed'
        }));
      }

    } catch (error) {
      console.error('Upload error:', error);
      setUploadState(prev => ({
        ...prev,
        uploading: false,
        progress: 0,
        error: 'Upload failed. Please try again.'
      }));
    }
  }, [selectedFile, itemId, disabled, onPhotoUpload, resetState]);

  /**
   * Remove current photo
   */
  const handleRemove = useCallback(async () => {
    if (!itemId || disabled) return;

    try {
      const result = await removePhotoAction(itemId);
      
      if (result.success) {
        if (onPhotoRemove) {
          onPhotoRemove();
        }
        resetState();
      } else {
        setUploadState(prev => ({
          ...prev,
          error: result.error || 'Failed to remove photo'
        }));
      }

    } catch (error) {
      console.error('Remove photo error:', error);
      setUploadState(prev => ({
        ...prev,
        error: 'Failed to remove photo'
      }));
    }
  }, [itemId, disabled, onPhotoRemove, resetState]);

  /**
   * Clear preview and selection
   */
  const handleClear = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    resetState();
  }, [previewUrl, resetState]);

  // Determine which photo to show
  const displayPhotoUrl = previewUrl || currentThumbnailUrl;
  const hasPhoto = Boolean(displayPhotoUrl);

  return (
    <Card className={cn('w-full', className)}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Upload Area */}
          {!hasPhoto && (
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
                'hover:border-primary/50 hover:bg-accent/20',
                dragActive && 'border-primary bg-primary/10',
                disabled && 'opacity-50 cursor-not-allowed',
                uploadState.validating && 'border-yellow-500 bg-yellow-50'
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <Camera className="h-8 w-8" />
                </div>
                
                <div className="space-y-2">
                  <p className="text-lg font-medium">
                    {uploadState.validating ? 'Validating file...' : 'Drop your photo here'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP up to {maxFileSize}MB
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || uploadState.validating}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Choose Photo
                </Button>
              </div>
            </div>
          )}

          {/* Photo Preview */}
          {hasPhoto && (
            <div className="relative">
              <img
                src={displayPhotoUrl}
                alt="Photo preview"
                className="w-full h-48 object-cover rounded-lg border"
              />
              
              {/* Overlay for actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                {previewUrl && selectedFile && (
                  <Button
                    size="sm"
                    onClick={handleUpload}
                    disabled={uploadState.uploading || disabled}
                  >
                    {uploadState.uploading ? 'Uploading...' : 'Upload'}
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={previewUrl ? handleClear : handleRemove}
                  disabled={uploadState.uploading || disabled}
                >
                  <X className="h-4 w-4" />
                  Remove
                </Button>
              </div>

              {/* Upload Progress */}
              {uploadState.uploading && (
                <div className="absolute bottom-2 left-2 right-2 bg-white/90 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-2 transition-all duration-300"
                    style={{ width: `${uploadState.progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Status Messages */}
          {uploadState.error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{uploadState.error}</span>
            </div>
          )}

          {uploadState.success && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>Photo uploaded successfully!</span>
            </div>
          )}

          {/* File Info */}
          {selectedFile && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div>File: {selectedFile.name}</div>
              <div>Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleInputChange}
            className="hidden"
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}