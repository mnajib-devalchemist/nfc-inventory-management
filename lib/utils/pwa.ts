/**
 * PWA utilities for service worker registration and camera permissions
 * Implements Progressive Web App functionality with camera access support
 */

/**
 * Camera permission state
 */
export type CameraPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * PWA installation state
 */
export interface PWAInstallationState {
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  canInstall: boolean;
}

/**
 * Service worker registration result
 */
export interface ServiceWorkerRegistrationResult {
  success: boolean;
  registration?: ServiceWorkerRegistration;
  error?: Error;
}

/**
 * Register service worker with error handling
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistrationResult> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      success: false,
      error: new Error('Service workers not supported')
    };
  }

  try {
    console.log('📸 PWA: Registering service worker...');

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });

    console.log('✅ PWA: Service worker registered successfully');

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('📸 PWA: New service worker available');
            // Could show update notification to user
          }
        });
      }
    });

    return {
      success: true,
      registration
    };
  } catch (error) {
    console.error('❌ PWA: Service worker registration failed:', error);
    return {
      success: false,
      error: error as Error
    };
  }
}

/**
 * Check camera permission status
 */
export async function checkCameraPermission(): Promise<CameraPermissionState> {
  if (typeof window === 'undefined') {
    return 'unknown';
  }

  try {
    // Try the Permissions API first (most reliable)
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return permission.state as CameraPermissionState;
    }

    // Fallback: Try to access camera without requesting permission
    // This is a less reliable method but works on older browsers
    if ((navigator as any).mediaDevices && (navigator as any).mediaDevices.getUserMedia) {
      try {
        const stream = await (navigator as any).mediaDevices.getUserMedia({
          video: { width: 1, height: 1 } // Minimal request
        });

        // Immediately stop the stream
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        return 'granted';
      } catch (error) {
        const err = error as Error;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          return 'denied';
        }
        return 'unknown';
      }
    }

    return 'unknown';
  } catch (error) {
    console.error('❌ PWA: Error checking camera permission:', error);
    return 'unknown';
  }
}

/**
 * Request camera permission with user-friendly handling
 */
export async function requestCameraPermission(): Promise<{
  granted: boolean;
  stream?: MediaStream;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { granted: false, error: 'Not available in server environment' };
  }

  if (!('mediaDevices' in navigator) || !('getUserMedia' in navigator.mediaDevices)) {
    return { granted: false, error: 'Camera not supported by this browser' };
  }

  try {
    console.log('📸 PWA: Requesting camera permission...');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Prefer rear camera
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    console.log('✅ PWA: Camera permission granted');

    return {
      granted: true,
      stream
    };
  } catch (error) {
    const err = error as Error;
    console.error('❌ PWA: Camera permission denied:', err.name, err.message);

    let userMessage = 'Camera access was denied.';

    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        userMessage = 'Camera access was denied. Please enable camera permissions in your browser settings.';
        break;
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        userMessage = 'No camera found on this device.';
        break;
      case 'NotReadableError':
      case 'TrackStartError':
        userMessage = 'Camera is already in use by another application.';
        break;
      case 'OverconstrainedError':
        userMessage = 'Camera does not meet the required specifications.';
        break;
      case 'NotSupportedError':
        userMessage = 'Camera is not supported by this browser.';
        break;
      case 'TypeError':
        userMessage = 'Camera access is not available on this connection. HTTPS is required.';
        break;
      default:
        userMessage = `Camera access failed: ${err.message}`;
    }

    return {
      granted: false,
      error: userMessage
    };
  }
}

/**
 * Check PWA installation state
 */
export function getPWAInstallationState(): PWAInstallationState {
  if (typeof window === 'undefined') {
    return {
      isInstallable: false,
      isInstalled: false,
      isStandalone: false,
      canInstall: false
    };
  }

  // Check if running in standalone mode (already installed)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone === true;

  // Check if installation prompt is available
  const canInstall = !!(window as any).deferredPrompt;

  return {
    isInstallable: 'serviceWorker' in navigator,
    isInstalled: isStandalone,
    isStandalone,
    canInstall
  };
}

/**
 * Prompt user to install PWA
 */
export async function promptPWAInstall(): Promise<{
  success: boolean;
  outcome?: 'accepted' | 'dismissed';
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Not available in server environment' };
  }

  const deferredPrompt = (window as any).deferredPrompt;

  if (!deferredPrompt) {
    return { success: false, error: 'Installation prompt not available' };
  }

  try {
    console.log('📸 PWA: Showing installation prompt...');

    // Show the installation prompt
    deferredPrompt.prompt();

    // Wait for user response
    const choiceResult = await deferredPrompt.userChoice;

    console.log(`📸 PWA: User ${choiceResult.outcome} the installation`);

    // Clear the deferredPrompt
    (window as any).deferredPrompt = null;

    return {
      success: true,
      outcome: choiceResult.outcome
    };
  } catch (error) {
    console.error('❌ PWA: Installation prompt failed:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Check if device supports camera
 */
export function isCameraSupported(): boolean {
  if (typeof window === 'undefined') return false;

  return !!(
    (navigator as any).mediaDevices &&
    (navigator as any).mediaDevices.getUserMedia &&
    // Check for basic video support
    document.createElement('video').canPlayType
  );
}

/**
 * Check if HTTPS is available (required for camera in production)
 */
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.isSecureContext ||
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

/**
 * Get available camera devices
 */
export async function getCameraDevices(): Promise<{
  devices: MediaDeviceInfo[];
  hasRearCamera: boolean;
  hasFrontCamera: boolean;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { devices: [], hasRearCamera: false, hasFrontCamera: false, error: 'Not available in server environment' };
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return { devices: [], hasRearCamera: false, hasFrontCamera: false, error: 'Device enumeration not supported' };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    // Try to determine camera facing direction
    let hasRearCamera = false;
    let hasFrontCamera = false;

    for (const device of videoDevices) {
      const label = device.label.toLowerCase();
      if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
        hasRearCamera = true;
      } else if (label.includes('front') || label.includes('user') || label.includes('face')) {
        hasFrontCamera = true;
      }
    }

    // If we can't determine from labels and have multiple cameras, assume both
    if (!hasRearCamera && !hasFrontCamera && videoDevices.length > 1) {
      hasRearCamera = true;
      hasFrontCamera = true;
    } else if (!hasRearCamera && !hasFrontCamera && videoDevices.length === 1) {
      // Single camera, could be either - assume rear for inventory use
      hasRearCamera = true;
    }

    return {
      devices: videoDevices,
      hasRearCamera,
      hasFrontCamera
    };
  } catch (error) {
    console.error('❌ PWA: Error enumerating camera devices:', error);
    return {
      devices: [],
      hasRearCamera: false,
      hasFrontCamera: false,
      error: (error as Error).message
    };
  }
}

/**
 * Initialize PWA functionality
 */
export async function initializePWA(): Promise<{
  serviceWorker: ServiceWorkerRegistrationResult;
  cameraSupported: boolean;
  secureContext: boolean;
  installationState: PWAInstallationState;
}> {
  console.log('📸 PWA: Initializing...');

  const serviceWorker = await registerServiceWorker();
  const cameraSupported = isCameraSupported();
  const secureContext = isSecureContext();
  const installationState = getPWAInstallationState();

  // Set up beforeinstallprompt listener
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('📸 PWA: Installation prompt available');
      e.preventDefault(); // Prevent default mini-infobar
      (window as any).deferredPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA: App installed successfully');
      (window as any).deferredPrompt = null;
    });
  }

  console.log('✅ PWA: Initialization complete', {
    serviceWorker: serviceWorker.success,
    cameraSupported,
    secureContext,
    installationState
  });

  return {
    serviceWorker,
    cameraSupported,
    secureContext,
    installationState
  };
}