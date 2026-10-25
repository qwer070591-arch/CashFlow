import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { expect, test } from './isolated-api';
import { createDatabase } from '../../../server/src/lib/database';

config({ path: '.env' });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const database = createDatabase(databaseUrl);
const email = `finance-browser-${randomBytes(8).toString('hex')}@example.test`;
const password = `Browser-${randomBytes(15).toString('base64url')}`;

test.afterAll(async () => {
  const user = await database.prisma.user.findUnique({ where: { email } });
  if (user) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: user.id } } });
    await database.prisma.user.delete({ where: { id: user.id } });
  }
  await database.disconnect();
});

test('browser transaction and category management with PostgreSQL persistence', async ({ page, apiPort }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/^Failed to load resource: the server responded with a status of (401|409) \(/.test(message.text())) return;
    errors.push(message.text());
  });
  await page.goto('/register');
  await page.getByLabel('姓名').fill('財務測試');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('確認密碼').fill(password);
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: '交易紀錄' })).toBeVisible();
  await page.getByRole('button', { name: '管理分類' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '管理分類' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('分類名稱').fill('餐飲');
  await page.getByRole('button', { name: '新增分類' }).click();
  await expect(page.locator('#categories-panel').getByText('餐飲')).toBeVisible();
  await page.getByLabel('類型').first().selectOption('INCOME');
  await page.getByLabel('分類名稱').fill('薪資');
  await page.getByRole('button', { name: '新增分類' }).click();
  await expect(page.locator('#categories-panel').getByText('薪資')).toBeVisible();
  await expect(page.getByRole('button', { name: '新增分類' })).toBeEnabled();
  await page.getByRole('button', { name: '編輯分類 餐飲' }).click();
  await page.getByLabel('分類名稱').fill('外食');
  await page.getByRole('button', { name: '儲存名稱' }).click();
  await expect(page.locator('#categories-panel').getByText('外食')).toBeVisible();
  await page.getByRole('button', { name: '新增交易' }).click();
  await page.getByLabel('金額', { exact: true }).fill('0.10');
  await page.getByLabel('分類', { exact: true }).selectOption({ label: '外食' });
  await page.getByLabel('交易日期').fill('2024-02-29');
  await page.getByLabel('說明').fill('午餐');
  await page.getByRole('button', { name: '建立交易' }).click();
  await expect(page.getByText('午餐')).toBeVisible();
  await expect(page.getByText('− NT$ 0.10')).toBeVisible();
  await page.getByRole('button', { name: '刪除分類 外食' }).click();
  const confirmBox = await page.getByRole('dialog').boundingBox();
  expect(confirmBox).not.toBeNull();
  expect(Math.abs(confirmBox!.x + confirmBox!.width / 2 - 640)).toBeLessThan(3);
  expect(Math.abs(confirmBox!.y + confirmBox!.height / 2 - 360)).toBeLessThan(3);
  await page.getByRole('dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('已有交易或預算紀錄');
  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '編輯交易 午餐' }).click();
  await expect(page.getByLabel('金額', { exact: true })).toHaveValue('0.10');
  await page.getByLabel('金額', { exact: true }).fill('0.20');
  await page.getByRole('button', { name: '儲存變更' }).click();
  await expect(page.getByText('− NT$ 0.20')).toBeVisible();
  await page.reload();
  await expect(page.getByText('午餐')).toBeVisible();
  await expect(page.getByText('− NT$ 0.20')).toBeVisible();
  await page.getByRole('button', { name: '收入', exact: true }).click();
  await page.getByRole('button', { name: '新增交易' }).click();
  await page.getByRole('combobox', { name: '類型' }).last().selectOption('EXPENSE');
  await expect(page.getByLabel('分類', { exact: true }).getByRole('option', { name: '外食' })).toHaveCount(1);
  await expect(page.getByLabel('分類', { exact: true }).getByRole('option', { name: '薪資' })).toHaveCount(0);
  await page.getByRole('combobox', { name: '類型' }).last().selectOption('INCOME');
  await expect(page.getByLabel('分類', { exact: true }).getByRole('option', { name: '薪資' })).toHaveCount(1);
  await page.getByLabel('金額', { exact: true }).fill('1250.50');
  await page.getByLabel('分類', { exact: true }).selectOption({ label: '薪資' });
  await page.getByLabel('說明').fill('兼職');
  await page.getByRole('button', { name: '建立交易' }).click();
  await expect(page.getByText('+ NT$ 1,250.50')).toBeVisible();
  await page.getByRole('button', { name: '支出', exact: true }).click();
  await page.getByRole('button', { name: '新增交易' }).click();
  await page.getByLabel('金額', { exact: true }).fill('50.00');
  await page.getByLabel('分類', { exact: true }).selectOption({ label: '外食' });
  await page.getByLabel('說明').fill('本月午餐');
  await page.getByRole('button', { name: '建立交易' }).click();
  await expect(page.getByText('本月午餐')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '近期交易' })).toBeVisible();
  await expect(page.getByText('兼職')).toBeVisible();
  await expect(page.getByText('+ NT$ 1,250.50')).toBeVisible();
  await expect(page.locator('.dashboard-kpi', { hasText: '本月收入' })).toContainText('NT$ 1,250.50');
  await expect(page.locator('.dashboard-kpi', { hasText: '本月支出' })).toContainText('NT$ 50.00');
  await expect(page.locator('.dashboard-kpi', { hasText: '本月淨結餘' })).toContainText('NT$ 1,200.50');
  await expect(page.locator('.dashboard-kpi', { hasText: '本月交易' })).toContainText('2 筆');
  await expect(page.getByRole('heading', { name: '收入與支出趨勢' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '本月支出分類' })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/screenshots/dashboard-with-transactions-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/transactions');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '編輯交易 本月午餐' }).click();
  await page.getByLabel('金額', { exact: true }).fill('60.00');
  await page.getByRole('button', { name: '儲存變更' }).click();
  await expect(page.getByRole('status')).toContainText('交易已更新。');
  await page.goto('/');
  await expect(page.locator('.dashboard-kpi', { hasText: '本月支出' })).toContainText('NT$ 60.00');
  await expect(page.locator('.dashboard-kpi', { hasText: '本月淨結餘' })).toContainText('NT$ 1,190.50');
  await page.goto('/transactions');
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel('搜尋交易').fill('本月午餐');
  await expect(page.getByRole('table')).toContainText('本月午餐');
  await expect(page.getByRole('table')).not.toContainText('兼職');
  await page.getByLabel('搜尋交易').fill('');
  await page.getByLabel('分類').first().selectOption({ label: '外食' });
  await expect(page.getByRole('table')).toContainText('本月午餐');
  await expect(page.getByRole('table')).not.toContainText('兼職');
  await page.getByRole('button', { name: '重設篩選' }).click();
  await page.screenshot({ path: 'docs/screenshots/transactions-filters-1440.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('banner').getByRole('button', { name: '帳號選單' }).click();
  await expect(page.getByRole('banner').getByText(email)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '收入', exact: true }).click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/screenshots/transactions-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: '新增交易' }).click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/screenshots/transaction-form-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: '關閉交易表單' }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: '篩選', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/transactions-mobile-filters-390.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '篩選', exact: true }).click();
  await page.getByRole('button', { name: '管理分類' }).click();
  await expect(page.getByRole('button', { name: '管理分類' })).toHaveAttribute('aria-expanded', 'true');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/screenshots/categories-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: '刪除交易 兼職' }).click();
  await expect(page.getByRole('dialog')).toContainText('兼職');
  await page.getByRole('dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(page.getByText('兼職', { exact: true })).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('.dashboard-kpi', { hasText: '本月收入' })).toContainText('NT$ 0.00');
  await expect(page.locator('.dashboard-kpi', { hasText: '本月淨結餘' })).toContainText('NT$ −60.00');
  await page.goto('/transactions');
  const categoryResponse = await page.request.get(`http://127.0.0.1:${apiPort}/api/categories`);
  expect(categoryResponse.ok()).toBe(true);
  const expenseCategory = (await categoryResponse.json()).categories.find((item: { name: string; type: string }) => item.name === '外食' && item.type === 'EXPENSE');
  expect(expenseCategory).toBeTruthy();
  const csrfResponse = await page.request.get(`http://127.0.0.1:${apiPort}/api/auth/csrf`);
  const csrfToken = (await csrfResponse.json()).csrfToken as string;
  const now = new Date();
  const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (let index = 0; index < 11; index += 1) {
    const response = await page.request.post(`http://127.0.0.1:${apiPort}/api/transactions`, {
      headers: { Origin: 'http://127.0.0.1:5173', 'X-CSRF-Token': csrfToken },
      data: { type: 'EXPENSE', amount: '1.00', categoryId: expenseCategory.id, transactionDate: currentDate, description: `分頁測試 ${index}` },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('每頁筆數').selectOption('10');
  await expect(page.getByText('第 1／2 頁')).toBeVisible();
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect(page.getByText('第 2／2 頁')).toBeVisible();
  await page.getByLabel('排序').selectOption('amount:desc');
  await expect(page.getByRole('table').locator('tbody tr').first()).toContainText('本月午餐');
  await page.getByLabel('起始日期').fill('2024-02-29');
  await page.getByLabel('結束日期').fill('2024-02-29');
  await expect(page.getByRole('table')).toContainText('午餐');
  await expect(page.getByRole('table')).not.toContainText('本月午餐');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: '開啟選單' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/screenshots/mobile-navigation-open-390.png', animations: 'disabled' });
  await page.getByRole('dialog', { name: '主要導覽' }).getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
