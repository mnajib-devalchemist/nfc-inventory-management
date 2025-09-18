/**
 * Camera Integration Tests
 * Comprehensive testing of camera functionality with MediaDevices API mocking
 */

import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CameraCapture } from '@/components/camera/CameraCapture';

// Mock MediaDevices API
class MockMediaStream {
  id: string;
  active: boolean = true;
  tracks: MediaStreamTrack[] = [];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.id = Math.random().toString(36);
    this.tracks = tracks;
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'video');
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'audio');
  }

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index > -1) {
      this.tracks.splice(index, 1);
    }
  }

  clone(): MediaStream {
    return new MockMediaStream([...this.tracks]) as any;
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

class MockMediaStreamTrack {
  id: string;
  kind: string;
  label: string;
  enabled: boolean = true;
  muted: boolean = false;
  readyState: MediaStreamTrackState = 'live';

  constructor(kind: string, label: string) {
    this.id = Math.random().toString(36);
    this.kind = kind;
    this.label = label;
  }

  stop(): void {
    this.readyState = 'ended';
  }

  clone(): MediaStreamTrack {
    return new MockMediaStreamTrack(this.kind, this.label) as any;
  }

  getConstraints(): MediaTrackConstraints {
    return {};
  }

  getSettings(): MediaTrackSettings {
    return {
      width: 1920,
      height: 1080,
      frameRate: 30,
      facingMode: this.label.includes('front') ? 'user' : 'environment'
    };
  }

  getCapabilities(): MediaTrackCapabilities {
    return {
      width: { min: 640, max: 1920 },
      height: { min: 480, max: 1080 },
      frameRate: { min: 15, max: 60 }
    };
  }

  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

describe('Camera Integration Tests', () => {
  let mockGetUserMedia: jest.Mock;
  let mockEnumerateDevices: jest.Mock;
  let mockMediaDevices: any;

  beforeEach(() => {
    // Mock getUserMedia
    mockGetUserMedia = jest.fn();
    mockEnumerateDevices = jest.fn();

    mockMediaDevices = {
      getUserMedia: mockGetUserMedia,
      enumerateDevices: mockEnumerateDevices,
      getSupportedConstraints: jest.fn(() => ({
        width: true,
        height: true,
        frameRate: true,
        facingMode: true,
        aspectRatio: true
      }))
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: mockMediaDevices,
      writable: true
    });

    // Mock HTMLVideoElement
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
    jest.clearAllMocks();
  });

  describe('Camera Permission and Access', () => {
    test('should request camera permission successfully', async () => {
      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);
      mockEnumerateDevices.mockResolvedValue([
        {
          deviceId: 'front-camera',
          kind: 'videoinput',
          label: 'Front Camera',
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
            facingMode: 'user',
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          }
        });
      });

      expect(screen.getByText(/camera active/i)).toBeInTheDocument();
    });

    test('should handle camera permission denied', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';

      mockGetUserMedia.mockRejectedValue(permissionError);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera permission denied/i)).toBeInTheDocument();
      });

      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    test('should handle no camera device available', async () => {
      const deviceError = new Error('No camera found');
      deviceError.name = 'NotFoundError';

      mockGetUserMedia.mockRejectedValue(deviceError);
      mockEnumerateDevices.mockResolvedValue([]);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/no camera available/i)).toBeInTheDocument();
      });
    });
  });

  describe('Camera Device Enumeration', () => {
    test('should enumerate multiple camera devices', async () => {
      mockEnumerateDevices.mockResolvedValue([
        {
          deviceId: 'front-camera',
          kind: 'videoinput',
          label: 'Front Camera',
          groupId: 'group1'
        },
        {
          deviceId: 'back-camera',
          kind: 'videoinput',
          label: 'Back Camera',
          groupId: 'group2'
        },
        {
          deviceId: 'external-camera',
          kind: 'videoinput',
          label: 'External USB Camera',
          groupId: 'group3'
        }
      ]);

      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);
      mockGetUserMedia.mockResolvedValue(mockStream);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(mockEnumerateDevices).toHaveBeenCalled();
      });

      // Should show camera selector with multiple options
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const selector = screen.getByRole('combobox');
      expect(selector).toHaveProperty('options.length', 3);
    });

    test('should switch between front and back cameras', async () => {
      const devices = [
        {
          deviceId: 'front-camera',
          kind: 'videoinput',
          label: 'Front Camera',
          groupId: 'group1'
        },
        {
          deviceId: 'back-camera',
          kind: 'videoinput',
          label: 'Back Camera',
          groupId: 'group2'
        }
      ];

      mockEnumerateDevices.mockResolvedValue(devices);

      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const backTrack = new MockMediaStreamTrack('video', 'Back Camera');

      mockGetUserMedia
        .mockResolvedValueOnce(new MockMediaStream([frontTrack]))
        .mockResolvedValueOnce(new MockMediaStream([backTrack]));

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Start with front camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({
              facingMode: 'user'
            })
          })
        );
      });

      // Switch to back camera
      const flipButton = screen.getByRole('button', { name: /flip/i });
      fireEvent.click(flipButton);

      await waitFor(() => {
        expect(mockGetUserMedia).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({
              facingMode: 'environment'
            })
          })
        );
      });

      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    });
  });

  describe('Photo Capture', () => {
    test('should capture photo from video stream', async () => {
      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      // Mock canvas context
      const mockContext = {
        drawImage: jest.fn(),
        getImageData: jest.fn(() => ({
          data: new Uint8ClampedArray(1920 * 1080 * 4),
          width: 1920,
          height: 1080
        }))
      };

      const mockCanvas = {
        getContext: jest.fn(() => mockContext),
        toBlob: jest.fn((callback) => {
          const mockBlob = new Blob(['mock-image-data'], { type: 'image/jpeg' });
          callback(mockBlob);
        }),
        width: 1920,
        height: 1080
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

      // Capture photo
      const captureButton = screen.getByRole('button', { name: /capture/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(onCapture).toHaveBeenCalledWith(
          expect.any(Blob),
          expect.objectContaining({
            width: 1920,
            height: 1080,
            timestamp: expect.any(Number)
          })
        );
      });

      expect(mockContext.drawImage).toHaveBeenCalled();
      expect(mockCanvas.toBlob).toHaveBeenCalled();
    });

    test('should apply photo effects before capture', async () => {
      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      const mockContext = {
        drawImage: jest.fn(),
        filter: '',
        getImageData: jest.fn(() => ({
          data: new Uint8ClampedArray(1920 * 1080 * 4),
          width: 1920,
          height: 1080
        }))
      };

      const mockCanvas = {
        getContext: jest.fn(() => mockContext),
        toBlob: jest.fn((callback) => {
          const mockBlob = new Blob(['filtered-image-data'], { type: 'image/jpeg' });
          callback(mockBlob);
        }),
        width: 1920,
        height: 1080
      };

      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} enableEffects />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Apply sepia filter
      const filterButton = screen.getByRole('button', { name: /sepia/i });
      fireEvent.click(filterButton);

      // Capture photo with filter
      const captureButton = screen.getByRole('button', { name: /capture/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(mockContext.filter).toBe('sepia(100%)');
        expect(onCapture).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle camera device disconnection', async () => {
      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Simulate device disconnection
      frontTrack.stop();
      frontTrack.readyState = 'ended';

      // Trigger ended event
      const trackEndedEvent = new Event('ended');
      frontTrack.dispatchEvent(trackEndedEvent);

      await waitFor(() => {
        expect(screen.getByText(/camera disconnected/i)).toBeInTheDocument();
      });
    });

    test('should handle insufficient lighting warning', async () => {
      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      // Mock dark image data
      const mockContext = {
        drawImage: jest.fn(),
        getImageData: jest.fn(() => {
          const data = new Uint8ClampedArray(1920 * 1080 * 4);
          // Fill with dark pixels (low brightness)
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 20;     // R
            data[i + 1] = 20; // G
            data[i + 2] = 20; // B
            data[i + 3] = 255; // A
          }
          return { data, width: 1920, height: 1080 };
        })
      };

      const mockCanvas = {
        getContext: jest.fn(() => mockContext),
        toBlob: jest.fn(),
        width: 1920,
        height: 1080
      };

      jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} enableLightingCheck />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Trigger lighting check
      const captureButton = screen.getByRole('button', { name: /capture/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(screen.getByText(/insufficient lighting/i)).toBeInTheDocument();
      });
    });

    test('should recover from temporary camera errors', async () => {
      const permissionError = new Error('Temporary error');
      permissionError.name = 'AbortError';

      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);

      mockGetUserMedia
        .mockRejectedValueOnce(permissionError)
        .mockResolvedValueOnce(mockStream);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // First attempt fails
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera error/i)).toBeInTheDocument();
      });

      // Retry button appears
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      // Second attempt succeeds
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should properly cleanup camera stream on unmount', async () => {
      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const mockStream = new MockMediaStream([frontTrack]);

      mockGetUserMedia.mockResolvedValue(mockStream);

      const onCapture = jest.fn();
      const { unmount } = render(<CameraCapture onCapture={onCapture} />);

      // Start camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Unmount component
      unmount();

      // Verify stream is stopped
      expect(frontTrack.readyState).toBe('ended');
    });

    test('should stop all tracks when switching cameras', async () => {
      const frontTrack = new MockMediaStreamTrack('video', 'Front Camera');
      const backTrack = new MockMediaStreamTrack('video', 'Back Camera');

      const frontStream = new MockMediaStream([frontTrack]);
      const backStream = new MockMediaStream([backTrack]);

      mockGetUserMedia
        .mockResolvedValueOnce(frontStream)
        .mockResolvedValueOnce(backStream);

      mockEnumerateDevices.mockResolvedValue([
        {
          deviceId: 'front-camera',
          kind: 'videoinput',
          label: 'Front Camera',
          groupId: 'group1'
        },
        {
          deviceId: 'back-camera',
          kind: 'videoinput',
          label: 'Back Camera',
          groupId: 'group2'
        }
      ]);

      const onCapture = jest.fn();
      render(<CameraCapture onCapture={onCapture} />);

      // Start with front camera
      const cameraButton = screen.getByRole('button', { name: /camera/i });
      fireEvent.click(cameraButton);

      await waitFor(() => {
        expect(screen.getByText(/camera active/i)).toBeInTheDocument();
      });

      // Switch to back camera
      const flipButton = screen.getByRole('button', { name: /flip/i });
      fireEvent.click(flipButton);

      await waitFor(() => {
        expect(frontTrack.readyState).toBe('ended');
        expect(backTrack.readyState).toBe('live');
      });
    });
  });
});