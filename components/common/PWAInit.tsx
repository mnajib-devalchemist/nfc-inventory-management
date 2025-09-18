'use client';

import { useEffect } from 'react';
import { initializePWA } from '@/lib/utils/pwa';

/**
 * PWA initialization component
 * Registers service worker and sets up PWA functionality on client-side
 */
export function PWAInit() {
  useEffect(() => {
    let mounted = true;

    const initPWA = async () => {
      try {
        const result = await initializePWA();

        if (!mounted) return;

        // Log initialization results for debugging
        console.log('📸 PWA Init Results:', {
          serviceWorkerRegistered: result.serviceWorker.success,
          cameraSupported: result.cameraSupported,
          secureContext: result.secureContext,
          canInstall: result.installationState.canInstall,
          isStandalone: result.installationState.isStandalone
        });

        // Show warnings for development
        if (process.env.NODE_ENV === 'development') {
          if (!result.secureContext) {
            console.warn('⚠️ PWA: Camera requires HTTPS in production');
          }

          if (!result.cameraSupported) {
            console.warn('⚠️ PWA: Camera not supported in this browser');
          }

          if (result.serviceWorker.error) {
            console.warn('⚠️ PWA: Service worker registration failed:', result.serviceWorker.error);
          }
        }
      } catch (error) {
        if (mounted) {
          console.error('❌ PWA: Initialization failed:', error);
        }
      }
    };

    // Initialize PWA after component mounts
    initPWA();

    return () => {
      mounted = false;
    };
  }, []);

  // This component doesn't render anything visible
  return null;
}