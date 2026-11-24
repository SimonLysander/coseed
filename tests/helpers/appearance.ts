import { expect, type Page } from '@playwright/test';

const labels = { light: '浅色', dark: '深色' } as const;

export async function chooseAppearance(page: Page, mode: keyof typeof labels) {
  await expect(page.getByRole('button', { name: /^切换到(浅色|深色)$/ })).toBeVisible();
  if ((await page.locator('html').getAttribute('data-theme')) !== mode) {
    await page.getByRole('button', { name: `切换到${labels[mode]}`, exact: true }).click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
}
