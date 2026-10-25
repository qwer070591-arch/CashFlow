# CashFlow Phase 6 品質審查

日期：2026-10-25。範圍：本機 CashFlow Phase 1–5、真實 PostgreSQL 與 Chromium；未進行正式部署。此文件記錄本次實測結果，不代表第三方安全認證或完整 WCAG 符合性聲明。

## 問題清單與處理

| 等級 | 發現 | 處理 |
| --- | --- | --- |
| P0 | 未確認資料外洩或資料損毀問題 | 無需修改 |
| P1 | 未確認核心授權或財務計算缺陷 | 維持現有防護並補精度回歸測試 |
| P2 | 多個 E2E 測試共用開發 API 的每 IP 登入計數器，重跑可能得到 429 | 財務、預算、導覽測試改用 Worker 專屬暫時 API 實例；正式門檻不變 |
| P2 | 同時執行編譯、稽核與 Vitest 時，預算整合測試曾碰到 5 秒逾時 | 單獨測試約 2.3 秒、依序執行整套 30/30；驗證命令避免同時爭用本機資源，未放寬測試門檻 |
| P2 | 交易測試儲存後立即換頁，可能先讀到舊統計 | 等待「交易已更新」狀態後再導覽 |
| P2 | 320px 下，長文字與最大合法金額使交易卡片水平溢出 | 卡片允許縮小，長金額可在窄螢幕換行 |
| P2 | 部分次要文字在白底的對比約 3.23:1 | 使用既有較深的文字色；設計 token 在白底約 5.00:1 |
| P2 | 財務分析佔位頁誤稱仍在基礎建置、沒有資料 | 說明獨立分析頁仍在規劃，總覽已有真實統計 |
| P2 | 開發依賴 `concurrently@9.2.1` 的 `shell-quote` 在 npm 稽核中有 Critical 通報 | 同主版本更新至 `concurrently@9.2.5`，重新稽核為 0 項通報 |
| P2 | 入口 JS 包含各路由頁面程式 | 加入路由層級延遲載入，未改資料流 |
| P2 | README 缺少作品集導覽、畫面與授權狀態 | 補技術資料流、匿名截圖、限制與授權說明 |

## UI、響應式與無障礙

Playwright 檢查 Login、Register、Dashboard、Transactions、Budgets、Analytics 佔位頁、Settings 的 320／390／768／1024／1440px 版面、每頁 H1、可見表單與按鈕的名稱、Console page error。另以長分類名稱、長交易說明及 `9999999999999999.99` 測試 320px；修正後連跑 3 次通過。320px 預算 Dialog 驗證焦點移入、Shift+Tab 焦點循環、Escape 關閉、焦點返回、背景捲動鎖定與對話框在 Viewport 內。既有測試涵蓋手機 Drawer、reduced-motion、交易 Dialog 與主要鍵盤操作。

已檢查主要設計文字色與白底的對比，並修正明確不足的次要文字。可見控制項名稱檢查與鍵盤檢查屬於目標性自動掃描；本次沒有執行完整的逐元素 WCAG 2.2 AA 對比稽核或輔助技術人工測試，公開宣稱全面符合 WCAG 仍需另行審查。

## 安全與財務正確性

私人路由共用 `requireAuth`；交易、分類、預算、統計及匯出查詢均以 Session userId 限定，寫入操作使用 Origin 與 CSRF。登入重新產生 Session，密碼變更撤銷該帳號全部 Session；既有 Supertest 測試檢查未登入、跨帳號、CSRF、密碼與 CSV 注入。Cookie 在正式環境配置 Secure、HttpOnly、SameSite=Lax；HTTPS 與反向代理的實際部署設定尚未驗證。

金額保留 Prisma Decimal／PostgreSQL NUMERIC，DATE 使用原始 `YYYY-MM-DD`。新增回歸案例確認 `9999999999999999.99 + 0.10` 的統計為 `10000000000000000.09`，CSV 保留個別精確金額。既有整合測試涵蓋 `0.10`／`0.20`、跨月、預算排除收入、分類改名、完整統計與帳號隔離。

## 效能量測

正式 Build 的入口 JS 由 396.31 KB（gzip 122.82 KB）降至 294.75 KB（gzip 92.98 KB）；頁面程式改為依路由載入。這是產物大小，並非實際使用者網速或 Core Web Vitals 的量測。

`node scripts/audit-api-performance.mjs` 在本機建立一個暫時帳號及 500 筆虛構交易，對每個端點暖機一次、測量 10 次並清理該帳號。包含 Supertest 與本機資料庫往返的結果：

| API | Median | P95 |
| --- | ---: | ---: |
| 交易列表第一頁 | 15.5 ms | 16.5 ms |
| 統計摘要 | 9.7 ms | 10.7 ms |
| 收支趨勢 | 9.7 ms | 10.6 ms |
| 分類統計 | 11.1 ms | 11.6 ms |
| 預算摘要 | 13.8 ms | 15.1 ms |
| 500 筆 CSV 匯出 | 24.6 ms | 26.1 ms |

對 500 筆單一帳號資料的交易查詢，PostgreSQL 選用 `Seq Scan → Sort → Limit`；這個小資料集不足以推論大量資料時的索引效果。正式部署需在目標資料量、硬體與並發量下重新量測。

## 驗證與待辦

- PASS：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`（30/30）、`npm.cmd run build`、`npm.cmd run db:status`（3 個 migration 已套用）。
- PASS：Playwright Chromium 完整套件兩次，7/7（預設 6 Workers 與 3 Workers）；新增 RWD 壓力案例另連跑 3 次通過。
- PASS：`npm.cmd audit --json`，更新後目前回報 0 項漏洞。稽核結果會隨公告更新。
- BLOCKED／待部署：正式 HTTPS、反向代理、Secure Cookie、跨實例速率限制、真實網路效能。
- 尚未完成：完整輔助技術與 WCAG 2.2 AA 人工審查、授權條款選定。目錄目前沒有 Git Repository；公開到 GitHub 前應再次確認忽略規則與擬公開檔案。

沒有執行 Prisma Reset、刪除 Docker Volume、修改已套用 migration、提交、推送或部署。
