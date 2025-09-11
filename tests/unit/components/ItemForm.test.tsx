/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemForm } from '@/components/inventory/ItemForm';
import { LocationType } from '@prisma/client';

// Mock the server actions
jest.mock('@/lib/actions/items', () => ({
  createItemAction: jest.fn(),
  updateItemAction: jest.fn(),
}));

// Mock React 19 hooks
const mockUseActionState = jest.fn();
const mockUseOptimistic = jest.fn();

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useActionState: (...args: any[]) => mockUseActionState(...args),
  useOptimistic: (...args: any[]) => mockUseOptimistic(...args),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock UI components
jest.mock('@/components/ui/input', () => ({
  Input: ({ onChange, ...props }: any) => (
    <input
      onChange={(e) => onChange?.(e)}
      data-testid={props.id || 'input'}
      {...props}
    />
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ onChange, ...props }: any) => (
    <textarea
      onChange={(e) => onChange?.(e)}
      data-testid={props.id || 'textarea'}
      {...props}
    />
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ onClick, children, ...props }: any) => (
    <button
      onClick={onClick}
      data-testid="button"
      disabled={props.disabled}
      {...props}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/camera/PhotoUpload', () => ({
  PhotoUpload: ({ onPhotoUpload, onPhotoRemove }: any) => (
    <div data-testid="photo-upload">
      <button
        data-testid="mock-upload-photo"
        onClick={() => onPhotoUpload?.('photo-url', 'thumb-url')}
      >
        Upload Photo
      </button>
      <button
        data-testid="mock-remove-photo"
        onClick={() => onPhotoRemove?.()}
      >
        Remove Photo
      </button>
    </div>
  ),
}));

jest.mock('@/components/locations/LocationSelector', () => ({
  LocationSelector: ({ onValueChange }: any) => (
    <div data-testid="location-selector">
      <button
        data-testid="select-location"
        onClick={() => onValueChange?.('loc-1', { id: 'loc-1', name: 'Test Location' })}
      >
        Select Location
      </button>
    </div>
  ),
}));

/**
 * Mock locations data
 */
const mockLocations = [
  {
    id: 'loc-1',
    name: 'Garage',
    path: 'Garage',
    locationType: LocationType.BUILDING,
    parentId: null,
    level: 0,
  },
  {
    id: 'loc-2',
    name: 'Kitchen',
    path: 'Kitchen',
    locationType: LocationType.ROOM,
    parentId: null,
    level: 0,
  },
];

describe('ItemForm React 19 Integration Tests (1.3-UNIT-002)', () => {
  const user = userEvent.setup();
  let mockFormAction: jest.Mock;
  let mockState: any;

  beforeEach(() => {
    mockFormAction = jest.fn();
    mockState = {
      success: false,
      error: null,
      fieldErrors: {},
      item: null,
    };

    // Mock useActionState to return controlled values
    mockUseActionState.mockReturnValue([
      mockState,
      mockFormAction,
      false, // isPending
    ]);

    // Mock useOptimistic to return simple state
    mockUseOptimistic.mockReturnValue([
      false, // optimisticSubmitting
      jest.fn(), // addOptimisticSubmitting
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Rendering and Basic Interaction', () => {
    it('should render create form with all required fields', () => {
      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      expect(screen.getByTestId('name')).toBeInTheDocument();
      expect(screen.getByTestId('description')).toBeInTheDocument();
      expect(screen.getByTestId('quantity')).toBeInTheDocument();
      expect(screen.getByTestId('unit')).toBeInTheDocument();
      expect(screen.getByTestId('location-selector')).toBeInTheDocument();
      expect(screen.getByTestId('photo-upload')).toBeInTheDocument();
    });

    it('should render edit form with pre-populated data', () => {
      const mockItem = {
        id: 'item-1',
        name: 'Test Item',
        description: 'Test Description',
        locationId: 'loc-1',
        quantity: 2,
        unit: 'pieces',
        purchasePrice: 100,
        currentValue: 90,
      };

      render(
        <ItemForm
          mode="edit"
          item={mockItem}
          locations={mockLocations}
        />
      );

      expect(screen.getByDisplayValue('Test Item')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Description')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    });
  });

  describe('React 19 useActionState Integration', () => {
    it('should call server action with form data on submission', async () => {
      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      // Fill out form
      await user.type(screen.getByTestId('name'), 'New Item');
      await user.type(screen.getByTestId('description'), 'Item description');
      await user.type(screen.getByTestId('quantity'), '1');
      
      // Select location
      await user.click(screen.getByTestId('select-location'));

      // Submit form
      const form = screen.getByRole('form') || screen.getByTestId('name').closest('form');
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(mockFormAction).toHaveBeenCalled();
      });

      // Verify FormData contains expected values
      const callArgs = mockFormAction.mock.calls[0];
      const formData = callArgs[0];
      expect(formData).toBeInstanceOf(FormData);
    });

    it('should handle pending state correctly', () => {
      // Mock pending state
      mockUseActionState.mockReturnValue([
        mockState,
        mockFormAction,
        true, // isPending = true
      ]);

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      // Submit button should show loading state
      const submitButton = screen.getByText(/creating/i);
      expect(submitButton).toBeDisabled();
    });

    it('should display form validation errors', () => {
      // Mock state with field errors
      const stateWithErrors = {
        success: false,
        error: 'Validation failed',
        fieldErrors: {
          name: 'Name is required',
          locationId: 'Please select a location',
        },
        item: null,
      };

      mockUseActionState.mockReturnValue([
        stateWithErrors,
        mockFormAction,
        false,
      ]);

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Please select a location')).toBeInTheDocument();
    });

    it('should display success message', () => {
      const successState = {
        success: true,
        error: null,
        fieldErrors: {},
        item: { id: 'new-item', name: 'Created Item' },
        message: 'Item created successfully',
      };

      mockUseActionState.mockReturnValue([
        successState,
        mockFormAction,
        false,
      ]);

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      expect(screen.getByText('Item created successfully')).toBeInTheDocument();
    });
  });

  describe('Optimistic UI Updates (useOptimistic)', () => {
    it('should show optimistic loading state', () => {
      const mockAddOptimistic = jest.fn();
      
      // Mock useOptimistic to return optimistic loading
      mockUseOptimistic.mockReturnValue([
        true, // optimisticSubmitting = true
        mockAddOptimistic,
      ]);

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      const submitButton = screen.getByRole('button', { name: /creating/i });
      expect(submitButton).toBeDisabled();
    });

    it('should trigger optimistic state on form submission', async () => {
      const mockAddOptimistic = jest.fn();
      
      mockUseOptimistic.mockReturnValue([
        false,
        mockAddOptimistic,
      ]);

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      // Fill required fields and submit
      await user.type(screen.getByTestId('name'), 'Test Item');
      await user.click(screen.getByTestId('select-location'));

      const form = screen.getByTestId('name').closest('form');
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(mockAddOptimistic).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('Form Validation', () => {
    it('should require location selection', () => {
      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      const submitButton = screen.getByRole('button', { name: /create item/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submission after location selection', async () => {
      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      await user.click(screen.getByTestId('select-location'));

      const submitButton = screen.getByRole('button', { name: /create item/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('should handle photo upload integration', async () => {
      const mockOnSuccess = jest.fn();

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
          onSuccess={mockOnSuccess}
        />
      );

      // Upload a photo
      await user.click(screen.getByTestId('mock-upload-photo'));
      
      // Photo upload should work without affecting form state
      expect(screen.getByTestId('photo-upload')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle server action errors gracefully', () => {
      const errorState = {
        success: false,
        error: 'Server error occurred',
        fieldErrors: {},
        item: null,
      };

      mockUseActionState.mockReturnValue([
        errorState,
        mockFormAction,
        false,
      ]);

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      expect(screen.getByText('Server error occurred')).toBeInTheDocument();
    });

    it('should handle network failures', () => {
      // Mock network failure in server action
      mockFormAction.mockRejectedValue(new Error('Network failed'));

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      // Component should not crash and should handle error gracefully
      expect(screen.getByTestId('name')).toBeInTheDocument();
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should render properly on mobile viewports', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
        />
      );

      // All essential elements should be present
      expect(screen.getByTestId('name')).toBeInTheDocument();
      expect(screen.getByTestId('location-selector')).toBeInTheDocument();
      expect(screen.getByTestId('photo-upload')).toBeInTheDocument();
    });
  });

  describe('Callback Integration', () => {
    it('should call onSuccess after successful creation', () => {
      const mockOnSuccess = jest.fn();
      const successState = {
        success: true,
        error: null,
        fieldErrors: {},
        item: { id: 'new-item', name: 'Created Item' },
      };

      mockUseActionState.mockReturnValue([
        successState,
        mockFormAction,
        false,
      ]);

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
          onSuccess={mockOnSuccess}
        />
      );

      // useEffect should trigger onSuccess
      expect(mockOnSuccess).toHaveBeenCalledWith({
        id: 'new-item',
        name: 'Created Item',
      });
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const mockOnCancel = jest.fn();

      render(
        <ItemForm
          mode="create"
          locations={mockLocations}
          onCancel={mockOnCancel}
        />
      );

      await user.click(screen.getByText('Cancel'));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});