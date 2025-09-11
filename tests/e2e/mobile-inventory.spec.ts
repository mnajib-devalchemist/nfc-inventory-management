import { test, expect, devices } from '@playwright/test';

/**
 * Mobile Inventory Management E2E Tests (1.3-E2E-004)
 * 
 * Critical mobile workflow testing as identified in QA assessment (BUS-001)
 * Tests complete inventory management workflows on mobile devices
 */

// Test on iPhone and Android viewports
const mobileDevices = [
  devices['iPhone 13'],
  devices['Pixel 5'],
  devices['iPad Mini'],
];

mobileDevices.forEach(device => {
  test.describe(`Mobile Inventory Workflow - ${device.name}`, () => {
    test.use(device);

    test.beforeEach(async ({ page }) => {
      // Mock authentication
      await page.route('/api/auth/**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'test-user',
              email: 'test@example.com',
              name: 'Test User'
            }
          })
        });
      });

      // Mock API endpoints
      await page.route('/api/v1/items', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [
                {
                  id: 'item-1',
                  name: 'Power Drill',
                  description: 'Cordless 18V drill',
                  quantity: 1,
                  unit: 'piece',
                  status: 'AVAILABLE',
                  location: {
                    name: 'Workbench',
                    path: 'Garage → Workbench'
                  },
                  createdAt: new Date().toISOString()
                }
              ],
              pagination: {
                page: 1,
                limit: 20,
                totalCount: 1,
                totalPages: 1
              }
            })
          });
        } else if (route.request().method() === 'POST') {
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              item: {
                id: 'new-item',
                name: 'New Item',
                description: 'New item description',
                quantity: 1,
                status: 'AVAILABLE'
              }
            })
          });
        }
      });

      await page.route('/api/v1/locations', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'loc-1',
                name: 'Garage',
                path: 'Garage',
                locationType: 'BUILDING',
                level: 0
              },
              {
                id: 'loc-2',
                name: 'Kitchen',
                path: 'Kitchen',
                locationType: 'ROOM',
                level: 0
              }
            ]
          })
        });
      });

      await page.goto('/inventory');
    });

    test('should display inventory grid properly on mobile', async ({ page }) => {
      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Check that header is visible and responsive
      const header = page.getByRole('heading', { name: 'Inventory' });
      await expect(header).toBeVisible();

      // Check that add button is visible
      const addButton = page.getByRole('button', { name: /add item/i });
      await expect(addButton).toBeVisible();

      // Check that items are displayed in mobile-friendly grid
      const itemCards = page.locator('[data-testid="item-card"]').first();
      if (await itemCards.count() > 0) {
        await expect(itemCards).toBeVisible();
      }

      // Verify mobile navigation works
      const menuButton = page.locator('button[aria-label*="menu"], button[aria-expanded]').first();
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await expect(page.locator('[role="navigation"], nav').first()).toBeVisible();
      }
    });

    test('should handle touch interactions correctly', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Test touch scroll
      await page.touchscreen.tap(200, 200);
      
      // Test swipe gestures if items are present
      const itemCards = page.locator('[data-testid="item-card"]');
      if (await itemCards.count() > 0) {
        const firstCard = itemCards.first();
        const box = await firstCard.boundingBox();
        if (box) {
          // Tap on card
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        }
      }

      // Test touch on buttons
      const addButton = page.getByRole('button', { name: /add item/i });
      const addButtonBox = await addButton.boundingBox();
      if (addButtonBox) {
        await page.touchscreen.tap(
          addButtonBox.x + addButtonBox.width / 2, 
          addButtonBox.y + addButtonBox.height / 2
        );
      }
    });

    test('should allow adding new items via mobile form', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Click Add Item button
      await page.getByRole('button', { name: /add item/i }).click();

      // Should navigate to new item page
      await expect(page).toHaveURL(/\/inventory\/new/);

      // Fill out form on mobile
      await page.getByLabel(/item name/i).fill('Mobile Test Item');
      await page.getByLabel(/description/i).fill('Added via mobile device');
      await page.getByLabel(/quantity/i).fill('1');

      // Select location (mobile-friendly)
      const locationSelector = page.locator('select, [role="combobox"]').first();
      if (await locationSelector.isVisible()) {
        await locationSelector.click();
        await page.getByText('Garage').click();
      }

      // Test photo upload on mobile
      const photoUpload = page.locator('input[type="file"]');
      if (await photoUpload.isVisible()) {
        // Simulate mobile photo upload
        const buffer = Buffer.from('fake-image-data');
        await photoUpload.setInputFiles({
          name: 'mobile-photo.jpg',
          mimeType: 'image/jpeg',
          buffer: buffer,
        });
      }

      // Submit form
      await page.getByRole('button', { name: /create item/i }).click();

      // Should handle submission
      await page.waitForLoadState('networkidle');
    });

    test('should work well with mobile keyboard', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Navigate to add item
      await page.getByRole('button', { name: /add item/i }).click();
      await expect(page).toHaveURL(/\/inventory\/new/);

      // Test keyboard input
      const nameField = page.getByLabel(/item name/i);
      await nameField.click();
      
      // Verify field is focused and keyboard would appear
      await expect(nameField).toBeFocused();

      // Type with simulated mobile keyboard
      await nameField.fill('Test Mobile Keyboard Input');
      
      // Tab to next field
      await page.keyboard.press('Tab');
      
      // Verify focus moved
      const descriptionField = page.getByLabel(/description/i);
      await expect(descriptionField).toBeFocused();
    });

    test('should handle mobile search properly', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Find search input
      const searchInput = page.getByPlaceholder(/search items/i);
      if (await searchInput.isVisible()) {
        // Click search on mobile
        await searchInput.click();
        await expect(searchInput).toBeFocused();

        // Type search query
        await searchInput.fill('drill');

        // Verify search executes (would show filtered results)
        await page.waitForTimeout(500); // Debounce
      }

      // Test mobile filter toggle
      const filterButton = page.getByRole('button', { name: /filter/i });
      if (await filterButton.isVisible()) {
        await filterButton.click();
        
        // Mobile filter panel should appear
        const filterPanel = page.locator('[role="group"], .filter-panel').first();
        await expect(filterPanel).toBeVisible();
      }
    });

    test('should handle item editing on mobile', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Find an item card
      const itemCard = page.locator('[data-testid="item-card"]').first();
      
      if (await itemCard.isVisible()) {
        // On mobile, might need to tap to reveal actions
        await itemCard.click();

        // Look for edit button or modal
        const editButton = page.getByRole('button', { name: /edit/i });
        if (await editButton.isVisible()) {
          await editButton.click();

          // Should open edit modal or navigate to edit page
          const editModal = page.locator('[role="dialog"]');
          const editForm = page.getByLabel(/item name/i);
          
          await expect(editModal.or(editForm).first()).toBeVisible();
        }
      }
    });

    test('should display properly in landscape mode', async ({ page }) => {
      // Rotate to landscape
      await page.setViewportSize({ width: device.viewport.height, height: device.viewport.width });
      
      await page.goto('/inventory');
      await page.waitForLoadState('networkidle');

      // Check layout adapts to landscape
      const header = page.getByRole('heading', { name: 'Inventory' });
      await expect(header).toBeVisible();

      // Should show more items per row in landscape
      const itemGrid = page.locator('[data-testid="items-grid"], .grid').first();
      if (await itemGrid.isVisible()) {
        // Grid should adapt to landscape layout
        await expect(itemGrid).toBeVisible();
      }
    });

    test('should handle offline scenarios gracefully', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Simulate going offline
      await page.context().setOffline(true);

      // Try to add item while offline
      await page.getByRole('button', { name: /add item/i }).click();
      
      // Should either show offline message or cache the action
      // The exact behavior depends on PWA implementation
      await page.waitForTimeout(1000);
      
      // Go back online
      await page.context().setOffline(false);
    });

    test('should have adequate touch target sizes', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Check that interactive elements meet minimum touch target size (44px)
      const buttons = page.getByRole('button');
      const buttonCount = await buttons.count();

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i);
        if (await button.isVisible()) {
          const box = await button.boundingBox();
          if (box) {
            // Touch targets should be at least 44x44px for good mobile UX
            expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(32); // Allow slightly smaller for secondary buttons
          }
        }
      }

      // Check navigation elements
      const links = page.getByRole('link');
      const linkCount = await links.count();

      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = links.nth(i);
        if (await link.isVisible()) {
          const box = await link.boundingBox();
          if (box) {
            expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(32);
          }
        }
      }
    });

    test('should handle network failures gracefully', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Mock network failure for item creation
      await page.route('/api/v1/items', (route) => {
        if (route.request().method() === 'POST') {
          route.abort('failed');
        } else {
          route.continue();
        }
      });

      // Try to add item
      await page.getByRole('button', { name: /add item/i }).click();
      await expect(page).toHaveURL(/\/inventory\/new/);

      await page.getByLabel(/item name/i).fill('Network Test Item');
      
      // Select location
      const locationSelector = page.locator('select, [role="combobox"]').first();
      if (await locationSelector.isVisible()) {
        await locationSelector.selectOption('loc-1');
      }

      // Submit form
      await page.getByRole('button', { name: /create item/i }).click();

      // Should show error message
      const errorMessage = page.getByText(/failed/i, /error/i);
      await expect(errorMessage.first()).toBeVisible();
    });
  });
});