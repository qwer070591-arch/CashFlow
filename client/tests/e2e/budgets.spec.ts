import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { expect, test } from './isolated-api';
import { createDatabase } from '../../../server/src/lib/database';

config({ path: '.env' });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const database = createDatabase(process.env.DATABASE_URL);
const email = `budget-browser-${randomBytes(8).toString('hex')}@example.test`;
const password = `Browser-${randomBytes(15).toString('base64url')}`;

test.afterAll(async () => {
  const user = await database.prisma.user.findUnique({ where: { email } });
  if (user) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: user.id } } });
    await database.prisma.user.delete({ where: { id: user.id } });
  }
  await database.disconnect();
});

test('monthly budgets follow real expenses across pages and devices', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource: the server responded with a status of 401 \(/.test(message.text())) errors.push(message.text());
  });
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/register');
  await page.getByLabel('姓名').fill('預算測試');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('確認密碼').fill(password);
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');

  await page.goto('/transactions');
  await page.getByRole('button', { name: '管理分類' }).click();
  await page.getByLabel('分類名稱').fill('餐飲');
  await page.getByRole('button', { name: '新增分類' }).click();
  await expect(page.locator('#categories-panel').getByText('餐飲')).toBeVisible();

  await page.goto('/budgets');
  await expect(page.getByRole('heading', { name: '預算管理' })).toBeVisible();
  await expect(page.getByText('這個月尚未設定整體預算。')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/budget-empty-1440.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '新增預算' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('月份')).toBeFocused();
  for (const [width, height] of [[1440, 900], [768, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(3);
    expect(Math.abs(box!.y + box!.height / 2 - height / 2)).toBeLessThan(3);
    expect(box!.x).toBeGreaterThanOrEqual(15);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 15);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    expect(await dialog.evaluate((element) => getComputedStyle(element, '::backdrop').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({ path: `docs/screenshots/budget-dialog-create-${width}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 400 });
  expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dialog.getByRole('button', { name: '建立預算' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '關閉預算對話框' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '建立預算' })).toBeFocused();
  expect(await page.evaluate(() => { (document.querySelector('.budget-heading button') as HTMLButtonElement).focus(); return document.activeElement?.closest('dialog') !== null; })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新增預算' })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.getByRole('button', { name: '新增預算' }).click();
  await dialog.getByRole('button', { name: '關閉預算對話框' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新增預算' })).toBeFocused();
  await page.getByRole('button', { name: '新增預算' }).click();
  await dialog.getByLabel('預算金額（NT$）').fill('0');
  await dialog.getByRole('button', { name: '建立預算' }).click();
  await expect(dialog.getByRole('alert')).toContainText('大於 0');
  await page.getByRole('dialog').getByLabel('預算金額（NT$）').fill('100.00');
  await page.screenshot({ path: 'docs/screenshots/budget-create-dialog-1440.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('dialog').getByRole('button', { name: '建立預算' }).click();
  await expect(page.locator('.budget-overall')).toContainText('NT$ 100.00');
  await page.getByRole('button', { name: '新增預算' }).click();
  await page.getByRole('dialog').getByLabel('預算類型').selectOption('category');
  await page.getByRole('dialog').getByLabel('支出分類').selectOption({ label: '餐飲' });
  await page.getByRole('dialog').getByLabel('預算金額（NT$）').fill('50.00');
  await page.getByRole('dialog').getByRole('button', { name: '建立預算' }).click();
  const card = page.locator('.budget-card', { hasText: '餐飲' });
  await expect(card).toContainText('NT$ 50.00');

  await page.goto('/transactions');
  await page.getByRole('button', { name: '新增交易' }).click();
  await page.getByLabel('金額', { exact: true }).fill('60.00');
  await page.getByLabel('分類', { exact: true }).selectOption({ label: '餐飲' });
  await page.getByLabel('說明').fill('超支測試');
  await page.getByRole('button', { name: '建立交易' }).click();
  await expect(page.getByRole('table')).toContainText('超支測試');
  await page.goto('/budgets');
  await expect(card).toContainText('NT$ 60.00');
  await expect(card).toContainText('120.00%');
  await expect(card).toContainText('已超支');
  await expect(card).toContainText('NT$ −10.00');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/screenshots/budget-over-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '本月預算' })).toBeVisible();
  await expect(page.locator('.dashboard-budget')).toContainText('NT$ 40.00');
  await expect(page.locator('.dashboard-budget')).toContainText('已超支 1 個分類');
  await page.screenshot({ path: 'docs/screenshots/dashboard-budget-summary-390.png', fullPage: true, animations: 'disabled' });

  await page.goto('/budgets');
  await card.getByRole('button', { name: '編輯預算 餐飲' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const editBox = await dialog.boundingBox();
  expect(editBox).not.toBeNull();
  expect(Math.abs(editBox!.x + editBox!.width / 2 - 720)).toBeLessThan(3);
  expect(Math.abs(editBox!.y + editBox!.height / 2 - 450)).toBeLessThan(3);
  await page.screenshot({ path: 'docs/screenshots/budget-dialog-edit-1440.png', animations: 'disabled' });
  await page.getByRole('dialog').getByLabel('預算金額（NT$）').fill('100.00');
  await page.getByRole('dialog').getByRole('button', { name: '儲存變更' }).click();
  await expect(card).toContainText('60.00%');
  await expect(card).toContainText('正常');
  await page.getByLabel('查看月份').fill(nextMonth);
  await expect(page.getByText('這個月尚未設定整體預算。')).toBeVisible();
  await page.getByLabel('查看月份').fill(month);
  await expect(card).toContainText('餐飲');

  await page.goto('/transactions');
  await page.getByRole('button', { name: '刪除交易 超支測試' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認刪除' }).click();
  await page.goto('/budgets');
  await expect(card).toContainText('NT$ 0.00');
  await card.getByRole('button', { name: '刪除預算 餐飲' }).click();
  await expect(page.getByRole('dialog')).toContainText('交易與分類資料會保留');
  await page.getByRole('dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(page.getByText('尚未設定分類預算')).toBeVisible();
  await page.getByRole('button', { name: '刪除整體月預算' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(page.getByText('這個月尚未設定整體預算。')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('banner').getByRole('button', { name: '帳號選單' }).click();
  await page.getByRole('banner').getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
