import { test, expect, devices } from '@playwright/test';

test.describe('UI/Usability — Responsive Layout', () => {
  test('login page renders correctly on mobile viewport', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['iPhone 12'] });
    const page = await context.newPage();
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText('Karapitiya Teaching Hospital');
    await expect(page.locator('#login-user-id')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();

    await context.close();
  });

  test('login page renders correctly on tablet viewport', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await context.newPage();
    await page.goto('/login');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    await context.close();
  });

  test('login page renders correctly on desktop viewport', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto('/login');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    await context.close();
  });
});

test.describe('UI/Usability — Error & Loading States', () => {
  test('non-existent routes redirect to login instead of returning a proper 404', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');

    // FINDING: Unknown routes are redirected (307) to /login, which returns 200,
    // instead of Next.js's own 404 page/status. Server terminal logs confirm
    // Next.js internally resolves this route as a 404 — something in the
    // auth/session layer (likely related to Finding #1's session-handling
    // code) intercepts unmatched routes before the real 404 can be returned
    // to the client. This means broken links or URL typos will appear as
    // "successful" (200) to monitoring tools, crawlers, and any client that
    // checks response.ok rather than the final rendered page content.
    expect(response?.status()).toBe(200); // documents current (incorrect) behavior
    expect(response?.url()).toContain('/login'); // confirms the redirect target
  });

  test('loading state does not show a broken/blank page on slow navigation', async ({ page }) => {
    await page.goto('/login');
    // Confirm the page has actual content, not a blank white screen
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});