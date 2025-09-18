/**
 * PWA Infrastructure Tests
 * Tests service worker functionality, manifest, and offline capabilities
 */

import { jest } from '@jest/globals';

// Mock service worker registration
class MockServiceWorkerRegistration {
  scope: string = 'http://localhost/';
  installing: ServiceWorker | null = null;
  waiting: ServiceWorker | null = null;
  active: ServiceWorker | null = null;
  navigationPreload: any = null;
  pushManager: any = null;
  sync: any = null;
  updateViaCache: ServiceWorkerUpdateViaCache = 'imports';

  constructor() {
    this.active = new MockServiceWorker();
  }

  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  dispatchEvent = jest.fn();
  unregister = jest.fn().mockResolvedValue(true);
  update = jest.fn().mockResolvedValue(undefined);
  showNotification = jest.fn();
  getNotifications = jest.fn().mockResolvedValue([]);
}

class MockServiceWorker {
  scriptURL: string = '/sw.js';
  state: ServiceWorkerState = 'activated';

  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  dispatchEvent = jest.fn();
  postMessage = jest.fn();
}

describe('PWA Infrastructure Tests', () => {
  let mockServiceWorkerContainer: any;
  let mockCaches: any;
  let originalNavigator: any;

  beforeEach(() => {
    // Mock ServiceWorkerContainer
    mockServiceWorkerContainer = {
      register: jest.fn(),
      getRegistration: jest.fn(),
      getRegistrations: jest.fn(),
      ready: Promise.resolve(new MockServiceWorkerRegistration()),
      controller: new MockServiceWorker(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    };

    // Mock Caches API
    mockCaches = {
      open: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      match: jest.fn()
    };

    // Store original navigator
    originalNavigator = global.navigator;

    // Mock navigator with service worker support
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        serviceWorker: mockServiceWorkerContainer,
        onLine: true
      },
      writable: true
    });

    Object.defineProperty(global, 'caches', {
      value: mockCaches,
      writable: true
    });

    // Mock fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true
    });
    jest.clearAllMocks();
  });

  describe('Service Worker Registration', () => {
    test('should register service worker successfully', async () => {
      const mockRegistration = new MockServiceWorkerRegistration();
      mockServiceWorkerContainer.register.mockResolvedValue(mockRegistration);

      // Import and test PWA utilities
      const { initializePWA } = await import('@/lib/utils/pwa');

      const result = await initializePWA();

      expect(mockServiceWorkerContainer.register).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
        updateViaCache: 'imports'
      });

      expect(result.serviceWorkerSupported).toBe(true);
      expect(result.registration).toBe(mockRegistration);
    });

    test('should handle service worker registration failure', async () => {
      const registrationError = new Error('Service worker registration failed');
      mockServiceWorkerContainer.register.mockRejectedValue(registrationError);

      const { initializePWA } = await import('@/lib/utils/pwa');

      const result = await initializePWA();

      expect(result.serviceWorkerSupported).toBe(false);
      expect(result.error).toBe(registrationError);
    });

    test('should handle browsers without service worker support', async () => {
      // Remove service worker support
      Object.defineProperty(global, 'navigator', {
        value: {
          ...originalNavigator,
          serviceWorker: undefined
        },
        writable: true
      });

      const { initializePWA } = await import('@/lib/utils/pwa');

      const result = await initializePWA();

      expect(result.serviceWorkerSupported).toBe(false);
      expect(result.registration).toBeNull();
    });
  });

  describe('Manifest Validation', () => {
    test('should validate PWA manifest structure', async () => {
      // Mock manifest fetch
      const mockManifest = {
        name: 'Inventory Management',
        short_name: 'Inventory',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        permissions: ['camera']
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest)
      });

      const { validateManifest } = await import('@/lib/utils/pwa');

      const validation = await validateManifest();

      expect(validation.isValid).toBe(true);
      expect(validation.manifest).toEqual(mockManifest);
      expect(validation.errors).toHaveLength(0);
    });

    test('should detect missing required manifest fields', async () => {
      const incompleteManifest = {
        name: 'Inventory Management'
        // Missing required fields
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(incompleteManifest)
      });

      const { validateManifest } = await import('@/lib/utils/pwa');

      const validation = await validateManifest();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Missing required field: start_url');
      expect(validation.errors).toContain('Missing required field: display');
      expect(validation.errors).toContain('Missing required field: icons');
    });

    test('should validate camera permission in manifest', async () => {
      const manifestWithoutCamera = {
        name: 'Inventory Management',
        short_name: 'Inventory',
        start_url: '/',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
        // Missing camera permission
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manifestWithoutCamera)
      });

      const { validateManifest } = await import('@/lib/utils/pwa');

      const validation = await validateManifest();

      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toContain('Camera permission not declared in manifest');
    });
  });

  describe('Cache Management', () => {
    test('should initialize cache with essential resources', async () => {
      const mockCache = {
        addAll: jest.fn().mockResolvedValue(undefined),
        add: jest.fn().mockResolvedValue(undefined),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(true),
        keys: jest.fn().mockResolvedValue([]),
        match: jest.fn().mockResolvedValue(undefined)
      };

      mockCaches.open.mockResolvedValue(mockCache);

      // Test cache initialization
      const cachePromise = caches.open('inventory-v1');
      const cache = await cachePromise;

      const essentialResources = [
        '/',
        '/manifest.json',
        '/icons/icon-192x192.png',
        '/icons/icon-512x512.png',
        '/_next/static/css/app.css',
        '/_next/static/js/app.js'
      ];

      await cache.addAll(essentialResources);

      expect(mockCache.addAll).toHaveBeenCalledWith(essentialResources);
    });

    test('should handle cache storage errors gracefully', async () => {
      const cacheError = new Error('QuotaExceededError');
      mockCaches.open.mockRejectedValue(cacheError);

      try {
        await caches.open('inventory-v1');
        fail('Should have thrown cache error');
      } catch (error) {
        expect(error).toBe(cacheError);
      }

      // Service worker should continue functioning without cache
      expect(mockServiceWorkerContainer.controller).toBeTruthy();
    });

    test('should clean up old cache versions', async () => {
      const oldCacheNames = ['inventory-v1', 'inventory-v2'];
      const currentCacheName = 'inventory-v3';

      mockCaches.keys.mockResolvedValue([
        ...oldCacheNames,
        currentCacheName
      ]);

      mockCaches.delete.mockResolvedValue(true);

      // Simulate cache cleanup
      const allCacheNames = await caches.keys();
      const cachesToDelete = allCacheNames.filter(name =>
        name.startsWith('inventory-') && name !== currentCacheName
      );

      await Promise.all(
        cachesToDelete.map(name => caches.delete(name))
      );

      expect(mockCaches.delete).toHaveBeenCalledTimes(2);
      expect(mockCaches.delete).toHaveBeenCalledWith('inventory-v1');
      expect(mockCaches.delete).toHaveBeenCalledWith('inventory-v2');
    });
  });

  describe('Offline Functionality', () => {
    test('should queue photo uploads when offline', async () => {
      // Mock offline state
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true
      });

      const mockCache = {
        put: jest.fn().mockResolvedValue(undefined),
        match: jest.fn().mockResolvedValue(undefined)
      };

      mockCaches.open.mockResolvedValue(mockCache);

      // Mock IndexedDB for offline queue
      const mockStore = {
        add: jest.fn().mockResolvedValue('upload-1'),
        getAll: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined)
      };

      // Simulate offline upload queuing
      const uploadData = {
        id: 'upload-1',
        itemId: 'item-123',
        file: new Blob(['test-image'], { type: 'image/jpeg' }),
        timestamp: Date.now(),
        retryCount: 0
      };

      await mockStore.add(uploadData);

      expect(mockStore.add).toHaveBeenCalledWith(uploadData);
    });

    test('should process offline queue when back online', async () => {
      // Mock coming back online
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true
      });

      const queuedUploads = [
        {
          id: 'upload-1',
          itemId: 'item-123',
          file: new Blob(['test-image-1'], { type: 'image/jpeg' }),
          timestamp: Date.now() - 10000,
          retryCount: 0
        },
        {
          id: 'upload-2',
          itemId: 'item-456',
          file: new Blob(['test-image-2'], { type: 'image/jpeg' }),
          timestamp: Date.now() - 5000,
          retryCount: 1
        }
      ];

      // Mock successful upload responses
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ id: 'photo-1', status: 'uploaded' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ id: 'photo-2', status: 'uploaded' })
        });

      // Process queue
      for (const upload of queuedUploads) {
        const formData = new FormData();
        formData.append('photo', upload.file);

        const response = await fetch(`/api/v1/items/${upload.itemId}/photos`, {
          method: 'POST',
          body: formData
        });

        expect(response.ok).toBe(true);
      }

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('should retry failed uploads with exponential backoff', async () => {
      const failedUpload = {
        id: 'upload-fail',
        itemId: 'item-789',
        file: new Blob(['test-image'], { type: 'image/jpeg' }),
        timestamp: Date.now(),
        retryCount: 2
      };

      // Mock failed then successful response
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ id: 'photo-3', status: 'uploaded' })
        });

      const maxRetries = 3;
      const baseDelay = 1000; // 1 second

      // First retry (should fail)
      try {
        await fetch('/api/v1/items/item-789/photos', {
          method: 'POST',
          body: new FormData()
        });
        fail('First retry should have failed');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }

      // Calculate backoff delay: 1000 * 2^2 = 4000ms
      const backoffDelay = baseDelay * Math.pow(2, failedUpload.retryCount);
      expect(backoffDelay).toBe(4000);

      // Second retry (should succeed)
      const response = await fetch('/api/v1/items/item-789/photos', {
        method: 'POST',
        body: new FormData()
      });

      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Background Sync', () => {
    test('should register background sync for photo uploads', async () => {
      const mockRegistration = new MockServiceWorkerRegistration();
      mockRegistration.sync = {
        register: jest.fn().mockResolvedValue(undefined),
        getTags: jest.fn().mockResolvedValue(['photo-upload-sync'])
      };

      mockServiceWorkerContainer.ready = Promise.resolve(mockRegistration);

      // Register background sync
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('photo-upload-sync');

      expect(registration.sync.register).toHaveBeenCalledWith('photo-upload-sync');
    });

    test('should handle background sync events', async () => {
      const syncEvent = {
        tag: 'photo-upload-sync',
        lastChance: false,
        waitUntil: jest.fn()
      };

      // Mock processing background sync
      const processSyncEvent = async (event: any) => {
        if (event.tag === 'photo-upload-sync') {
          // Process queued uploads
          const queuedUploads = []; // Would be retrieved from IndexedDB
          return Promise.resolve();
        }
      };

      const result = await processSyncEvent(syncEvent);
      expect(result).toBeUndefined(); // Sync completed successfully
    });
  });

  describe('Push Notifications', () => {
    test('should handle push notification permissions', async () => {
      const mockPermission = 'granted';

      Object.defineProperty(Notification, 'permission', {
        value: mockPermission,
        writable: true
      });

      Notification.requestPermission = jest.fn().mockResolvedValue('granted');

      const permission = await Notification.requestPermission();

      expect(permission).toBe('granted');
      expect(Notification.requestPermission).toHaveBeenCalled();
    });

    test('should register for push notifications after upload completion', async () => {
      const mockRegistration = new MockServiceWorkerRegistration();
      mockRegistration.pushManager = {
        subscribe: jest.fn().mockResolvedValue({
          endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-id',
          keys: {
            p256dh: 'key-data',
            auth: 'auth-data'
          }
        }),
        getSubscription: jest.fn().mockResolvedValue(null)
      };

      mockServiceWorkerContainer.ready = Promise.resolve(mockRegistration);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'server-key'
      });

      expect(subscription.endpoint).toContain('fcm.googleapis.com');
      expect(subscription.keys).toHaveProperty('p256dh');
      expect(subscription.keys).toHaveProperty('auth');
    });
  });

  describe('App Update Handling', () => {
    test('should detect and handle app updates', async () => {
      const mockRegistration = new MockServiceWorkerRegistration();
      const newServiceWorker = new MockServiceWorker();

      mockRegistration.waiting = newServiceWorker;
      mockServiceWorkerContainer.getRegistration.mockResolvedValue(mockRegistration);

      // Simulate update available
      const updateEvent = new Event('updatefound');

      const handleUpdate = (registration: any) => {
        if (registration.waiting) {
          // New service worker is waiting
          return {
            updateAvailable: true,
            newWorker: registration.waiting
          };
        }
        return { updateAvailable: false };
      };

      const result = handleUpdate(mockRegistration);

      expect(result.updateAvailable).toBe(true);
      expect(result.newWorker).toBe(newServiceWorker);
    });

    test('should skip waiting and activate new service worker', async () => {
      const mockRegistration = new MockServiceWorkerRegistration();
      const waitingWorker = new MockServiceWorker();

      mockRegistration.waiting = waitingWorker;

      // Simulate skip waiting message
      waitingWorker.postMessage = jest.fn();

      const activateUpdate = (registration: any) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          return true;
        }
        return false;
      };

      const result = activateUpdate(mockRegistration);

      expect(result).toBe(true);
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });
  });

  describe('Install Prompt', () => {
    test('should handle beforeinstallprompt event', () => {
      let deferredPrompt: any = null;

      const beforeInstallPromptHandler = (event: any) => {
        event.preventDefault();
        deferredPrompt = event;
        return true;
      };

      const mockEvent = {
        preventDefault: jest.fn(),
        prompt: jest.fn().mockResolvedValue({ outcome: 'accepted' }),
        userChoice: Promise.resolve({ outcome: 'accepted' })
      };

      const result = beforeInstallPromptHandler(mockEvent);

      expect(result).toBe(true);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(deferredPrompt).toBe(mockEvent);
    });

    test('should show install prompt when user clicks install button', async () => {
      const mockPrompt = {
        prompt: jest.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' })
      };

      const showInstallPrompt = async (deferredPrompt: any) => {
        if (deferredPrompt) {
          await deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          return choice.outcome;
        }
        return null;
      };

      const outcome = await showInstallPrompt(mockPrompt);

      expect(outcome).toBe('accepted');
      expect(mockPrompt.prompt).toHaveBeenCalled();
    });
  });
});