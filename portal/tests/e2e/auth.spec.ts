import { test, expect } from '@playwright/test';

test.describe('Authentication flow', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible();
  });

  test('shows error for empty form submission', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    // Should show a validation error — not redirect away
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/required|email|password/i)).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('notreal@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword123');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('/files redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/files');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/feedback redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/feedback');
    await expect(page).toHaveURL(/\/login/);
  });
});
