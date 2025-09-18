/**
 * Service Worker for NFC Digital Inventory Manager
 * Provides offline functionality for camera interface and photo uploads
 */

const CACHE_NAME = 'digi-inventory-v1';
const OFFLINE_CACHE = 'digi-inventory-offline-v1';

// Critical assets for camera functionality
const CRITICAL_ASSETS = [
  '/',
  '/dashboard',
  '/inventory/new',
  '/manifest.json',
  // Camera interface assets (will be populated when components are built)
];

// Camera-specific assets for offline functionality
const CAMERA_ASSETS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Camera component assets will be added dynamically
];

/**
 * Install event - cache critical assets
 */
self.addEventListener('install', (event) => {
  console.log('📸 Service Worker: Installing...');

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);

        // Cache critical assets
        await cache.addAll(CRITICAL_ASSETS);

        // Cache camera-specific assets
        const offlineCache = await caches.open(OFFLINE_CACHE);
        await offlineCache.addAll(CAMERA_ASSETS);

        console.log('✅ Service Worker: Critical assets cached');

        // Skip waiting to activate immediately
        self.skipWaiting();
      } catch (error) {
        console.error('❌ Service Worker: Install failed:', error);
      }
    })()
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('📸 Service Worker: Activating...');

  event.waitUntil(
    (async () => {
      try {
        // Clean up old caches
        const cacheNames = await caches.keys();
        const deletePromises = cacheNames
          .filter((name) => name !== CACHE_NAME && name !== OFFLINE_CACHE)
          .map((name) => caches.delete(name));

        await Promise.all(deletePromises);

        // Take control of all clients
        await self.clients.claim();

        console.log('✅ Service Worker: Activated and ready');
      } catch (error) {
        console.error('❌ Service Worker: Activation failed:', error);
      }
    })()
  );
});

/**
 * Fetch event - handle network requests with cache fallback
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Handle camera-related requests with special caching strategy
  if (isCameraRequest(request)) {
    event.respondWith(handleCameraRequest(request));
    return;
  }

  // Handle photo upload requests (queue for later if offline)
  if (isPhotoUploadRequest(request)) {
    event.respondWith(handlePhotoUploadRequest(request));
    return;
  }

  // Default caching strategy for other requests
  event.respondWith(handleDefaultRequest(request));
});

/**
 * Background sync for queued photo uploads
 */
self.addEventListener('sync', (event) => {
  console.log('📸 Service Worker: Background sync triggered:', event.tag);

  if (event.tag === 'photo-upload-queue') {
    event.waitUntil(processUploadQueue());
  }
});

/**
 * Handle push notifications for upload completion
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    if (data.type === 'upload-complete') {
      event.waitUntil(
        self.registration.showNotification('Photo Upload Complete', {
          body: `Your photo for "${data.itemName}" has been processed successfully.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-badge.png',
          tag: 'upload-complete',
          data: { itemId: data.itemId, url: data.url },
          actions: [
            {
              action: 'view',
              title: 'View Item',
              icon: '/icons/icon-view.png'
            }
          ]
        })
      );
    }
  } catch (error) {
    console.error('❌ Service Worker: Push notification error:', error);
  }
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', (event) => {
  console.log('📸 Service Worker: Notification clicked:', event.notification.tag);

  event.notification.close();

  if (event.action === 'view' && event.notification.data?.itemId) {
    event.waitUntil(
      self.clients.openWindow(`/inventory/${event.notification.data.itemId}`)
    );
  }
});

/**
 * Check if request is camera-related
 */
function isCameraRequest(request) {
  const url = new URL(request.url);
  return (
    url.pathname.includes('/camera') ||
    url.pathname.includes('/capture') ||
    url.searchParams.has('camera')
  );
}

/**
 * Check if request is a photo upload
 */
function isPhotoUploadRequest(request) {
  const url = new URL(request.url);
  return (
    request.method === 'POST' &&
    url.pathname.includes('/photos') &&
    request.headers.get('content-type')?.includes('multipart/form-data')
  );
}

/**
 * Handle camera-related requests with offline support
 */
async function handleCameraRequest(request) {
  try {
    // Try network first for fresh content
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(OFFLINE_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('📸 Service Worker: Network failed, using cache for camera request');

    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for camera if available
    return caches.match('/camera-offline.html') ||
           new Response('Camera unavailable offline', { status: 503 });
  }
}

/**
 * Handle photo upload requests with queuing for offline
 */
async function handlePhotoUploadRequest(request) {
  try {
    // Try immediate upload
    const response = await fetch(request);

    if (response.ok) {
      return response;
    }

    throw new Error(`Upload failed: ${response.status}`);
  } catch (error) {
    console.log('📸 Service Worker: Upload failed, queuing for later:', error);

    // Queue the upload for background sync
    await queueUploadRequest(request);

    // Return optimistic response
    return new Response(
      JSON.stringify({
        success: false,
        queued: true,
        message: 'Upload queued for when connection is restored'
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle default requests with network-first strategy
 */
async function handleDefaultRequest(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful GET requests
    if (request.method === 'GET' && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Fallback to cache for GET requests
    if (request.method === 'GET') {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Return network error for non-GET requests
    throw error;
  }
}

/**
 * Queue upload request for background sync
 */
async function queueUploadRequest(request) {
  try {
    // Convert request to serializable format
    const formData = await request.formData();
    const uploadData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: Date.now(),
      data: {} // FormData will be reconstructed from IndexedDB
    };

    // Store in IndexedDB for persistence
    await storeQueuedUpload(uploadData, formData);

    // Register background sync
    await self.registration.sync.register('photo-upload-queue');

    console.log('📸 Service Worker: Upload queued successfully');
  } catch (error) {
    console.error('❌ Service Worker: Failed to queue upload:', error);
  }
}

/**
 * Process queued uploads during background sync
 */
async function processUploadQueue() {
  try {
    const queuedUploads = await getQueuedUploads();
    console.log(`📸 Service Worker: Processing ${queuedUploads.length} queued uploads`);

    for (const upload of queuedUploads) {
      try {
        // Reconstruct the request
        const formData = await reconstructFormData(upload);
        const request = new Request(upload.url, {
          method: upload.method,
          headers: upload.headers,
          body: formData
        });

        // Attempt upload
        const response = await fetch(request);

        if (response.ok) {
          console.log('✅ Service Worker: Queued upload successful');
          await removeQueuedUpload(upload.id);

          // Notify user of successful upload
          await self.registration.showNotification('Photo Uploaded', {
            body: 'Your queued photo has been uploaded successfully.',
            icon: '/icons/icon-192x192.png',
            tag: 'upload-success'
          });
        } else {
          console.log(`❌ Service Worker: Queued upload failed: ${response.status}`);
        }
      } catch (error) {
        console.error('❌ Service Worker: Error processing queued upload:', error);
      }
    }
  } catch (error) {
    console.error('❌ Service Worker: Error processing upload queue:', error);
  }
}

/**
 * IndexedDB operations for upload queue (simplified implementation)
 */
async function storeQueuedUpload(uploadData, formData) {
  // TODO: Implement IndexedDB storage for upload queue
  // This would store the upload data and FormData for later processing
  console.log('📸 Service Worker: TODO - Store upload in IndexedDB');
}

async function getQueuedUploads() {
  // TODO: Implement IndexedDB retrieval of queued uploads
  console.log('📸 Service Worker: TODO - Get queued uploads from IndexedDB');
  return [];
}

async function removeQueuedUpload(uploadId) {
  // TODO: Implement IndexedDB removal of processed upload
  console.log('📸 Service Worker: TODO - Remove upload from IndexedDB');
}

async function reconstructFormData(upload) {
  // TODO: Implement FormData reconstruction from IndexedDB
  console.log('📸 Service Worker: TODO - Reconstruct FormData from IndexedDB');
  return new FormData();
}

console.log('📸 Service Worker: Script loaded and ready');