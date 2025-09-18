'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  requestCameraPermission,
  checkCameraPermission,
  getCameraDevices,
  isSecureContext,
  isCameraSupported,
  type CameraPermissionState
} from '@/lib/utils/pwa';

/**
 * Camera hook state interface
 */
export interface CameraState {
  hasPermission: boolean;
  permissionState: CameraPermissionState;
  isSupported: boolean;
  isSecure: boolean;
  isActive: boolean;
  isLoading: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  currentDeviceId: string | null;
  hasMultipleCameras: boolean;
  stream: MediaStream | null;
}

/**
 * Camera hook return interface
 */
export interface UseCameraReturn {
  state: CameraState;
  actions: {
    initialize: () => Promise<void>;
    requestPermission: () => Promise<boolean>;
    startCamera: (deviceId?: string) => Promise<MediaStream | null>;
    stopCamera: () => void;
    switchCamera: () => Promise<void>;
    capturePhoto: (videoElement: HTMLVideoElement, quality?: number) => Promise<Blob>;
  };
}

/**
 * Custom hook for camera functionality
 * Provides comprehensive camera management with Safari compatibility
 */
export function useCamera(): UseCameraReturn {
  const [state, setState] = useState<CameraState>({
    hasPermission: false,
    permissionState: 'unknown',
    isSupported: isCameraSupported(),
    isSecure: isSecureContext(),
    isActive: false,
    isLoading: false,
    error: null,
    devices: [],
    currentDeviceId: null,
    hasMultipleCameras: false,
    stream: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const currentConstraintsRef = useRef<MediaStreamConstraints>({
    video: {
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });

  /**
   * Initialize camera functionality
   */
  const initialize = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Check basic support
      if (!state.isSupported) {
        throw new Error('Camera is not supported by this browser');
      }

      if (!state.isSecure) {
        throw new Error('Camera requires HTTPS in production environments');
      }

      // Check permission state
      const permissionState = await checkCameraPermission();

      // Get available devices
      const deviceInfo = await getCameraDevices();
      const hasMultipleCameras = deviceInfo.devices.length > 1;

      setState(prev => ({
        ...prev,
        permissionState,
        hasPermission: permissionState === 'granted',
        devices: deviceInfo.devices,
        hasMultipleCameras,
        isLoading: false,
        error: deviceInfo.error || null,
      }));

      console.log('📸 Camera initialized:', {
        permission: permissionState,
        deviceCount: deviceInfo.devices.length,
        hasMultiple: hasMultipleCameras,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Camera initialization failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      console.error('❌ Camera initialization error:', errorMessage);
    }
  }, [state.isSupported, state.isSecure]);

  /**
   * Request camera permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await requestCameraPermission();

      setState(prev => ({
        ...prev,
        hasPermission: result.granted,
        permissionState: result.granted ? 'granted' : 'denied',
        isLoading: false,
        error: result.error || null,
      }));

      if (result.stream) {
        // Clean up the permission test stream
        result.stream.getTracks().forEach(track => track.stop());
      }

      return result.granted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Permission request failed';
      setState(prev => ({
        ...prev,
        hasPermission: false,
        permissionState: 'denied',
        isLoading: false,
        error: errorMessage,
      }));
      return false;
    }
  }, []);

  /**
   * Start camera with specific device
   */
  const startCamera = useCallback(async (deviceId?: string): Promise<MediaStream | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Ensure we have permission
      if (!state.hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          throw new Error('Camera permission is required');
        }
      }

      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Prepare constraints
      const currentVideo = currentConstraintsRef.current.video;
      const videoConstraints = typeof currentVideo === 'object' ? currentVideo : {};

      const constraints: MediaStreamConstraints = {
        ...currentConstraintsRef.current,
        video: {
          ...videoConstraints,
          ...(deviceId && { deviceId: { exact: deviceId } }),
        },
      };

      // Request new stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      setState(prev => ({
        ...prev,
        isActive: true,
        isLoading: false,
        stream,
        currentDeviceId: deviceId || null,
      }));

      console.log('✅ Camera started:', {
        deviceId: deviceId || 'default',
        constraints,
      });

      return stream;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start camera';
      setState(prev => ({
        ...prev,
        isActive: false,
        isLoading: false,
        error: errorMessage,
        stream: null,
      }));
      console.error('❌ Camera start error:', errorMessage);
      return null;
    }
  }, [state.hasPermission, requestPermission]);

  /**
   * Stop camera
   */
  const stopCamera = useCallback(() => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }

      setState(prev => ({
        ...prev,
        isActive: false,
        stream: null,
        currentDeviceId: null,
      }));

      console.log('📸 Camera stopped');
    } catch (error) {
      console.error('❌ Error stopping camera:', error);
    }
  }, []);

  /**
   * Switch between front/rear cameras
   */
  const switchCamera = useCallback(async () => {
    if (!state.hasMultipleCameras) return;

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Toggle facing mode
      const currentVideo = currentConstraintsRef.current.video;
      const currentFacingMode = typeof currentVideo === 'object' && currentVideo ?
        currentVideo.facingMode : undefined;
      const newFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';

      const videoConstraints = typeof currentVideo === 'object' ? currentVideo : {};

      currentConstraintsRef.current = {
        ...currentConstraintsRef.current,
        video: {
          ...videoConstraints,
          facingMode: newFacingMode,
        },
      };

      // Restart with new constraints
      await startCamera();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch camera';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      console.error('❌ Camera switch error:', errorMessage);
    }
  }, [state.hasMultipleCameras, startCamera]);

  /**
   * Capture photo from video element
   */
  const capturePhoto = useCallback(async (
    videoElement: HTMLVideoElement,
    quality: number = 0.85
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Set canvas size to match video
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        // Draw video frame to canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create image blob'));
          }
        }, 'image/jpeg', quality);
      } catch (error) {
        reject(error);
      }
    });
  }, []);

  /**
   * Clean up on unmount
   */
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    state,
    actions: {
      initialize,
      requestPermission,
      startCamera,
      stopCamera,
      switchCamera,
      capturePhoto,
    },
  };
}