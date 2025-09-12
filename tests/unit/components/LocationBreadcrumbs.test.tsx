/**
 * LocationBreadcrumbs Component Tests
 * 
 * Comprehensive tests for the LocationBreadcrumbs component including
 * navigation functionality, accessibility, and truncation behavior.
 * 
 * @category Tests
 * @subcategory Components
 * @since 1.5.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationBreadcrumbs } from '@/components/locations/LocationBreadcrumbs';
import type { LocationPathComponent } from '@/components/locations/LocationBreadcrumbs';

describe('LocationBreadcrumbs', () => {
  const mockPathComponents: LocationPathComponent[] = [
    { id: '1', name: 'House' },
    { id: '2', name: 'Garage' },
    { id: '3', name: 'Workbench' },
    { id: '4', name: 'Tool Cabinet' }
  ];

  const mockOnLocationClick = jest.fn();

  beforeEach(() => {
    mockOnLocationClick.mockClear();
  });

  describe('Basic Rendering', () => {
    it('should render breadcrumb navigation', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          onLocationClick={mockOnLocationClick}
        />
      );

      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByText('House')).toBeInTheDocument();
      expect(screen.getByText('Garage')).toBeInTheDocument();
      expect(screen.getByText('Workbench')).toBeInTheDocument();
      expect(screen.getByText('Tool Cabinet')).toBeInTheDocument();
    });

    it('should render with proper ARIA attributes', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          ariaLabel="Custom breadcrumb label"
        />
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Custom breadcrumb label');
      
      const breadcrumbList = screen.getByRole('list');
      expect(breadcrumbList).toBeInTheDocument();
    });

    it('should render nothing when no path components provided', () => {
      const { container } = render(
        <LocationBreadcrumbs pathComponents={[]} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render home icon for first location when enabled', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          showHomeIcon={true}
        />
      );

      // First item should have home icon
      const firstButton = screen.getAllByRole('button')[0];
      expect(firstButton).toBeInTheDocument();
    });
  });

  describe('Navigation Functionality', () => {
    it('should call onLocationClick when breadcrumb is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          onLocationClick={mockOnLocationClick}
          interactive={true}
        />
      );

      const garageButton = screen.getByRole('button', { name: /garage/i });
      await user.click(garageButton);

      expect(mockOnLocationClick).toHaveBeenCalledWith('2', 'Garage');
    });

    it('should not make last item clickable by default', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          onLocationClick={mockOnLocationClick}
          interactive={true}
        />
      );

      // Last item should not be a button
      expect(screen.queryByRole('button', { name: /tool cabinet/i })).not.toBeInTheDocument();
      
      // Should still display the text
      expect(screen.getByText('Tool Cabinet')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          onLocationClick={mockOnLocationClick}
          interactive={true}
        />
      );

      const garageButton = screen.getByRole('button', { name: /garage/i });
      
      // Test Enter key
      garageButton.focus();
      await user.keyboard('{Enter}');
      expect(mockOnLocationClick).toHaveBeenCalledWith('2', 'Garage');

      mockOnLocationClick.mockClear();

      // Test Space key
      await user.keyboard(' ');
      expect(mockOnLocationClick).toHaveBeenCalledWith('2', 'Garage');
    });

    it('should not be interactive when disabled', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          onLocationClick={mockOnLocationClick}
          interactive={false}
        />
      );

      // Should not have any clickable buttons
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Truncation Behavior', () => {
    const longPathComponents: LocationPathComponent[] = [
      { id: '1', name: 'House' },
      { id: '2', name: 'Garage' },
      { id: '3', name: 'Storage Area' },
      { id: '4', name: 'Workbench' },
      { id: '5', name: 'Tool Cabinet' },
      { id: '6', name: 'Drawer 1' }
    ];

    it('should truncate long paths and show ellipsis', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={longPathComponents}
          maxComponents={4}
          onLocationClick={mockOnLocationClick}
        />
      );

      // Should show: House → ... → Tool Cabinet → Drawer 1
      expect(screen.getByText('House')).toBeInTheDocument();
      expect(screen.getByText('...')).toBeInTheDocument();
      expect(screen.getByText('Tool Cabinet')).toBeInTheDocument();
      expect(screen.getByText('Drawer 1')).toBeInTheDocument();
      
      // Should not show middle components
      expect(screen.queryByText('Garage')).not.toBeInTheDocument();
      expect(screen.queryByText('Storage Area')).not.toBeInTheDocument();
    });

    it('should not truncate when path is within limit', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          maxComponents={5}
          onLocationClick={mockOnLocationClick}
        />
      );

      // All components should be visible
      expect(screen.getByText('House')).toBeInTheDocument();
      expect(screen.getByText('Garage')).toBeInTheDocument();
      expect(screen.getByText('Workbench')).toBeInTheDocument();
      expect(screen.getByText('Tool Cabinet')).toBeInTheDocument();
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });

    it('should handle single component path', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={[{ id: '1', name: 'Single Location' }]}
          onLocationClick={mockOnLocationClick}
        />
      );

      expect(screen.getByText('Single Location')).toBeInTheDocument();
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA current for last item', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          onLocationClick={mockOnLocationClick}
        />
      );

      const lastItem = screen.getByText('Tool Cabinet').closest('[aria-current]');
      expect(lastItem).toHaveAttribute('aria-current', 'location');
    });

    it('should provide screen reader summary', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
        />
      );

      expect(screen.getByText('Location path: House → Garage → Workbench → Tool Cabinet')).toBeInTheDocument();
    });

    it('should have proper role and aria-label for ellipsis', () => {
      const longPath = Array.from({ length: 6 }, (_, i) => ({
        id: String(i + 1),
        name: `Location ${i + 1}`
      }));

      render(
        <LocationBreadcrumbs 
          pathComponents={longPath}
          maxComponents={3}
        />
      );

      const ellipsis = screen.getByLabelText('Additional locations not shown');
      expect(ellipsis).toBeInTheDocument();
    });
  });

  describe('Customization Options', () => {
    it('should support custom separator', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          separator={<span data-testid="custom-separator">/</span>}
        />
      );

      const separators = screen.getAllByTestId('custom-separator');
      expect(separators).toHaveLength(3); // n-1 separators for n items
    });

    it('should support different size variants', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          size="lg"
          className="test-breadcrumbs"
        />
      );

      const breadcrumbs = screen.getByRole('navigation');
      expect(breadcrumbs).toHaveClass('text-base', 'gap-3');
    });

    it('should support custom className', () => {
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          className="custom-breadcrumbs"
        />
      );

      const breadcrumbs = screen.getByRole('navigation');
      expect(breadcrumbs).toHaveClass('custom-breadcrumbs');
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined pathComponents gracefully', () => {
      const { container } = render(
        <LocationBreadcrumbs pathComponents={undefined as any} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle components with empty names', () => {
      const componentsWithEmpty: LocationPathComponent[] = [
        { id: '1', name: 'House' },
        { id: '2', name: '' }, // Empty name
        { id: '3', name: 'Garage' }
      ];

      render(
        <LocationBreadcrumbs 
          pathComponents={componentsWithEmpty}
          onLocationClick={mockOnLocationClick}
        />
      );

      expect(screen.getByText('House')).toBeInTheDocument();
      expect(screen.getByText('Garage')).toBeInTheDocument();
      // Empty name should still render but be empty
      const emptySpan = screen.getByRole('button', { name: '' });
      expect(emptySpan).toBeInTheDocument();
    });
  });

  describe('Integration Tests', () => {
    it('should work with very long location names', () => {
      const longNameComponents: LocationPathComponent[] = [
        { id: '1', name: 'Very Long Location Name That Might Cause Layout Issues' },
        { id: '2', name: 'Another Extremely Long Location Name That Tests Text Overflow' }
      ];

      render(
        <LocationBreadcrumbs 
          pathComponents={longNameComponents}
          onLocationClick={mockOnLocationClick}
        />
      );

      expect(screen.getByText('Very Long Location Name That Might Cause Layout Issues')).toBeInTheDocument();
      expect(screen.getByText('Another Extremely Long Location Name That Tests Text Overflow')).toBeInTheDocument();
    });

    it('should handle rapid clicking without errors', async () => {
      const user = userEvent.setup();
      
      render(
        <LocationBreadcrumbs 
          pathComponents={mockPathComponents}
          onLocationClick={mockOnLocationClick}
          interactive={true}
        />
      );

      const garageButton = screen.getByRole('button', { name: /garage/i });
      
      // Rapid clicks
      await user.click(garageButton);
      await user.click(garageButton);
      await user.click(garageButton);

      expect(mockOnLocationClick).toHaveBeenCalledTimes(3);
      expect(mockOnLocationClick).toHaveBeenCalledWith('2', 'Garage');
    });
  });
});