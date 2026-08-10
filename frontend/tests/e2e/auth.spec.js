import { test, expect } from '@playwright/test';

test.describe('Authentication & Handoff', () => {
  test('should show sign-in required screen when not authenticated', async ({ page }) => {
    // Clear localStorage to ensure a clean state
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/');

    // Verify the "Sign-in required" screen
    await expect(page.locator('.login-title')).toHaveText('Sign-in required');
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'DEV Mode (Bypass)' })).toBeVisible();
  });

  test('should bypass login using DEV Mode button', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/');

    // Click DEV Mode button
    await page.getByRole('button', { name: 'DEV Mode (Bypass)' }).click();

    // Should redirect to extraction view
    await expect(page.locator('.topbar-ctx')).toHaveText('/ ROI Extraction');
    
    // Check localStorage was populated with mock Hub Context
    const hubContext = await page.evaluate(() => ({
      client_name: window.localStorage.getItem('hub_client_name'),
      deliverable_id: window.localStorage.getItem('hub_deliverable_id'),
    }));

    expect(hubContext.client_name).toBe('Anglepoint Demo');
    expect(hubContext.deliverable_id).toBe('dev-deliv-1234');
  });
});
