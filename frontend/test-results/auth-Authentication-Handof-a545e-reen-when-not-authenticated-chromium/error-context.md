# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.js >> Authentication & Handoff >> should show sign-in required screen when not authenticated
- Location: tests\e2e\auth.spec.js:4:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('.login-title')
Expected: "Sign-in required"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for locator('.login-title')

```

```yaml
- link "Anglepoint":
  - /url: "#"
  - img "Anglepoint"
- text: / ROI Extraction
- button "CD Christina D. "
- navigation "Main navigation":
  - text: Tools
  - link "ROI Extraction":
    - /url: /extract
  - link "Queue":
    - /url: /queue
  - link "Dashboards":
    - /url: /dashboards
  - link "Help & Docs":
    - /url: /help
  - link "Settings":
    - /url: /settings
- main:
  - text: ROI Report Extraction Extract, validate, and store client ROI data
  - list "Extraction pipeline":
    - listitem: Request
    - listitem: SME Validate
    - listitem: Review
    - listitem: Done
  - text: Primary Deliverable File  No Primary File Attached This deliverable does not have a primary file in the Hub. You can upload files manually in the Additional Documents zone. Additional Documents 0/5 Drag and drop supplementary files (e.g., raw data sheets, email exports) to extract along with the main deliverable. Drag & drop additional files or click to browse · PDF, PPTX, XLSX
  - button "Continue Extraction" [disabled]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Authentication & Handoff', () => {
  4  |   test('should show sign-in required screen when not authenticated', async ({ page }) => {
  5  |     // Clear localStorage to ensure a clean state
  6  |     await page.addInitScript(() => window.localStorage.clear());
  7  |     await page.goto('/');
  8  | 
  9  |     // Verify the "Sign-in required" screen
> 10 |     await expect(page.locator('.login-title')).toHaveText('Sign-in required');
     |                                                ^ Error: expect(locator).toHaveText(expected) failed
  11 |     await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  12 |     await expect(page.getByRole('button', { name: 'DEV Mode (Bypass)' })).toBeVisible();
  13 |   });
  14 | 
  15 |   test('should bypass login using DEV Mode button', async ({ page }) => {
  16 |     await page.addInitScript(() => window.localStorage.clear());
  17 |     await page.goto('/');
  18 | 
  19 |     // Click DEV Mode button
  20 |     await page.getByRole('button', { name: 'DEV Mode (Bypass)' }).click();
  21 | 
  22 |     // Should redirect to extraction view
  23 |     await expect(page.locator('.topbar-ctx')).toHaveText('/ ROI Extraction');
  24 |     
  25 |     // Check localStorage was populated with mock Hub Context
  26 |     const hubContext = await page.evaluate(() => ({
  27 |       client_name: window.localStorage.getItem('hub_client_name'),
  28 |       deliverable_id: window.localStorage.getItem('hub_deliverable_id'),
  29 |     }));
  30 | 
  31 |     expect(hubContext.client_name).toBe('Anglepoint Demo');
  32 |     expect(hubContext.deliverable_id).toBe('dev-deliv-1234');
  33 |   });
  34 | });
  35 | 
```