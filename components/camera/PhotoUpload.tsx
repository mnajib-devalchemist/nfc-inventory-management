'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { validateImageFile } from '@/lib/utils/file-validation';
import { uploadPhotoAction, removePhotoAction } from '@/lib/actions/photos';
import { validateHEICFile, convertHEICToJPEG } from '@/lib/utils/heic-support';
import { validatePhotoUpload } from '@/lib/validation';
import { Upload, X, AlertCircle, CheckCircle, Camera, Image as ImageIcon, FileImage, Smartphone } from 'lucide-react';
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
  enableCamera?: boolean;
  showHEICSupport?: boolean;
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
  converting: boolean;
  conversionProgress: number;
}

/**
 * PhotoUpload - Secure photo upload component with comprehensive validation and preview.
 * 
 * Implements security measures from QA assessment SEC-003 including client-side file validation,
 * drag-and-drop with security checks, image preview with real-time feedback, and mobile-responsive
 * design optimized for inventory management workflows. Supports both desktop and mobile browsers
 * with touch-friendly interfaces.
 * 
 * @component
 * @category Media Components
 * @since 1.3.0
 * 
 * @param props - The component props
 * @param props.itemId - Unique identifier for the item (for file storage organization)
 * @param props.currentPhotoUrl - URL of existing photo (for edit mode)
 * @param props.currentThumbnailUrl - URL of existing thumbnail (for display)
 * @param props.onPhotoUpload - Callback when photo upload succeeds
 * @param props.onPhotoRemove - Callback when photo is removed
 * @param props.disabled - Whether the upload interface is disabled
 * @param props.className - Additional CSS classes for styling
 * @param props.maxFileSize - Maximum file size in MB (default: 10MB)
 * @param props.accept - Accepted file types (default: JPEG, PNG, WebP)
 * 
 * @returns The rendered photo upload component with drag-drop and preview
 * 
 * @example Basic photo upload
 * ```tsx
 * <PhotoUpload 
 *   itemId="item-123"
 *   onPhotoUpload={(photoUrl, thumbnailUrl) => {
 *     setItem(prev => ({
 *       ...prev, 
 *       photoUrl, 
 *       thumbnailUrl
 *     }));
 *   }}
 *   maxFileSize={5}
 * />
 * ```
 * 
 * @example With existing photo (edit mode)
 * ```tsx
 * <PhotoUpload 
 *   itemId={item.id}
 *   currentPhotoUrl={item.photoUrl}
 *   currentThumbnailUrl={item.thumbnailUrl}
 *   onPhotoRemove={() => updateItem({ photoUrl: null })}
 *   disabled={isSubmitting}
 * />
 * ```
 */
export function PhotoUpload({
  itemId,
  currentPhotoUrl,
  currentThumbnailUrl,
  onPhotoUpload,
  onPhotoRemove,
  disabled = false,
  className,
  maxFileSize = 50, // 50MB default to accommodate HEIC
  accept = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif',
  enableCamera = true,
  showHEICSupport = true
}: PhotoUploadProps) {
  // State management
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: false,
    validating: false,
    converting: false,
    conversionProgress: 0
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
      validating: false,
      converting: false,
      conversionProgress: 0
    });
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Enhanced file validation with HEIC support
   */
  const validateFile = useCallback(async (file: File): Promise<{
    valid: boolean;
    needsConversion: boolean;
    originalFile: File;
    processedFile?: File;
  }> => {
    setUploadState(prev => ({ ...prev, validating: true, error: null }));

    try {
      // Use enhanced validation with HEIC support
      const validationResult = validatePhotoUpload(file);

      if (!validationResult.valid) {
        setUploadState(prev => ({
          ...prev,
          validating: false,
          error: validationResult.error || 'File validation failed'
        }));
        return { valid: false, needsConversion: false, originalFile: file };
      }

      // Check if HEIC conversion is needed
      if (validationResult.format === 'heic' && validationResult.requiresConversion) {
        console.log('📸 HEIC file detected, conversion required');

        // Validate HEIC file specifically
        const heicValidation = await validateHEICFile(file);

        if (!heicValidation.isValid) {
          setUploadState(prev => ({
            ...prev,
            validating: false,
            error: `HEIC validation failed: ${heicValidation.error}`
          }));
          return { valid: false, needsConversion: false, originalFile: file };
        }

        if (heicValidation.conversionNeeded) {
          setUploadState(prev => ({
            ...prev,
            validating: false,
            converting: true,
            conversionProgress: 0
          }));

          // Convert HEIC to JPEG
          const conversionResult = await convertHEICToJPEG(file, 0.85);

          if (!conversionResult.success || !conversionResult.convertedBlob) {
            setUploadState(prev => ({
              ...prev,
              converting: false,
              error: `HEIC conversion failed: ${conversionResult.error}`
            }));
            return { valid: false, needsConversion: false, originalFile: file };
          }

          // Create a new File object from the converted blob
          const convertedFile = new File(
            [conversionResult.convertedBlob],
            file.name.replace(/\.(heic|heif)$/i, '.jpg'),
            { type: 'image/jpeg' }
          );

          setUploadState(prev => ({
            ...prev,
            converting: false,
            conversionProgress: 100
          }));

          console.log('✅ HEIC conversion successful', {
            originalSize: `${(file.size / 1024).toFixed(1)}KB`,
            convertedSize: `${(convertedFile.size / 1024).toFixed(1)}KB`,
            compressionRatio: conversionResult.compressionRatio.toFixed(2)
          });

          return {
            valid: true,
            needsConversion: true,
            originalFile: file,
            processedFile: convertedFile
          };
        }
      }

      setUploadState(prev => ({ ...prev, validating: false }));
      return { valid: true, needsConversion: false, originalFile: file };

    } catch (error) {
      console.error('❌ File validation error:', error);
      setUploadState(prev => ({
        ...prev,
        validating: false,
        converting: false,
        error: 'File validation failed'
      }));
      return { valid: false, needsConversion: false, originalFile: file };
    }
  }, [maxFileSize]);

  /**
   * Handle file selection and preview
   */
  const handleFileSelect = useCallback(async (file: File) => {
    if (disabled) return;

    // Validate the file (with HEIC conversion if needed)
    const validationResult = await validateFile(file);
    if (!validationResult.valid) return;

    // Use processed file if conversion occurred, otherwise use original
    const fileToUse = validationResult.processedFile || validationResult.originalFile;

    // Create preview URL
    const preview = URL.createObjectURL(fileToUse);
    setPreviewUrl(preview);
    setSelectedFile(fileToUse);

    // Clear any previous errors
    setUploadState(prev => ({ ...prev, error: null, success: false }));

    // Log conversion info if applicable
    if (validationResult.needsConversion) {
      console.log('📸 File converted for upload:', {
        original: file.name,
        converted: fileToUse.name,
        originalSize: `${(file.size / 1024).toFixed(1)}KB`,
        convertedSize: `${(fileToUse.size / 1024).toFixed(1)}KB`
      });
    }
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
                    {uploadState.validating ? 'Validating file...' :
                     uploadState.converting ? 'Converting HEIC...' :
                     'Drop your photo here'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP{showHEICSupport ? ', HEIC' : ''} up to {maxFileSize}MB
                  </p>
                  {showHEICSupport && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      <Smartphone className="h-3 w-3 inline mr-1" />
                      HEIC files from iPhone will be automatically converted
                    </p>
                  )}
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
              {(uploadState.uploading || uploadState.converting) && (
                <div className="absolute bottom-2 left-2 right-2 bg-white/90 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-2 transition-all duration-300",
                      uploadState.converting ? "bg-blue-500" : "bg-primary"
                    )}
                    style={{
                      width: `${uploadState.converting ? uploadState.conversionProgress : uploadState.progress}%`
                    }}
                  />
                </div>
              )}

              {/* Conversion Status */}
              {uploadState.converting && (
                <div className="absolute top-2 left-2 right-2">
                  <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full text-center">
                    <FileImage className="h-3 w-3 inline mr-1" />
                    Converting HEIC...
                  </div>
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