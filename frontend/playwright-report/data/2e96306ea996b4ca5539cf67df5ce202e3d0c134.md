# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extraction.spec.js >> Extraction Pipeline >> should allow dragging a file
- Location: tests\e2e\extraction.spec.js:21:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'DEV Mode (Bypass)' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - link [ref=e5] [cursor=pointer]:
      - /url: "#"
      - img "Anglepoint" [ref=e6]
    - generic [ref=e7]: / ROI Extraction
    - button "CD Christina D. " [ref=e9] [cursor=pointer]:
      - generic [ref=e10]: CD
      - generic [ref=e11]: Christina D.
      - generic [ref=e12]: 
  - generic [ref=e13]:
    - navigation "Main navigation" [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: Tools
        - link "ROI Extraction" [ref=e17] [cursor=pointer]:
          - /url: /extract
          - generic [ref=e18]: 
        - link "Queue" [ref=e20] [cursor=pointer]:
          - /url: /queue
          - generic [ref=e21]: 
        - link "Dashboards" [ref=e23] [cursor=pointer]:
          - /url: /dashboards
          - generic [ref=e24]: 
      - generic [ref=e26]:
        - link "Help & Docs" [ref=e27] [cursor=pointer]:
          - /url: /help
          - generic [ref=e28]: 欄
        - link "Settings" [ref=e30] [cursor=pointer]:
          - /url: /settings
          - generic [ref=e31]: 
    - main [ref=e33]:
      - generic [ref=e35]:
        - generic [ref=e36]: ROI Report Extraction
        - generic [ref=e37]: Extract, validate, and store client ROI data
      - generic [ref=e38]:
        - list "Extraction pipeline" [ref=e39]:
          - listitem [ref=e40]:
            - generic [ref=e41]: 
            - generic [ref=e43]: Request
          - listitem [ref=e45]:
            - generic [ref=e46]: 
            - generic [ref=e48]: SME Validate
          - listitem [ref=e50]:
            - generic [ref=e51]: 
            - generic [ref=e53]: Review
          - listitem [ref=e55]:
            - generic [ref=e56]: 
            - generic [ref=e58]: Done
        - generic [ref=e59]:
          - generic [ref=e60]:
            - generic [ref=e61]:
              - generic [ref=e62]:
                - generic [ref=e63]: 
                - text: Primary Deliverable File
              - generic [ref=e65]:
                - generic [ref=e66]: 
                - generic [ref=e67]: No Primary File Attached
                - generic [ref=e68]: This deliverable does not have a primary file in the Hub.You can upload files manually in the Additional Documents zone.
            - generic [ref=e69]:
              - generic [ref=e70]:
                - generic [ref=e71]: 
                - text: Additional Documents
                - generic [ref=e72]: 0/5
              - generic [ref=e73]: Drag and drop supplementary files (e.g., raw data sheets, email exports) to extract along with the main deliverable.
              - generic [ref=e74] [cursor=pointer]:
                - generic [ref=e75]: 
                - generic [ref=e76]: Drag & drop additional files
                - generic [ref=e77]: or click to browse · PDF, PPTX, XLSX
          - generic [ref=e78]:
            - button "Continue Extraction" [disabled]:
              - text: Continue Extraction
              - generic: 
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import fs from 'fs';
  3  | import path from 'path';
  4  | 
  5  | test.describe('Extraction Pipeline', () => {
  6  |   test.beforeEach(async ({ page }) => {
  7  |     // Bypass login
  8  |     await page.goto('/');
> 9  |     await page.getByRole('button', { name: 'DEV Mode (Bypass)' }).click();
     |                                                                   ^ Error: locator.click: Test timeout of 30000ms exceeded.
  10 |     await expect(page.locator('.topbar-ctx')).toContainText('/ ROI Extraction');
  11 |   });
  12 | 
  13 |   test('should load the Upload step', async ({ page }) => {
  14 |     await expect(page.locator('.topbar-ctx')).toContainText('/ ROI Extraction');
  15 |     const html = await page.innerHTML('body');
  16 |     console.log(html);
  17 |     // Should see Step 1 active
  18 |     await expect(page.locator('.journey-step.active')).toContainText('Request');
  19 |   });
  20 | 
  21 |   test('should allow dragging a file', async ({ page }) => {
  22 |     // We just verify the drop zone is visible and interactive
  23 |     const dropzone = page.locator('.upload-dropzone');
  24 |     await expect(dropzone).toBeVisible();
  25 |     await expect(dropzone).toContainText('Drag & drop additional files');
  26 |   });
  27 | });
  28 | 
```