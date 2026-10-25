# 架構

```text
Browser → Vite client (:5173) → /api proxy → Express (:3001) → Prisma adapter-pg → 127.0.0.1:5432 → Docker Compose PostgreSQL
```

- npm workspaces：`client`、`server`，根目錄負責共用命令與 lockfile。
- 前端：React Router 提供工作台及 `/login`、`/register`；`RequireAuth` 等待 `/api/auth/me` 後才顯示工作台。TanStack Query 管理會員、分類與交易資料，登出後清除快取。`services/api.ts` 集中 Cookie、CSRF 與錯誤處理；交易頁使用真實財務 API。
- 後端：`src/index.ts` 讀取環境變數並啟動 HTTP；`src/app.ts` 組裝 Express middleware 與路由；資料庫檢查由可替換的 `Database` 介面提供。認證使用 `express-session` 與 `connect-pg-simple`，Session 表在 PostgreSQL，由新 Prisma migration 建立；store 每 15 分鐘清理過期記錄。
- Prisma 7：`prisma.config.ts` 讀取 `DATABASE_URL`，schema 位於 `server/prisma/schema.prisma`，產生的 client 位於 `server/src/generated/prisma`，已排除版控。
- Docker Compose：`compose.yaml` 只啟動官方 PostgreSQL 17.11 容器；`cashflow-dev` 隔離專案資源，named Volume 保存資料。埠號由 `.env` 的 `POSTGRES_PORT` 決定，預設只綁本機 `127.0.0.1:5432`。
- 程式碼沒有硬編碼密碼。API health 可獨立運作；DB health 以實際 `SELECT 1` 測試連線。

密碼使用 Argon2id（19 MiB、2 次迭代、平行度 1）雜湊；登入時重新產生 Session ID，登出時刪除 store 記錄。Session 期限為 7 天，Cookie 使用 HttpOnly、SameSite=Lax、Path=/；正式環境啟用 Secure。CSRF 採 Session 內 Token 加可信任 Origin 檢查，涵蓋註冊、登入、登出及財務資料寫入。認證資訊不放 localStorage。註冊與登入各有每 IP、每 15 分鐘 10 次的程序內速率限制。

分類與交易路由都先驗證 Session，再從 Session 取得 userId。讀取、修改與刪除均以 userId 限定；交易建立與修改核對分類的 userId 與 type，資料庫複合外鍵再保護並發情況。Phase 3B 列表支援伺服器端搜尋、篩選、穩定排序與每頁最多 100 筆的分頁。金額以 Prisma Decimal 處理，日期以 UTC 午夜對應 PostgreSQL DATE，API 回傳原始 `YYYY-MM-DD`。

後續受保護的財務 API 必須使用 `requireAuth` 與 `currentUserId` 將所有查詢與寫入限制於登入者，並驗證類別與交易的關聯。目前尚無角色管理、Email 驗證或密碼重設。多實例部署前須將速率限制改為共用 store；正式環境需要 HTTPS 與受信任的單層反向代理。

## Phase 3B 更新

上方 Phase 3A 的筆數上限與「尚無財務 CRUD」為當時狀態。現有交易列表的篩選、排序及分頁由伺服器處理，每頁最多 100 筆；Prisma 使用相同 where 條件及 Repeatable Read 讀取總筆數與頁面。Analytics 路由均先驗證 Session，並用伺服器端 userId 限定查詢。收入、支出與分類合計由 PostgreSQL／Prisma Decimal 彙總，API 回傳十進位字串；趨勢使用參數化 SQL 按月聚合並補零。前端 TanStack Query 的 key 包含篩選參數，交易與分類異動後失效相關交易及統計快取，登出清除所有快取。瀏覽器明確傳本機月份；未提供日期時伺服器採 `Asia/Taipei` 當月。未新增 migration，預算 CRUD 尚未實作。

## Phase 4 更新

預算路由以 Session userId 限制每筆讀寫，寫入沿用 Origin 與 CSRF。整體月預算以 nullable categoryId 表示，partial unique index 保證同會員同月唯一。月支出按 `[monthStart, nextMonthStart)` 查詢 PostgreSQL DATE，只彙總 EXPENSE，Prisma Decimal 計算金額與門檻；預算列表與交易分組在 Repeatable Read 快照讀取。前端 Query key 包含月份，預算與交易異動後使預算快取失效，登出清除全部私人快取。上段「預算 CRUD 尚未實作」為 Phase 3B 當時狀態。

## Phase 5 更新

`/api/users/me` 以 Session userId 修改名稱，前端更新 `auth/me` Query 資料，Header 與帳號選單同步。修改密碼使用既有 Argon2id 參數，限制每 IP 15 分鐘 5 次；資料庫交易以原 Hash 條件更新密碼，並刪除該會員所有 PostgreSQL Session。成功後清除 Cookie 與前端私人快取，要求重新登入。Email 唯讀，preferredCurrency 維持 TWD，無匯率換算。

`/api/transactions/export` 在認證後依本人、日期、類型和分類查詢；使用 Repeatable Read、穩定排序、每批 500 筆讀取，總量上限 5,000 筆。匯出內容只在請求期間保留，回應禁止快取。前端直接下載 Blob 並釋放暫時 URL，不放入 TanStack Query 快取。Phase 5 不變更 Prisma schema 或 migration。
