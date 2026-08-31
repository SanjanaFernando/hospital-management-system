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
test('shows a proper 404 for a non-existent route', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
});

  test('loading state does not show a broken/blank page on slow navigation', async ({ page }) => {
    await page.goto('/login');
    // Confirm the page has actual content, not a blank white screen
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});