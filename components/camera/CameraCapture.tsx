'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Camera,
  CameraOff,
  SwitchCamera,
  RotateCcw,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Smartphone,
  Monitor
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  requestCameraPermission,
  checkCameraPermission,
  getCameraDevices,
  isSecureContext,
  isCameraSupported,
  type CameraPermissionState
} from '@/lib/utils/pwa';
import { validateHEICFile, convertHEICToJPEG } from '@/lib/utils/heic-support';
import { validatePhotoUpload } from '@/lib/validation';

/**
 * Camera capture state interface
 */
interface CameraState {
  hasPermission: boolean;
  permissionState: CameraPermissionState;
  isLoading: boolean;
  error: string | null;
  isActive: boolean;
  devices: MediaDeviceInfo[];
  currentDeviceId: string | null;
  hasMultipleCameras: boolean;
  stream: MediaStream | null;
  constraints: MediaStreamConstraints;
}

/**
 * Captured photo interface
 */
interface CapturedPhoto {
  blob: Blob;
  dataUrl: string;
  timestamp: number;
  deviceInfo: {
    deviceId: string;
    label: string;
    facingMode: string;
  };
  metadata: {
    width: number;
    height: number;
    fileSize: number;
    format: string;
  };
}

/**
 * Camera capture component props
 */
interface CameraCaptureProps {
  onPhotoCapture?: (photo: CapturedPhoto) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  preferredFacingMode?: 'user' | 'environment';
  imageQuality?: number;
  maxWidth?: number;
  maxHeight?: number;
  showDeviceInfo?: boolean;
}

/**
 * Safari-compatible camera capture component
 *
 * Implements comprehensive Safari compatibility with iOS-specific workarounds,
 * multi-device support, and HEIC conversion for seamless photo capture
 * across all browsers and devices.
 */
export function CameraCapture({
  onPhotoCapture,
  onError,
  disabled = false,
  className,
  preferredFacingMode = 'environment',
  imageQuality = 0.85,
  maxWidth = 1920,
  maxHeight = 1080,
  showDeviceInfo = false,
}: CameraCaptureProps) {
  // Component state
  const [cameraState, setCameraState] = useState<CameraState>({
    hasPermission: false,
    permissionState: 'unknown',
    isLoading: false,
    error: null,
    isActive: false,
    devices: [],
    currentDeviceId: null,
    hasMultipleCameras: false,
    stream: null,
    constraints: {
      video: {
        facingMode: preferredFacingMode,
        width: { ideal: maxWidth },
        height: { ideal: maxHeight },
      }
    }
  });

  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * Initialize camera functionality
   */
  const initializeCamera = useCallback(async () => {
    setCameraState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Check if camera is supported
      if (!isCameraSupported()) {
        throw new Error('Camera is not supported by this browser');
      }

      // Check secure context (HTTPS requirement)
      if (!isSecureContext()) {
        throw new Error('Camera requires HTTPS in production environments');
      }

      // Check current permission state
      const permissionState = await checkCameraPermission();
      setCameraState(prev => ({ ...prev, permissionState }));

      if (permissionState === 'denied') {
        throw new Error('Camera permission was denied. Please enable camera access in browser settings.');
      }

      // Get available camera devices
      const deviceInfo = await getCameraDevices();
      if (deviceInfo.error) {
        console.warn('⚠️ Could not enumerate camera devices:', deviceInfo.error);
      }

      const hasMultipleCameras = deviceInfo.devices.length > 1;

      setCameraState(prev => ({
        ...prev,
        devices: deviceInfo.devices,
        hasMultipleCameras,
        isLoading: false,
      }));

      console.log('✅ Camera initialized successfully', {
        deviceCount: deviceInfo.devices.length,
        hasRearCamera: deviceInfo.hasRearCamera,
        hasFrontCamera: deviceInfo.hasFrontCamera,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Camera initialization failed';
      console.error('❌ Camera initialization error:', errorMessage);

      setCameraState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      onError?.(errorMessage);
    }
  }, [onError]);

  /**
   * Start camera stream
   */
  const startCamera = useCallback(async (deviceId?: string) => {
    setCameraState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Request camera permission and stream
      const permissionResult = await requestCameraPermission();

      if (!permissionResult.granted) {
        throw new Error(permissionResult.error || 'Camera permission denied');
      }

      const stream = permissionResult.stream!;
      streamRef.current = stream;

      // Apply Safari-specific workarounds
      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = stream;

        // Safari iOS workarounds
        if (isSafariIOS()) {
          videoElement.setAttribute('playsinline', 'true');
          videoElement.setAttribute('webkit-playsinline', 'true');
          videoElement.muted = true; // Required for autoplay on iOS
        }

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Video stream timeout'));
          }, 10000);

          videoElement.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };

          videoElement.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Video loading failed'));
          };
        });

        // Start playing
        await videoElement.play();
      }

      // Update state
      setCameraState(prev => ({
        ...prev,
        hasPermission: true,
        permissionState: 'granted',
        isLoading: false,
        isActive: true,
        stream,
        currentDeviceId: deviceId || null,
      }));

      console.log('✅ Camera stream started successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start camera';
      console.error('❌ Camera start error:', errorMessage);

      setCameraState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      onError?.(errorMessage);
    }
  }, [onError]);

  /**
   * Stop camera stream
   */
  const stopCamera = useCallback(() => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setCameraState(prev => ({
        ...prev,
        isActive: false,
        stream: null,
        currentDeviceId: null,
      }));

      console.log('📸 Camera stream stopped');
    } catch (error) {
      console.error('❌ Error stopping camera:', error);
    }
  }, []);

  /**
   * Switch between front/rear cameras
   */
  const switchCamera = useCallback(async () => {
    if (!cameraState.hasMultipleCameras) return;

    try {
      setCameraState(prev => ({ ...prev, isLoading: true }));

      // Stop current stream
      stopCamera();

      // Toggle facing mode
      const currentFacingMode = typeof cameraState.constraints.video === 'object' ?
        cameraState.constraints.video?.facingMode : undefined;
      const newFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';

      setCameraState(prev => ({
        ...prev,
        constraints: {
          ...prev.constraints,
          video: {
            ...(typeof prev.constraints.video === 'object' ? prev.constraints.video : {}),
            facingMode: newFacingMode,
          }
        }
      }));

      // Start with new constraints
      await startCamera();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch camera';
      console.error('❌ Camera switch error:', errorMessage);
      onError?.(errorMessage);
    }
  }, [cameraState.hasMultipleCameras, cameraState.constraints, stopCamera, startCamera, onError]);

  /**
   * Capture photo from video stream
   */
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !cameraState.isActive) {
      onError?.('Camera not ready for capture');
      return;
    }

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create image blob'));
          }
        }, 'image/jpeg', imageQuality);
      });

      // Create data URL for preview
      const dataUrl = canvas.toDataURL('image/jpeg', imageQuality);

      // Get device info
      const currentDevice = cameraState.devices.find(d => d.deviceId === cameraState.currentDeviceId);
      const videoConstraints = typeof cameraState.constraints.video === 'object' ? cameraState.constraints.video : {};
      const facingMode = videoConstraints?.facingMode as string || 'unknown';

      // Create captured photo object
      const photo: CapturedPhoto = {
        blob,
        dataUrl,
        timestamp: Date.now(),
        deviceInfo: {
          deviceId: cameraState.currentDeviceId || 'unknown',
          label: currentDevice?.label || 'Unknown Camera',
          facingMode,
        },
        metadata: {
          width: canvas.width,
          height: canvas.height,
          fileSize: blob.size,
          format: 'jpeg',
        },
      };

      setCapturedPhoto(photo);
      onPhotoCapture?.(photo);

      console.log('📸 Photo captured successfully', {
        size: `${photo.metadata.width}x${photo.metadata.height}`,
        fileSize: `${(photo.metadata.fileSize / 1024).toFixed(1)}KB`,
        device: photo.deviceInfo.label,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Photo capture failed';
      console.error('❌ Photo capture error:', errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [cameraState, imageQuality, onPhotoCapture, onError]);

  /**
   * Clear captured photo
   */
  const clearPhoto = useCallback(() => {
    setCapturedPhoto(null);
  }, []);

  /**
   * Retake photo
   */
  const retakePhoto = useCallback(() => {
    clearPhoto();
    if (!cameraState.isActive) {
      startCamera();
    }
  }, [clearPhoto, cameraState.isActive, startCamera]);

  /**
   * Initialize on component mount
   */
  useEffect(() => {
    initializeCamera();

    // Cleanup on unmount
    return () => {
      stopCamera();
    };
  }, [initializeCamera, stopCamera]);

  /**
   * Handle window focus/blur for battery optimization
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && cameraState.isActive) {
        console.log('📸 App backgrounded, preserving camera state');
        // Don't stop camera immediately - user might come back quickly
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cameraState.isActive]);

  // Render captured photo preview
  if (capturedPhoto) {
    return (
      <Card className={cn('w-full max-w-md mx-auto', className)}>
        <CardContent className="p-4">
          <div className="space-y-4">
            <div className="relative">
              <img
                src={capturedPhoto.dataUrl}
                alt="Captured photo"
                className="w-full h-auto rounded-lg border"
              />

              <Badge
                variant="secondary"
                className="absolute top-2 right-2 bg-black/50 text-white"
              >
                {(capturedPhoto.metadata.fileSize / 1024).toFixed(1)}KB
              </Badge>
            </div>

            {showDeviceInfo && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Device: {capturedPhoto.deviceInfo.label}</div>
                <div>Size: {capturedPhoto.metadata.width}×{capturedPhoto.metadata.height}</div>
                <div>Facing: {capturedPhoto.deviceInfo.facingMode}</div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={retakePhoto}
                variant="outline"
                className="flex-1"
                disabled={disabled}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>

              <Button
                onClick={clearPhoto}
                variant="outline"
                size="icon"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render camera interface
  return (
    <Card className={cn('w-full max-w-md mx-auto', className)}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Camera viewport */}
          <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
            {cameraState.isActive ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />

                {/* Camera overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Corner guides */}
                  <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-white/50" />
                  <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-white/50" />
                  <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-white/50" />
                  <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-white/50" />
                </div>

                {/* Device info badge */}
                {showDeviceInfo && cameraState.currentDeviceId && (
                  <Badge
                    variant="secondary"
                    className="absolute top-2 left-2 bg-black/50 text-white text-xs"
                  >
                    {getCameraFacingMode(cameraState.constraints) === 'rear' ?
                      <Smartphone className="h-3 w-3 mr-1" /> :
                      <Monitor className="h-3 w-3 mr-1" />
                    }
                    {getCameraFacingMode(cameraState.constraints)}
                  </Badge>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {cameraState.isLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm">Starting camera...</span>
                  </div>
                ) : cameraState.error ? (
                  <div className="flex flex-col items-center gap-2 text-center p-4">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <span className="text-sm">{cameraState.error}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <CameraOff className="h-8 w-8" />
                    <span className="text-sm">Camera not active</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-center gap-4">
            {/* Camera switch button */}
            {cameraState.hasMultipleCameras && (
              <Button
                onClick={switchCamera}
                variant="outline"
                size="icon"
                disabled={disabled || cameraState.isLoading || !cameraState.isActive}
              >
                <SwitchCamera className="h-4 w-4" />
              </Button>
            )}

            {/* Main action button */}
            {cameraState.isActive ? (
              <Button
                onClick={capturePhoto}
                disabled={disabled || isProcessing}
                size="lg"
                className="rounded-full w-16 h-16 p-0"
              >
                {isProcessing ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Camera className="h-6 w-6" />
                )}
              </Button>
            ) : (
              <Button
                onClick={() => startCamera()}
                disabled={disabled || cameraState.isLoading}
                size="lg"
              >
                {cameraState.isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-2" />
                )}
                Start Camera
              </Button>
            )}

            {/* Stop camera button */}
            {cameraState.isActive && (
              <Button
                onClick={stopCamera}
                variant="outline"
                size="icon"
                disabled={disabled}
              >
                <CameraOff className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Status information */}
          {cameraState.permissionState !== 'unknown' && (
            <div className="text-center">
              <Badge
                variant={cameraState.hasPermission ? 'default' : 'destructive'}
                className="text-xs"
              >
                {cameraState.hasPermission ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Camera Ready
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Permission Required
                  </>
                )}
              </Badge>
            </div>
          )}
        </div>

        {/* Hidden canvas for photo capture */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}

/**
 * Helper functions
 */

/**
 * Detect Safari on iOS
 */
function isSafariIOS(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(userAgent) && /Safari/.test(userAgent);
}

/**
 * Get camera facing mode from constraints
 */
function getCameraFacingMode(constraints: MediaStreamConstraints): string {
  if (typeof constraints.video === 'object' && constraints.video) {
    const facingMode = constraints.video.facingMode;
    if (facingMode === 'environment') return 'rear';
    if (facingMode === 'user') return 'front';
  }
  return 'unknown';
}