import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test('renders all expected elements', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText('Karapitiya Teaching Hospital');
    await expect(page.locator('#login-user-id')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('Sign In button is disabled until both fields are filled', async ({ page }) => {
    await page.goto('/login');
    const signInButton = page.getByRole('button', { name: 'Sign In' });

    await expect(signInButton).toBeDisabled();

    await page.locator('#login-user-id').fill('100000');
    await page.locator('#login-password').fill('somepassword');

    await expect(signInButton).toBeEnabled();
  });

  test('shows an error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#login-user-id').fill('999999');
    await page.locator('#login-password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 });
  });

  test('consultant_doctor can log in successfully and reach the dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#login-user-id').fill(process.env.TEST_USER_ID!);
    await page.locator('#login-password').fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Adjust this once you confirm what the dashboard URL/element actually looks like
    await expect(page).toHaveURL('/', { timeout: 10000 });
  });
});