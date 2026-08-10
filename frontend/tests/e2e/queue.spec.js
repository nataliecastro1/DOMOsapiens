import { test, expect } from '@playwright/test';

test.describe('Extraction Queue Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // We are usually auto-authenticated in local dev, but if the login screen is showing, bypass it.
    const bypassBtn = page.getByRole('button', { name: 'DEV Mode (Bypass)' });
    if (await bypassBtn.isVisible()) {
      await bypassBtn.click();
    }
    await expect(page.locator('.topbar-ctx')).toContainText('/ ROI Extraction', { timeout: 10000 });
  });

  test('should display the empty queue state', async ({ page }) => {
    // Mock the jobs endpoint to return an empty array
    await page.route('**/api/extract/jobs', async (route) => {
      await route.fulfill({ json: [] });
    });

    // Navigate to the Queue
    await page.goto('/queue');
    
    // Check titles
    await expect(page.locator('h2')).toContainText('Extraction Queue');
    await expect(page.locator('table')).toContainText('Your queue is empty.');
  });

  test('should display jobs in the queue and allow review', async ({ page }) => {
    // Mock the jobs endpoint to return some mock jobs
    await page.route('**/api/extract/jobs', async (route) => {
      await route.fulfill({
        json: [
          {
            job_id: 'job-123',
            status: 'COMPLETED',
            file_path: '/documents/fake_report.pdf',
            original_filename: 'fake_report.pdf',
            created_at: new Date().toISOString(),
            result_data: { some_field: 123 },
            error_message: null
          },
          {
            job_id: 'job-456',
            status: 'PROCESSING',
            file_path: '/documents/another.pdf',
            original_filename: 'another.pdf',
            created_at: new Date().toISOString(),
            result_data: null,
            error_message: null
          }
        ]
      });
    });

    // Navigate to the Queue
    await page.goto('/queue');

    // Should see two rows
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    // First row is completed
    await expect(rows.nth(0)).toContainText('Ready for Review');
    await expect(rows.nth(0)).toContainText('fake_report.pdf');

    // Second row is processing
    await expect(rows.nth(1)).toContainText('Processing');
    await expect(rows.nth(1)).toContainText('another.pdf');

    // Click Review on the completed job
    await rows.nth(0).locator('button', { name: 'Review' }).click();

    // Should navigate to extraction view Review step (Step 4)
    await expect(page.locator('.journey-step.active')).toContainText('Review');
    try {
      await expect(page.locator('.compare-card')).toContainText('fake_report.pdf', { timeout: 2000 });
    } catch (e) {
      await page.screenshot({ path: 'queue-failure.png', fullPage: true });
      throw e;
    }
  });
});
