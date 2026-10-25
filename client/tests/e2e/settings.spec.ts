import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { expect, test } from '@playwright/test';
import { createApp } from '../../../server/src/app';
import { parseEnv } from '../../../server/src/config/env';
import { createDatabase } from '../../../server/src/lib/database';

config({ path: '.env' });
const env = parseEnv();
const database = createDatabase(env.DATABASE_URL);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const Store = connectPgSimple(session);
const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: false });
const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
const apiServer = createServer(app);
let apiPort: number;
const emailA = `settings-browser-a-${randomBytes(8).toString('hex')}@example.test`;
const emailB = `settings-browser-b-${randomBytes(8).toString('hex')}@example.test`;
const originalPassword = `Browser-${randomBytes(15).toString('base64url')}`;
const newPassword = `Changed-${randomBytes(15).toString('base64url')}`;

test.beforeAll(async () => {
  await database.check();
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  apiPort = (apiServer.address() as AddressInfo).port;
});
test.afterAll(async () => {
  for (const email of [emailA, emailB]) {
    const user = await database.prisma.user.findUnique({ where: { email } });
    if (user) {
      await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: user.id } } });
      await database.prisma.user.delete({ where: { id: user.id } });
    }
  }
  await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
  await database.disconnect();
  await pool.end();
});

test('settings profile, CSV download and password session replacement', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/^Failed to load resource: the server responded with a status of (401|400) \(/.test(message.text())) return;
    errors.push(message.text());
  });
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:${apiPort}${requestUrl.pathname}${requestUrl.search}` });
    await route.fulfill({ response });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/register');
  await page.getByLabel('姓名').fill('設定測試');
  await page.getByLabel('Email').fill(emailA);
  await page.getByLabel('密碼', { exact: true }).fill(originalPassword);
  await page.getByLabel('確認密碼').fill(originalPassword);
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('密碼', { exact: true }).fill(originalPassword);
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');

  await page.goto('/transactions');
  await page.getByRole('button', { name: '管理分類' }).click();
  await page.getByLabel('分類名稱').fill('餐飲');
  await page.getByRole('button', { name: '新增分類' }).click();
  await page.getByRole('button', { name: '新增交易' }).click();
  await page.getByLabel('金額', { exact: true }).fill('1250.50');
  await page.getByLabel('分類', { exact: true }).selectOption({ label: '餐飲' });
  await page.getByLabel('交易日期').fill('2026-10-15');
  await page.getByLabel('說明').fill('測試餐費');
  await page.getByRole('button', { name: '建立交易' }).click();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '帳號與資料設定' })).toBeVisible();
  await expect(page.getByText('新台幣 TWD')).toBeVisible();
  await page.getByLabel('使用者名稱').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '儲存名稱' })).toBeFocused();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/screenshots/settings-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('使用者名稱').fill('更新後名稱');
  await page.getByRole('button', { name: '儲存名稱' }).click();
  await expect(page.getByRole('status')).toContainText('顯示名稱已更新');
  await expect(page.getByRole('button', { name: '帳號選單' })).toContainText('更新後名稱');
  await page.screenshot({ path: 'docs/screenshots/settings-name-saved-1440.png', fullPage: true, animations: 'disabled' });

  await page.getByLabel('起始日期').fill('2026-10-01');
  await page.getByLabel('結束日期').fill('2026-10-31');
  await page.getByLabel('收支類型').selectOption('EXPENSE');
  await page.getByLabel('分類').selectOption({ label: '支出 · 餐飲' });
  await page.screenshot({ path: 'docs/screenshots/settings-export-1440.png', fullPage: true, animations: 'disabled' });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '匯出 CSV' }).click()]);
  expect(download.suggestedFilename()).toBe('cashflow-transactions-2026-10-01_to_2026-10-31.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.startsWith('\uFEFF交易日期,收支類型')).toBe(true);
  expect(csv).toContain('"2026-10-15","支出","測試餐費","餐飲","1250.50","TWD"');
  await expect(page.getByRole('region', { name: '交易資料匯出' }).getByRole('status')).toContainText('已下載 1 筆交易');
  await page.getByLabel('起始日期').fill('2026-09-01');
  await page.getByLabel('結束日期').fill('2026-09-30');
  await page.getByRole('button', { name: '匯出 CSV' }).click();
  await expect(page.getByRole('region', { name: '交易資料匯出' }).getByRole('status')).toContainText('沒有可匯出的交易');

  await page.getByLabel('目前密碼', { exact: true }).fill('incorrect-password');
  await page.getByLabel('新密碼', { exact: true }).fill(newPassword);
  await page.getByLabel('確認新密碼', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: '更新密碼' }).click();
  await expect(page.getByRole('alert')).toContainText('目前密碼不正確');
  await page.getByLabel('目前密碼', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: '顯示新密碼' }).click();
  await expect(page.getByLabel('新密碼', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: '隱藏新密碼' }).click();
  await page.screenshot({ path: 'docs/screenshots/settings-password-1440.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '更新密碼' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('密碼已更新');
  expect((await page.request.get(`http://127.0.0.1:${apiPort}/api/auth/me`)).status()).toBe(401);
  await page.getByLabel('Email').fill(emailA);
  await page.getByLabel('密碼', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: '帳號選單' }).click();
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/register');
  await page.getByLabel('姓名').fill('第二位測試');
  await page.getByLabel('Email').fill(emailB);
  await page.getByLabel('密碼', { exact: true }).fill(originalPassword);
  await page.getByLabel('確認密碼').fill(originalPassword);
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('密碼', { exact: true }).fill(originalPassword);
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await page.goto('/settings');
  await page.getByLabel('起始日期').fill('2026-10-01');
  await page.getByLabel('結束日期').fill('2026-10-31');
  await page.getByRole('button', { name: '匯出 CSV' }).click();
  await expect(page.getByRole('region', { name: '交易資料匯出' }).getByRole('status')).toContainText('沒有可匯出的交易');
  expect(errors).toEqual([]);
});
