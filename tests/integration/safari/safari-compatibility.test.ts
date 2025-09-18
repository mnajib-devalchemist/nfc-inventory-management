/**
 * Safari iOS Compatibility Tests
 * Tests Safari-specific behaviors and iOS camera integration
 */

import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CameraCapture } from '@/components/camera/CameraCapture';

// Safari-specific user agent strings
const SAFARI_IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const SAFARI_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
const SAFARI_IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

describe('Safari iOS Compatibility Tests', () => {
  let originalUserAgent: string;
  let mockGetUserMedia: jest.Mock;
  let mockEnumerateDevices: jest.Mock;

  beforeEach(() => {
    originalUserAgent = navigator.userAgent;

    mockGetUserMedia = jest.fn();
    mockEnumerateDevices = jest.fn();

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: mockEnumerateDevices,
        getSupportedConstraints: jest.fn(() => ({
          width: true,
          height: true,
          frameRate: true,
          facingMode: true
        }))
      },
      writable: true
    });

    // Mock video element methods
    Object.defineProperty(HTMLVideoElement.prototype, 'play', {
      value: jest.fn().mockResolvedValue(undefined),
      writable: true
    });

    Object.defineProperty(HTMLVideoElement.prototype, 'pause', {
      value: jest.fn(),
      writable: true
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true
    });
    jest.clearAllMocks();
  });

  function mockUserAgent(userAgent: string) {
    Object.defineProperty(navigator, 'userAgent', {
      value: userAgent,
      writable: true
    });
  }

  function createMockMediaStreamTrack(kind: string, label: string, facingMode?: string) {
    return {
      id: Math.random().toString(36),
      kind,
      label,
      enabled: true,
      muted: false,
      readyState: 'live' as MediaStreamTrackState,
      stop: jest.fn(),
      clone: jest.fn(),
      getConstraints: jest.fn(() => ({})),
      getSettings: jest.fn(() => ({
        width: 1920,
        height: 1080,
        frameRate: 30,
        facingMode: facingMode || (label.includes('front') ? 'user' : 'environment')
      })),
      getCapabilities: jest.fn(() => ({
        width: { min: 640, max: 1920 },
        height: { min: 480, max: 1080 },
        frameRate: { min: 15, max: 60 },
        facingMode: facingMode ? [facingMode] : ['user', 'environment']
      })),
      applyConstraints: jest.fn().mockResolvedValue(undefined),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true)
    } as any;
  }

  function createMockMediaStream(tracks: any[] = []) {
    return {
      id: Math.random().toString(36),
      active: true,
      tracks,
      getTracks: () => tracks,
      getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
      getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
      addTrack: jest.fn(),
      removeTrack: jest.fn(),
      clone: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true)
    } as any;
  }

  describe('Safari iOS Detection', () => {
    test('should detect Safari iOS correctly', () => {
      mockUserAgent(SAFARI_IOS_UA);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Should show iOS-specific UI elements
      expect(screen.getByText(/tap to capture/i)).toBeInTheDocument();
    });

    test('should detect Safari iPad correctly', () => {
      mockUserAgent(SAFARI_IPAD_UA);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Should show iPad-specific UI elements
      expect(screen.getByText(/touch to capture/i)).toBeInTheDocument();
    });

    test('should handle Safari desktop differently', () => {
      mockUserAgent(SAFARI_DESKTOP_UA);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Should show desktop UI
      expect(screen.getByText(/click to capture/i)).toBeInTheDocument();
    });
  });

  describe('iOS Camera Constraints', () => {
    test('should use iOS-optimized camera constraints', async () => {
      mockUserAgent(SAFARI_IOS_UA);

      const mockTrack = createMockMediaStreamTrack('video', 'Back Camera', 'environment');
      const mockStream = createMockMediaStream([mockTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);
      mockEnumerateDevices.mockResolvedValue([
        {
          deviceId: 'back-camera',
          kind: 'videoinput',
          label: 'Back Camera',
          groupId: 'group1'
        }
      ]);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith({
          video: {
            facingMode: 'environment', // Default to back camera on iOS
            width: { ideal: 1280, max: 1920 }, // Lower resolution for iOS
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 }, // Stable framerate
            // iOS-specific constraints
            aspectRatio: { ideal: 16/9 },
            resizeMode: 'crop-and-scale'
          }
        });
      });
    });

    test('should handle iOS camera switching properly', async () => {
      mockUserAgent(SAFARI_IOS_UA);

      const backTrack = createMockMediaStreamTrack('video', 'Back Camera', 'environment');
      const frontTrack = createMockMediaStreamTrack('video', 'Front Camera', 'user');

      const backStream = createMockMediaStream([backTrack]);
      const frontStream = createMockMediaStream([frontTrack]);

      mockGetUserMedia
        .mockResolvedValueOnce(backStream)
        .mockResolvedValueOnce(frontStream);

      mockEnumerateDevices.mockResolvedValue([
        {
          deviceId: 'back-camera',
          kind: 'videoinput',
          label: 'Back Camera',
          groupId: 'group1'
        },
        {
          deviceId: 'front-camera',
          kind: 'videoinput',
          label: 'Front Camera',
          groupId: 'group2'
        }
      ]);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Start with back camera (iOS default)
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({
              facingMode: 'environment'
            })
          })
        );
      });

      // Switch to front camera
      const flipButton = screen.getByRole('button', { name: /flip/i });
      fireEvent.click(flipButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({
              facingMode: 'user'
            })
          })
        );
      });

      // Verify old stream was stopped
      expect(backTrack.stop).toHaveBeenCalled();
    });
  });

  describe('Safari-specific API Limitations', () => {
    test('should handle getUserMedia without deviceId constraint on older Safari', async () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');

      const mockTrack = createMockMediaStreamTrack('video', 'Camera');
      const mockStream = createMockMediaStream([mockTrack]);

      // Simulate older Safari that doesn't support deviceId
      mockGetUserMedia.mockImplementation((constraints: any) => {
        if (constraints.video.deviceId) {
          return Promise.reject(new Error('deviceId constraint not supported'));
        }
        return Promise.resolve(mockStream);
      });

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith({
          video: {
            facingMode: 'environment', // Fallback to facingMode only
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
            aspectRatio: { ideal: 16/9 },
            resizeMode: 'crop-and-scale'
          }
        });
      });

      expect(screen.getByText(/camera active/i)).toBeInTheDocument();
    });

    test('should handle autoplay policy restrictions', async () => {
      mockUserAgent(SAFARI_IOS_UA);

      const mockTrack = createMockMediaStreamTrack('video', 'Camera');
      const mockStream = createMockMediaStream([mockTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      // Mock autoplay restriction
      const playError = new Error('The request is not allowed by the user agent');
      playError.name = 'NotAllowedError';

      Object.defineProperty(HTMLVideoElement.prototype, 'play', {
        value: jest.fn().mockRejectedValue(playError),
        writable: true
      });

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/tap to start video/i)).toBeInTheDocument();
      });

      // User interaction should enable video
      const videoElement = screen.getByRole('video', { hidden: true });
      fireEvent.click(videoElement);

      await waitFor(() => {
        expect(HTMLVideoElement.prototype.play).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Touch and Gesture Handling', () => {
    test('should handle touch events for photo capture on iOS', async () => {
      mockUserAgent(SAFARI_IOS_UA);

      const mockTrack = createMockMediaStreamTrack('video', 'Camera');
      const mockStream = createMockMediaStream([mockTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      const mockCanvas = {
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
          getImageData: jest.fn(() => ({
            data: new Uint8ClampedArray(1280 * 720 * 4),
            width: 1280,
            height: 720
          }))
        })),
        toBlob: jest.fn((callback) => {
          const mockBlob = new Blob(['mock-image'], { type: 'image/jpeg' });
          callback(mockBlob);
        }),
        width: 1280,
        height: 720
      };

      jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'canvas') {
          return mockCanvas as any;
        }
        return document.createElement(tagName);
      });

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Touch to capture
      const captureButton = screen.getByRole('button', { name: /capture/i });

      fireEvent.touchStart(captureButton, {
        touches: [{ clientX: 100, clientY: 100 }]
      });

      fireEvent.touchEnd(captureButton, {
        changedTouches: [{ clientX: 100, clientY: 100 }]
      });

      await waitFor(() => {
        expect(onCapture).toHaveBeenCalledWith(
          expect.any(Blob),
          expect.objectContaining({
            width: 1280,
            height: 720
          })
        );
      });
    });

    test('should handle pinch-to-zoom on iOS', async () => {
      mockUserAgent(SAFARI_IOS_UA);

      const mockTrack = createMockMediaStreamTrack('video', 'Camera');
      mockTrack.getCapabilities = jest.fn(() => ({
        zoom: { min: 1, max: 8, step: 0.1 }
      }));

      const mockStream = createMockMediaStream([mockTrack]);
      mockGetUserMedia.mockResolvedValue(mockStream);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} enableZoom />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      const videoContainer = screen.getByTestId('video-container');

      // Simulate pinch gesture
      fireEvent.touchStart(videoContainer, {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 200 }
        ]
      });

      fireEvent.touchMove(videoContainer, {
        touches: [
          { clientX: 80, clientY: 80 },
          { clientX: 220, clientY: 220 }
        ]
      });

      fireEvent.touchEnd(videoContainer, {
        changedTouches: [
          { clientX: 80, clientY: 80 },
          { clientX: 220, clientY: 220 }
        ]
      });

      await waitFor(() => {
        expect(mockTrack.applyConstraints).toHaveBeenCalledWith({
          advanced: [{ zoom: expect.any(Number) }]
        });
      });
    });
  });

  describe('Performance Optimizations for iOS', () => {
    test('should use lower resolution on older iOS devices', async () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X) AppleWebKit/605.1.15');

      const mockTrack = createMockMediaStreamTrack('video', 'Camera');
      const mockStream = createMockMediaStream([mockTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith({
          video: {
            facingMode: 'environment',
            width: { ideal: 960, max: 1280 }, // Lower for older devices
            height: { ideal: 540, max: 720 },
            frameRate: { ideal: 24, max: 30 }, // Lower framerate
            aspectRatio: { ideal: 16/9 },
            resizeMode: 'crop-and-scale'
          }
        });
      });
    });

    test('should handle memory warnings on iOS', async () => {
      mockUserAgent(SAFARI_IOS_UA);

      const mockTrack = createMockMediaStreamTrack('video', 'Camera');
      const mockStream = createMockMediaStream([mockTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      // Mock memory warning
      const memoryWarningEvent = new Event('webkitmemorywarning');

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Trigger memory warning
      window.dispatchEvent(memoryWarningEvent);

      await waitFor(() => {
        expect(mockTrack.stop).toHaveBeenCalled();
        expect(screen.getByText(/camera paused to save memory/i)).toBeInTheDocument();
      });
    });
  });

  describe('HEIC Support on iOS', () => {
    test('should detect HEIC support on iOS', () => {
      mockUserAgent(SAFARI_IOS_UA);

      // Mock HEIC support detection
      const mockCanvas = document.createElement('canvas');
      mockCanvas.toBlob = jest.fn((callback, type) => {
        if (type === 'image/heic') {
          callback(new Blob(['heic-data'], { type: 'image/heic' }));
        } else {
          callback(null);
        }
      });

      jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'canvas') {
          return mockCanvas;
        }
        return document.createElement(tagName);
      });

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} preferHEIC />);

      expect(screen.getByText(/heic supported/i)).toBeInTheDocument();
    });

    test('should capture in HEIC format when supported on iOS', async () => {
      mockUserAgent(SAFARI_IOS_UA);

      const mockTrack = createMockMediaStreamTrack('video', 'Camera');
      const mockStream = createMockMediaStream([mockTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      const mockCanvas = {
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
          getImageData: jest.fn(() => ({
            data: new Uint8ClampedArray(1280 * 720 * 4),
            width: 1280,
            height: 720
          }))
        })),
        toBlob: jest.fn((callback, type) => {
          const mimeType = type === 'image/heic' ? 'image/heic' : 'image/jpeg';
          const mockBlob = new Blob(['mock-image'], { type: mimeType });
          callback(mockBlob);
        }),
        width: 1280,
        height: 720
      };

      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} preferHEIC />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Capture in HEIC
      const captureButton = screen.getByRole('button', { name: /capture/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(mockCanvas.toBlob).toHaveBeenCalledWith(
          expect.any(Function),
          'image/heic',
          expect.any(Number)
        );

        expect(onCapture).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'image/heic'
          }),
          expect.any(Object)
        );
      });
    });
  });

  describe('PWA Installation on iOS', () => {
    test('should show add to home screen prompt on iOS Safari', () => {
      mockUserAgent(SAFARI_IOS_UA);

      // Mock not installed as PWA
      Object.defineProperty(window, 'navigator', {
        value: {
          ...navigator,
          standalone: false
        },
        writable: true
      });

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
      expect(screen.getByText(/for better camera experience/i)).toBeInTheDocument();
    });

    test('should hide PWA prompt when already installed', () => {
      mockUserAgent(SAFARI_IOS_UA);

      // Mock installed as PWA
      Object.defineProperty(window, 'navigator', {
        value: {
          ...navigator,
          standalone: true
        },
        writable: true
      });

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument();
    });
  });
});