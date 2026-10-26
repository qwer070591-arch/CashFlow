# CashFlow 部署準備手冊（Phase 8B-1）

本文件說明將 React/Vite 靜態前端部署至 Vercel、Express API 部署至 Render、PostgreSQL 部署至 Neon 的人工操作。Phase 8B-1 **沒有建立雲端資源、設定真實憑證、遷移資料或部署**。以下網址與值僅為格式範例，實際值應只存於平台環境變數，不要提交 `.env`。

## 架構與待決定的網域

推薦 A：瀏覽器只造訪 `https://app.example.com`，同來源 `/api/*` 由 Vercel 的 external-origin rewrite 代理至 `https://api.example.com/api/*`（Render）。前端 `VITE_API_BASE_URL` 留空，Cookie 不設定 `Domain`，維持 `HttpOnly; Secure; SameSite=Lax`。前端與 API 對瀏覽器為同來源；Render 的 `CLIENT_ORIGIN` 應為公開前端的**精確來源**，CSRF 仍查 `Origin` 與 Session Token。此方案也可先用 Vercel 與 Render 的平台網址驗證，不以自訂網域為技術前提；自訂網域可提供穩定正式網址。不可快取 `/api/*`，尤其是 `/api/auth/*`、個人資料與 CSV。

根目錄 `vercel.json` 現在把 `/api/:path*` 排在 SPA fallback 前，目的地 `https://api.example.invalid/api/:path*` 是**刻意不可用的佔位 URL**。正式 API 網址尚未確定；部署前必須將此目的地改為實際 Render HTTPS origin 加 `/api/:path*`，重新檢查路徑不被重複加上或移除，並審查該次變更。佔位 URL 下 `/api` 不會回傳 `index.html`，但**也不能提供可用 API，絕不可宣稱可直接上線**。部署後須實測轉送方法、查詢字串、`Set-Cookie`、`Cookie`、`Origin`、`X-CSRF-Token`、`X-Forwarded-For`；若轉送行為不符，不得以 SPA fallback 代替 API。

可行的次選方案：`https://app.example.com` 直接呼叫 `https://api.example.com`，兩者是**跨來源、同站點**；在 Vercel 設 `VITE_API_BASE_URL=https://api.example.com`，Render 設 `CLIENT_ORIGIN=https://app.example.com`。現有 `credentials: 'include'`、精確 CORS allowlist、`SameSite=Lax`、Secure Cookie、CSRF 與 Origin 驗證可維持；Cookie 只屬於 API 主機。此方案需要自訂網域及兩個 HTTPS 子網域，並須對 CORS 預檢及實際登入做雲端驗證。

B：若直接使用 `*.vercel.app` 與 `*.onrender.com`，屬**跨站**。現有 Lax Cookie 不會在跨站 fetch 中可靠傳送。改成 `SameSite=None; Secure` 仍會碰上第三方 Cookie 封鎖／分割及瀏覽器差異，也會擴大 CSRF 風險；本階段**不修改**核心 Session 策略來支援 B。若無自訂網域，先驗證 A 的同來源代理；若代理不可行，應取得自訂網域或重新設計登入架構，經安全審查後再實作。

參考：[Vercel external rewrites](https://vercel.com/docs/routing/rewrites)、[Express Session Cookie](https://expressjs.com/en/resources/middleware/session/)。

## 平台與 Repository 準備

1. 人工準備 Vercel、Render、Neon 帳號；確認費率、地區、權限及自訂網域。使用隔離的示範 Neon 專案或分支，**不要**將本機財務資料複製上去。
2. 以既有 GitHub Repository `qwer070591-arch/CashFlow` 作為來源；先確認待發布的提交及 `.gitignore`。`.env`、`AGENTS.md`、舊截圖、測試認證狀態、備份與私人匯出檔不得公開。Phase 8B-1 只提交經審查的部署準備，不建立任何雲端服務。
3. Vercel 前端與 Render API 都選同一個已審核的 Git 版本。不要在預覽部署中連正式資料庫；若要測試預覽，使用隔離的測試資料庫與對應的 `CLIENT_ORIGIN`。目前 API 只接受**一個**正式前端來源；動態的 `*.vercel.app` 預覽網址不在 allowlist 內。

## Vercel 前端

| 設定 | 值 |
| --- | --- |
| Root Directory | Repository root `./`，讓 npm workspace 與根目錄 lockfile 可用 |
| Framework Preset | Other（手動指定建置）；若 Vercel 自動辨識 Vite，仍須核對下列指令與輸出 |
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run build -w client` |
| Output Directory | `client/dist` |
| Node.js | 選與已驗證的本機 Node.js 24 相容版本 |
| Routing | 根目錄 `vercel.json`：`/api/:path*` 先代理（目前為不可用佔位），其後 `/(.*) → /index.html`；靜態檔案由檔案系統優先提供 |

`/dashboard` 不是目前的正式 React Router 路由；總覽位於 `/`，開啟 `/dashboard` 會由應用程式導回 `/`，未登入時再導往 `/login`。重新整理 `/transactions`、`/budgets`、`/settings` 必須先取得 `index.html`，再由 React Router 判斷登入與載入頁面。要在 Vercel 實際部署後驗收；本機 Vite preview 只能驗證產物與 SPA 行為，不能證明 Vercel 設定已生效。

前端只有一個公開設定 `VITE_API_BASE_URL`：A 留空，使用同來源 `/api`；同站點子網域方案填 API 的 HTTPS origin，**不含** `/api`。Vite 會把所有 `VITE_` 值嵌入可公開下載的 JS，切勿填入密碼、Session Secret、Neon URL 或 Token。開發環境保留空值，繼續由 Vite proxy 送至 `127.0.0.1:3001`。正式建置後檢查資產中沒有 `localhost` API 網址或 Secret。

## Render Express API

| 設定 | 值 |
| --- | --- |
| Service | Node Web Service；Root Directory `./` |
| Install / Build Command | `npm ci --include=dev && npm run build -w server` |
| Start Command | `npm run start -w server`（執行 `node dist/index.js`，無 watch） |
| Health Check Path | `/api/health/db`；資料庫不可用時回 503。`/api/health` 僅檢查程序存活 |
| `PORT` | 使用 Render 注入的值；程序在正式環境綁定 `0.0.0.0` |

`server` 的 `prebuild` 會先執行 `prisma generate`，再編譯忽略版控的 Prisma 7 Client；Build **不執行**資料庫 Migration。Prisma CLI 在 `devDependencies`，所以建置與執行遷移的環境需保留 dev dependencies。Production 環境必須明確提供公開 HTTPS `CLIENT_ORIGIN` 與隨機 `SESSION_SECRET`（建議由安全亂數產生至少 32 bytes），啟動時會拒絕 localhost／HTTP origin 與明顯的 placeholder Secret。不要把正式 Secret 寫在 `render.yaml`、README、GitHub Actions log 或 `VITE_` 變數。

Express 現在對正式環境設定 `trust proxy = 1`，供 Secure Cookie 與 `req.ip` 使用；**這只是單一可信任最後一跳的本機假設**。Render 前面可能有多層代理，若透過 Vercel 再轉送會多一層。Phase 8B 應在隔離環境用不同測試來源與偽造 `X-Forwarded-For` 前綴驗證 `req.ip` 與 429，確認平台實際代理鏈及最末可信任代理會覆寫／追加何種標頭，再決定 trust proxy 精確設定。不可直接設 `true` 信任全部 XFF，也不要公開除錯 IP 端點。現有 Rate Limit 是**每程序記憶體**計數；多 Render 實例需另選共用儲存，單實例 Demo 仍須監控濫用。

Server 在 `SIGTERM`/`SIGINT` 關閉 HTTP listener、Prisma 與 Session `pg` Pool；錯誤回應只包含固定訊息，不含 Stack Trace。Render 免費服務會休眠，首次喚醒及 Neon 休眠後可能有延遲或暫時 503；觀察健康檢查與連線恢復，避免盲目重試有副作用的寫入請求。

參考：[Render Web Services](https://render.com/docs/web-services)、[Health Checks](https://render.com/docs/health-checks)、[Express behind proxies](https://expressjs.com/en/guide/behind-proxies/)。

## Neon PostgreSQL 與 Migration

以下步驟由使用者在 [Neon 官方網站](https://neon.com/)及受控遷移環境**人工**執行；本階段沒有取得、讀取或測試雲端憑證。

1. 在 Neon 建立**新 Project**，選擇與主要使用者及 Render API 都接近、且目前方案提供的 Region。台灣使用者可優先比較新加坡與其他可選亞太區，但需以當時 Neon／Render 可用區域及實測延遲決定，不直接沿用本機資料庫。
2. 在新 Project 中建立專用的空白 Demo Database（例如 `cashflow_demo`）；確認選的是 Demo branch／database，不是任何既有正式或私人資料庫。Neon 可能另建預設資料庫，不要只憑 Project 名稱判定連線目標。
3. 在 Neon Console 的 Connection Details 選定**同一個 branch、database 與 role**，分別取得「Pooled connection」與「Direct connection」。Pooled host 通常含 `-pooler`；不要自行猜測或手動改寫 Host。將 pooled URL 設為 Render **runtime** 的 `DATABASE_URL`，direct URL 設為受控**migration** 環境的 `DIRECT_URL`；兩者不可互換。
4. 核對兩個 URL 都要求 TLS／SSL（Neon 提供的連線字串通常含 `sslmode=require`），並依 Neon／`pg` 對憑證驗證的要求設定。不要關閉 TLS 驗證來繞過連線錯誤。**不要在 ChatGPT 對話、GitHub Issue、Commit、日誌或前端 `VITE_` 變數貼出真實連線字串、密碼或 Secret。**
5. 執行遷移前，從 URL **只檢查 Host 與 Database Name**，比對 Neon Console 的 Demo 目標及預定 Region；不得列印密碼或完整 URL。再次確認這不是本機 `127.0.0.1`，也不是其他雲端資料庫。先記錄可還原點／備份安排，再以 `npm run db:status` 檢查狀態，最後在受控環境執行 `npm run db:deploy`（`prisma migrate deploy`）。
6. 遷移完成後重新執行 `npm run db:status`；確認 3 個既有 Migration 均已套用，`User`、`Category`、`Transaction`、`Budget` 與 PostgreSQL `session` 表存在，再透過 API `/api/health/db` 檢查連線。只用虛構資料建立 Demo 帳號，驗證重啟後 Session 與資料隔離。任何雲端驗證都須在 Phase 8B 的隔離環境進行，不能把本機 PASS 當作雲端 PASS。

**禁止**使用 `prisma migrate reset`、以 `prisma db push` 取代正式 Migration，或直接對正式資料庫執行 `prisma migrate dev`；不得匯入本機真實財務資料。Prisma 7 執行期的 `@prisma/adapter-pg` 和 PostgreSQL Session Store 各有最多 5 個 `pg` 連線／API 實例；擴容前按 Neon 限額重估。Session 表由既有 Migration 建立；不修改歷史 Migration。

`server/prisma.config.ts` 讓 Prisma 7 CLI 優先使用 `DIRECT_URL`，本機未設定時沿用 `DATABASE_URL`。**雲端遷移必須明確設定 `DIRECT_URL`，不可依賴回退。**`migrate deploy` 只套用待執行的既有 Migration，不會產生 Client，也不檢查 drift；Build 階段不得跑遷移。

Render paid Web Service 可把 `npm run db:deploy` 設為 Pre-deploy Command，讓失敗阻止切流。**免費 Web Service 沒有 Pre-deploy Command**；需透過人工或受控 CI job 在 API 首次啟動前執行同一命令，並確認執行環境有 `DIRECT_URL`、Prisma CLI 與網路存取。不要在每次 Start 時無條件跑 Migration；多實例並發及失敗復原更難管理。

Neon scale-to-zero 與 Render 網路變動可能中斷既有連線；`pg` Pool 可重建新連線，但在途請求仍可能失敗。部署驗收需測試休眠後的 Health Check、登入與 Session 延續；不要在錯誤時自動重送非冪等的交易／預算寫入。設定週期性的**加密、存取受限**備份並演練還原；Neon 的分支／時間點還原受方案保留時間限制，不能代替離線備份。監控 Session 表清理、資料庫大小與連線數。

參考：[Prisma 7 migrate deploy](https://www.prisma.io/docs/cli/v7/migrate/deploy)、[Prisma 7 config](https://docs.prisma.io/docs/orm/reference/prisma-config-reference)、[Neon pooled connection](https://neon.com/blog/postgres-support-case-recap)、[Neon Scale to Zero](https://neon.com/docs/manage/endpoints/)。

## 環境變數（只有安全範例）

| 服務 | 變數 | 安全範例或要求 |
| --- | --- | --- |
| Vercel | `VITE_API_BASE_URL` | A：空字串；同站點子網域：`https://api.example.com` |
| Render | `NODE_ENV` | `production` |
| Render | `PORT` | 由 Render 提供，不手動固定 |
| Render | `CLIENT_ORIGIN` | `https://app.example.com`；精確公開前端來源 |
| Render | `DATABASE_URL` | Neon pooled TLS URL；只在平台 Secret 設定 |
| 遷移環境 | `DIRECT_URL` | Neon direct TLS URL；只在受控遷移環境設定 |
| Render | `SESSION_SECRET` | 由安全亂數產生、每環境獨立、不得共用範例值 |

本機 `.env` 的 `POSTGRES_*` 只用於 Docker Compose；不要複製到雲端。前端與 API 均應使用 HTTPS。Session Cookie 不設定 Domain，避免跨子網域共用；`Secure`、`HttpOnly`、`SameSite=Lax` 維持原設定。Render 的 CORS 只允許 `CLIENT_ORIGIN`，寫入請求還需相同 Origin 與正確 CSRF Token，登入後 Session 會再生，登出銷毀 Session。

## Demo 安全與隱私

- 使用獨立資料庫與虛構會員／交易，不匯入真實個人財務資料，不公開管理員權限。
- 目前訪客可註冊，沒有 Email 驗證、人機驗證或自行清除帳號功能。公開 Demo 前需決定是否接受任意註冊及資料保留／刪除政策；若限制註冊，需單獨設計，不能只隱藏前端按鈕。
- 不建立硬編碼共享密碼。可由人工建立短期示範帳號並透過私下渠道交付一次性密碼，或讓每位訪客自行註冊並標示「僅使用虛構資料」。共享帳號會造成資料互相可見與修改，不適合公開發送。
- 監控 Neon 容量、資料成長、Render 流量與每 IP 登入／註冊限速。現有資料隔離依 Session userId；公開 Demo 仍需實際驗證跨帳號隔離。
- 為示範站標示資料用途與保留政策。勿把使用者 CSV、Session、Cookie、密碼或資料庫備份上傳到公開儲存空間。

## 上線後人工驗收與回復

1. 確認 Vercel 靜態資產、`/`、`/transactions`、`/budgets`、`/settings` 重新整理均無平台 404；`/dashboard` 應導回 `/`。確認 `/api/health` 及 `/api/health/db` 不被 SPA fallback 吞掉。
2. 用全新虛構會員在真正 HTTPS 瀏覽器驗證註冊、登入、F5 保持登入、登出失效；檢查 Cookie `HttpOnly`、`Secure`、`SameSite=Lax`、host-only、CSRF Token、Origin、CORS 預檢與 `credentials`。缺少／錯誤 CSRF 與不允許的 Origin 必須 403。
3. 建立／修改／刪除虛構交易與月預算、查看統計、下載 CSV；以第二帳號驗證資料隔離。檢查 CSV 內容無公式注入及無他人資料。
4. 驗證正常與偽造 XFF 的 IP 判斷、連續登入 429、Session 跨重啟持續性、Neon 休眠喚醒、Render 健康檢查與關機。多實例若未設共用限速儲存，不能聲稱全域 429 保護。
5. 事前建立可還原點／備份。若遷移失敗，停止切流並檢查 `migrate status` 與錯誤，不執行 Reset；若新版本異常，回退應用程式版本，資料庫 Schema 回復須另行評估相容性及備份，不隨意逆轉 Migration。若 Secret 外洩，透過平台輪替並撤銷 Session。

常見錯誤：前端深連結 404 → 核對 Vercel SPA fallback、Root Directory 與輸出路徑；API 回 HTML → `/api` 被 SPA fallback 截走；登入無 Cookie → 核對 HTTPS、代理鏈、Cookie 屬性與同站點策略；CSRF 403 → 核對精確 `Origin`、Session Cookie、Token 與代理轉送；DB 503 → 核對 Neon 喚醒、TLS、連線數與 URL 類型；Prisma Migration 失敗 → 核對 `DIRECT_URL`、Prisma 7 CLI 與既有狀態。

## 成本與方案限制

**價格與免費額度會變動，Phase 8B 前必須重新查官方價格與帳號實際方案。**截至本文件撰寫時，小型非商業 Demo 如符合各免費方案限制，Vercel Hobby + Render Free + Neon Free 的平台標價可為 **US$0／月**（不含網域及額外用量）。Render Free 閒置約 15 分鐘會休眠、可能冷啟動，且不支援 Pre-deploy Command；正式可靠服務應評估付費方案。Neon Free 目前標示每專案 1 GB、每月 100 CU-hours 與有限還原窗口，不能當成備份與可用性保證。粗略付費基準：Render 0.5c-512mb 約 **US$7／月**；若 Vercel 使用 Pro，再加約 **US$20／月**；Neon Launch 為用量計費，官方示例約 **US$15／月**，因此三者都用上述付費方案的示例約 **US$42／月起**，實際仍會因運算、流量、儲存、網域及稅費變動。Vercel Hobby 僅供個人非商業用途；商業用途須確認方案。參考：[Vercel 價格](https://vercel.com/pricing)、[Render Compute Plans](https://render.com/docs/compute-plans)、[Render Free](https://render.com/docs/free)、[Render Deploys](https://render.com/docs/deploys)、[Neon 價格](https://neon.com/pricing)。

## Phase 8B 門檻

正式 HTTPS、Vercel→Render 轉送、Cookie／CSRF／CORS、實際代理 IP、Neon 連線與 Migration、備份還原、Demo 註冊政策都尚未雲端實測，狀態為 **BLOCKED**。先選定 A 的代理路由或同站點子網域、網域／方案及 Demo 政策，再以隔離環境驗收；Phase 8A 的本機測試不等於正式部署驗證。
