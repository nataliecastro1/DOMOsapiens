import { test, expect } from '@playwright/test';

test.describe('Dashboards & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass login
    await page.goto('/');
    await page.getByRole('button', { name: 'DEV Mode (Bypass)' }).click();
    
    // Navigate to dashboards via sidebar
    await page.getByRole('link', { name: 'Dashboards', exact: true }).click();
  });

  test('should load the Dashboards view', async ({ page }) => {
    // Verify Dashboards view is rendered
    await expect(page.locator('.topbar-ctx')).toContainText('Dashboards');
  });

  test('should interact with dashboard templates', async ({ page }) => {
    // Click on "Full client history" template
    const fullHistoryCard = page.locator('.template-card', { hasText: 'Full client history' });
    if (await fullHistoryCard.isVisible()) {
      await fullHistoryCard.click();
      
      // A dashboard view container should now be visible
      await expect(page.locator('.dash-container')).toBeVisible();
    }
  });
});
