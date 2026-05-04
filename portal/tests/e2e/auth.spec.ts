import { test, expect } from '@playwright/test';

test.describe('Authentication flow', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/login');
    // Use exact-match labels — the page also has a "Forgot password?" link
    // and a separate forgot-password form, so loose regex hits multiple
    // elements in strict mode.
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('shows validation error for empty form submission', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/login/);
    // LoginForm shows specific per-field errors; assert the email one.
    await expect(page.getByText(/email is required/i)).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('notreal@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrongpassword123');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible({ timeout: 5000 });
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
