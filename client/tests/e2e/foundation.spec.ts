import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { expect, test } from './isolated-api';
import { createDatabase } from '../../../server/src/lib/database';

config({ path: '.env' });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for browser integration tests');
const database = createDatabase(databaseUrl);
const emails: string[] = [];
const password = 'Browser-test-2026!';

test.afterAll(async () => {
  for (const email of emails) {
    const user = await database.prisma.user.findUnique({ where: { email } });
    if (user) {
      await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: user.id } } });
      await database.prisma.user.delete({ where: { id: user.id } });
    }
  }
  await database.disconnect();
});

test('register, login, reload, protected navigation, logout and responsive screenshots', async ({ page }) => {
  const email = `browser-${randomUUID().slice(0, 8)}@example.test`;
  emails.push(email);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text()); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '歡迎回來' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/login-1440.png', fullPage: true, animations: 'disabled' });

  await page.getByRole('link', { name: '建立帳號' }).click();
  await expect(page.getByRole('heading', { name: '建立帳號' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/register-1440.png', fullPage: true, animations: 'disabled' });
  await page.getByLabel('姓名').fill('瀏覽器測試');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('確認密碼').fill('different-password');
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect(page.getByRole('alert')).toContainText('不一致');
  await page.getByLabel('確認密碼').fill(password);
  await page.getByRole('button', { name: '顯示密碼' }).click();
  await expect(page.getByLabel('密碼', { exact: true })).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: '隱藏密碼' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '隱藏密碼' }).click();
  await expect(page.getByRole('button', { name: '顯示密碼' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('確認密碼').press('Enter');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('註冊成功，請登入。')).toBeVisible();
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await expect(page.getByRole('heading', { name: /讓每一筆收支/ })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/dashboard-1440.png', fullPage: true, animations: 'disabled' });
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/screenshots/dashboard-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  const menu = page.getByRole('button', { name: '開啟選單' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '關閉選單' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog', { name: '主要導覽' })).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: '關閉選單' })).toBeInViewport();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/screenshots/mobile-navigation-open-390.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.sidebar').evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(0.001);
  await page.getByRole('button', { name: '關閉選單' }).click();
  await expect(page.getByRole('button', { name: '開啟選單' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: '開啟選單' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '開啟選單' })).toBeFocused();
  await page.getByRole('button', { name: '開啟選單' }).click();
  await page.getByRole('dialog', { name: '主要導覽' }).getByRole('link', { name: '交易紀錄' }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole('button', { name: '開啟選單' })).toBeFocused();
  await page.goto('/');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByRole('heading', { name: /讓每一筆收支/ })).toBeVisible();
  await page.getByRole('button', { name: '收合側邊欄' }).click();
  await expect(page.getByRole('button', { name: '展開側邊欄' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '展開側邊欄' }).click();
  await expect(page.getByRole('button', { name: '收合側邊欄' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('navigation', { name: '工作空間' }).getByRole('link', { name: '預算規劃' }).click();
  await expect(page.getByRole('heading', { name: '預算管理' })).toBeVisible();

  await page.goto('/login');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await page.getByRole('banner').getByRole('button', { name: '帳號選單' }).click();
  await page.getByRole('banner').getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: '歡迎回來' })).toBeVisible();
  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await expect(page.getByRole('heading', { name: /讓每一筆收支/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const sessionCookie = (await page.context().cookies()).find((item) => item.name === 'cashflow.sid');
  expect(sessionCookie).toBeDefined();
  const sessionId = decodeURIComponent(sessionCookie!.value).slice(2).split('.')[0]!;
  // Removing the row tests server-side revocation without a concurrent session touch renewing its expiry.
  await database.prisma.session.delete({ where: { sid: sessionId } });
  await expect.poll(async () => (await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);

  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.screenshot({ path: `docs/screenshots/login-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.goto('/register');
    await page.screenshot({ path: `docs/screenshots/register-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('keyboard navigation and invalid login', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'Email 或密碼錯誤。' } }) }));
  await page.goto('/login');
  await page.getByRole('link', { name: 'cashflow.' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email')).toBeFocused();
  await page.getByLabel('Email').fill('unknown@example.test');
  await page.getByLabel('密碼', { exact: true }).fill('invalid-password');
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Email 或密碼錯誤');
});
