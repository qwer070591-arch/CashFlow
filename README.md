# CashFlow — 智慧記帳與預算管理

CashFlow 是以 React、TypeScript、Express 與 PostgreSQL 建立的個人財務管理應用程式。它讓使用者記錄收支、檢視統計、追蹤月預算，並匯出自己的交易資料。這是本機執行的作品集專案，目前沒有公開 Demo。

## 功能

- 註冊、登入、登出、個人名稱與密碼管理；重新整理後維持登入。
- 收入與支出新增、查詢、編輯、刪除，自訂分類；支援文字、日期、類型與分類篩選。
- 總覽呈現收支摘要、最近六個月趨勢及支出分類統計。獨立「財務分析」頁仍在規劃。
- 設定整體與分類月預算，顯示使用進度及超支狀態。
- 依日期、類型、分類匯出 CSV；支援響應式桌面與手機介面。
- 互動狀態圖標使用 Morphicons；靜態圖標使用 Lucide，並支援 reduced-motion 偏好。

## 畫面

以下截圖來自測試專用的虛構帳號與交易，不包含真實會員資料。圖中金額為示範值。

| 畫面 | 桌面 | 手機 |
| --- | --- | --- |
| 總覽與統計 | [查看桌面截圖](docs/screenshots/dashboard-with-transactions-1440.png) | [查看手機截圖](docs/screenshots/dashboard-with-transactions-390.png) |
| 交易與篩選 | [查看桌面截圖](docs/screenshots/transactions-filters-1440.png) | [查看手機截圖](docs/screenshots/transactions-390.png) |
| 預算追蹤 | [查看桌面截圖](docs/screenshots/budget-over-1440.png) | [查看手機截圖](docs/screenshots/budget-over-390.png) |
| 帳號設定與匯出 | [查看桌面截圖](docs/screenshots/phase6-settings-1440.png) | [查看手機截圖](docs/screenshots/phase6-settings-390.png) |

## 技術

| 部分 | 技術 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite 8、Tailwind CSS 4、React Router 7、TanStack Query 5、Morphicons、Lucide |
| 後端 | Node.js、Express 5、Prisma 7、PostgreSQL 17 |
| 測試 | Vitest、Supertest、Playwright Chromium |

趨勢長條圖與分類圓環圖由專案內的 SVG 元件繪製，沒有使用 Recharts 等圖表套件。介面主要使用專案 CSS 與設計 token；Tailwind CSS 由入口樣式引入。

## 架構與安全

```text
React / Vite → Express /api → Prisma → PostgreSQL
```

本機開發時，Vite 將 `/api` 代理到 Express；Docker Compose 僅啟動 PostgreSQL。金額使用 PostgreSQL `numeric(18,2)` 與 Prisma Decimal 處理，避免一般浮點數計算誤差。更多細節見[架構](docs/architecture.md)、[資料模型](docs/data-model.md)、[API](docs/api.md)、[設計規範](DESIGN.md)及[部署準備手冊](docs/deployment-guide.md)。

密碼以 Argon2id 雜湊；Session 存於 PostgreSQL，瀏覽器使用 HttpOnly Cookie。寫入請求檢查 Origin 與 CSRF；私人資料查詢以 Session 中的使用者 ID 限定。CSV 匯出對公式前綴做防護。這些措施不代表專案已取得安全認證。

## 本機啟動

建議使用 Node.js 24、npm 11、Docker Engine／Docker Desktop 與 Docker Compose。本機資料庫需有可用的 5432 連接埠；若修改 `POSTGRES_PORT`，也須同步調整 `DATABASE_URL`。

1. 執行 `npm install`。
2. 複製 `.env.example` 為 `.env`，將範例密碼與 Session Secret 換成各自獨立的隨機值，並讓 `POSTGRES_*` 與 `DATABASE_URL` 一致。不要覆寫現有 `.env`。
3. 執行 `npm run db:check-config`、`npm run db:up`、`npm run db:validate`、`npm run db:generate`。
4. 在**新建、沒有需保留資料**的資料庫執行 `npm run db:migrate`，再以 `npm run db:status` 確認狀態。既有資料庫應先檢查 migration 與備份，避免直接執行開發用 migration 命令。
5. 執行 `npm run dev`，開啟 `http://127.0.0.1:5173`。API 預設為 `http://127.0.0.1:3001`；請使用相同的 `127.0.0.1` 主機名稱。

Windows PowerShell 若阻擋 `npm.ps1`，可使用 `npm.cmd` 代替 `npm`，不必修改系統執行原則。資料庫設定與排錯見 [Docker 說明](docs/docker.md)。

## 驗證

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 前後端 TypeScript 檢查 |
| `npm run lint` | ESLint |
| `npm test` | Vitest 與 Supertest API 測試 |
| `npm run build` | 前後端正式建置 |
| `npm run test:e2e` | Chromium 端到端測試；需先啟動應用程式與資料庫 |
| `npm run db:status` | Prisma migration 狀態 |

## 限制與授權

- 尚未公開部署；正式環境須配置 HTTPS、可信任反向代理、資料庫備份與還原，以及多實例共用的速率限制儲存。若前端與 API 分屬不同來源，須重新檢查 Cookie、SameSite、CSRF 與 CORS 設定。
- 記帳基準貨幣固定為 TWD，沒有實際多幣別換算；獨立分析頁、Email 驗證與密碼重設尚未完成。
- 尚未完成完整的 WCAG 2.2 AA 人工驗證。
- CashFlow 目前保留所有權利，沒有提供開源授權，也沒有專案 `LICENSE`；公開可讀不等於授權他人複製、修改或散布。第三方套件各依其原授權使用，詳見[第三方授權盤點](docs/third-party-notices.md)。
