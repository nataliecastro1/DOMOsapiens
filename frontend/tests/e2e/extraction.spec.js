import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Extraction Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass login
    await page.goto('/');
    await page.getByRole('button', { name: 'DEV Mode (Bypass)' }).click();
    await expect(page.locator('.topbar-ctx')).toContainText('/ ROI Extraction');
  });

  test('should load the Upload step', async ({ page }) => {
    await expect(page.locator('.topbar-ctx')).toContainText('/ ROI Extraction');
    const html = await page.innerHTML('body');
    console.log(html);
    // Should see Step 1 active
    await expect(page.locator('.journey-step.active')).toContainText('Request');
  });

  test('should allow dragging a file', async ({ page }) => {
    // We just verify the drop zone is visible and interactive
    const dropzone = page.locator('.upload-dropzone');
    await expect(dropzone).toBeVisible();
    await expect(dropzone).toContainText('Drag & drop additional files');
  });
});
