import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
let fileValues;
try {
  fileValues = parse(readFileSync(envPath));
} catch {
  console.error('找不到專案根目錄 .env；請先參考 .env.example 建立本機設定。');
  process.exit(1);
}

const value = (key) => process.env[key] ?? fileValues[key];
const db = value('POSTGRES_DB');
const user = value('POSTGRES_USER');
const password = value('POSTGRES_PASSWORD');
const port = value('POSTGRES_PORT');
const connectionString = value('DATABASE_URL');

if (!db || !user || !password || !port || !connectionString || password === 'replace-with-random-local-password' || password === 'change-me') {
  console.error('資料庫環境變數不完整或仍使用範例密碼。');
  process.exit(1);
}

let url;
try {
  url = new URL(connectionString);
} catch {
  console.error('DATABASE_URL 格式無效。');
  process.exit(1);
}

let matches;
try {
  matches = url.protocol === 'postgresql:'
    && url.hostname === '127.0.0.1'
    && url.port === port
    && decodeURIComponent(url.username) === user
    && decodeURIComponent(url.password) === password
    && decodeURIComponent(url.pathname.slice(1)) === db
    && db === 'cashflow'
    && /^\d+$/.test(port)
    && Number(port) > 0
    && Number(port) <= 65535;
} catch {
  matches = false;
}

if (!matches) {
  console.error('DATABASE_URL 與 POSTGRES_* 設定不一致，或未指向本機 CashFlow 專用資料庫。');
  process.exit(1);
}

console.info('CashFlow 資料庫設定一致（未顯示帳號、密碼或連線字串）。');
