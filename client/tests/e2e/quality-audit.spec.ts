import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { createDatabase } from '../../../server/src/lib/database';
import { expect, test } from './isolated-api';

config({ path: '.env' });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const database = createDatabase(databaseUrl);
const email = `portfolio-${randomBytes(8).toString('hex')}@example.test`;
const password = `Portfolio-${randomBytes(15).toString('base64url')}`;

async function unnamedControls(page: import('@playwright/test').Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')]
    .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'))
    .filter((element) => {
      const control = element as HTMLInputElement;
      if (control.type === 'hidden') return false;
      return !element.getAttribute('aria-label')?.trim() && !element.getAttribute('aria-labelledby')?.trim() &&
        !(('labels' in control) && control.labels?.length) && !element.textContent?.trim();
    }).map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`));
}

test.afterAll(async () => {
  const user = await database.prisma.user.findUnique({ where: { email } });
  if (user) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: user.id } } });
    await database.prisma.user.delete({ where: { id: user.id } });
  }
  await database.disconnect();
});

test('major pages remain usable from 320px to 1440px', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  for (const [path, title] of [['login', '歡迎回來'], ['register', '建立帳號']] as const) {
    await page.goto(`/${path}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}px`).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `docs/screenshots/phase6-${path}-1440.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: `docs/screenshots/phase6-${path}-390.png`, fullPage: true, animations: 'disabled' });
    expect(await unnamedControls(page), `${path} unnamed controls`).toEqual([]);
  }

  await page.getByLabel('姓名').fill('作品集範例');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('確認密碼').fill(password);
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');

  for (const [path, title, slug] of [
    ['/', /讓每一筆收支/, 'dashboard'],
    ['/transactions', '交易紀錄', 'transactions'],
    ['/budgets', '預算管理', 'budgets'],
    ['/insights', '財務分析', 'analytics'],
    ['/settings', '帳號與資料設定', 'settings'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${slug} at ${width}px`).toBe(true);
      expect(await page.locator('main h1').count()).toBe(1);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `docs/screenshots/phase6-${slug}-1440.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: `docs/screenshots/phase6-${slug}-390.png`, fullPage: true, animations: 'disabled' });
    expect(await unnamedControls(page), `${slug} unnamed controls`).toEqual([]);
  }

  await page.goto('/transactions');
  await page.getByRole('button', { name: '管理分類' }).click();
  await page.getByLabel('分類名稱').fill('較長的分類名稱測試'.repeat(5));
  await page.getByRole('button', { name: '新增分類' }).click();
  await expect(page.getByRole('status')).toContainText('分類已新增。');
  await page.getByRole('button', { name: '新增交易' }).click();
  await page.getByLabel('金額', { exact: true }).fill('9999999999999999.99');
  await page.getByLabel('分類', { exact: true }).selectOption({ label: '較長的分類名稱測試'.repeat(5) });
  await page.getByLabel('說明').fill('較長的交易說明'.repeat(10));
  await page.getByRole('button', { name: '建立交易' }).click();
  await expect(page.getByRole('status')).toContainText('交易已新增。');
  for (const path of ['/', '/transactions', '/budgets', '/settings']) {
    await page.goto(path);
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(page.locator('main h1')).toBeVisible();
    if (path === '/transactions') await expect(page.getByText('較長的交易說明'.repeat(10))).toBeVisible();
    const overflow = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('main *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8).map((element) => ({ tag: element.tagName, className: element.className, parent: element.parentElement?.className, right: Math.round(element.getBoundingClientRect().right) })) }));
    expect(overflow.documentWidth, `${path} with long text and a large amount: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.width);
  }
  await page.goto('/budgets');
  await page.setViewportSize({ width: 320, height: 900 });
  const trigger = page.getByRole('button', { name: '新增預算' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '新增月預算' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expect(dialog.getByLabel('月份')).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '關閉預算對話框' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '建立預算' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
