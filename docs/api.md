# API

Base URL：開發環境 `http://127.0.0.1:3001`。前端使用 Vite `/api` proxy。

## GET /api/health

HTTP 200：`{"status":"ok","service":"cashflow-api"}`。此端點不查詢資料庫。

## GET /api/health/db

以 Prisma 7 PostgreSQL adapter 執行 `SELECT 1`。成功 HTTP 200：`{"status":"ok","service":"cashflow-db"}`。資料庫不可用時 HTTP 503：`{"error":{"code":"DATABASE_UNAVAILABLE","message":"資料庫目前無法連線。"}}`。回應不包含連線字串或原始錯誤。前端使用 TanStack Query 顯示狀態，服務恢復後可按「重新檢查」重新讀取。

## 錯誤格式

無效 JSON 為 HTTP 400，`error.code` 為 `INVALID_JSON`；未知路徑為 HTTP 404，`error.code` 為 `NOT_FOUND`；其他未預期錯誤為 HTTP 500，`error.code` 為 `INTERNAL_ERROR`。所有錯誤回應使用 `{ "error": { "code": "...", "message": "..." } }`。

## 認證 API（Phase 2）

所有認證回應使用 `Cache-Control: no-store`。錯誤延續 `{ "error": { "code": "...", "message": "..." } }`，包含 400 驗證錯誤、401 未登入／登入失敗、403 CSRF 錯誤、409 重複 Email、429 速率限制、503 資料庫不可用。不可從錯誤內容取得密碼雜湊、Session ID 或資料庫細節。

1. `GET /api/auth/csrf`：建立匿名 Session，回傳 `{ "csrfToken": "..." }`。Token 只放記憶體；每次取得新 Token 會使舊 Token 失效。
2. `POST /api/auth/register`：傳入 `{ "name": "...", "email": "...", "password": "..." }`；成功 201，回傳 `{ "user": { "id", "name", "email", "preferredCurrency" } }`，需再登入。姓名 1–100 字、Email 最長 320 字並小寫正規化、密碼 12–128 字。
3. `POST /api/auth/login`：傳入 `{ "email": "...", "password": "..." }`；成功 200，回傳相同公開使用者欄位，重新產生 Session ID 並設定 HttpOnly Cookie。錯誤帳號與密碼皆回相同 401。
4. `GET /api/auth/me`：從伺服器端 Session 判定身分，成功 200 回傳公開使用者資訊；未登入或帳號已不存在回 401。
5. `POST /api/auth/logout`：撤銷伺服器端 Session 並清除 Cookie，成功 204。重複登出可安全回 204，但仍須提供有效 CSRF 資訊。

三個 POST 均須帶允許的 `Origin`，以及從 `/csrf` 取得的 `X-CSRF-Token`。開發環境若 `CLIENT_ORIGIN` 設為本機 HTTP 網址，會同時允許相同埠號的 `127.0.0.1` 與 `localhost`；正式環境只允許設定的 `CLIENT_ORIGIN`。不允許的來源回 403 `ORIGIN_INVALID`，缺少或錯誤的 Token 回 403 `CSRF_INVALID`。前端遇到過期 Token 會重新取得並重試一次。瀏覽器請求使用 `credentials: include`。正式環境 Cookie 使用 `Secure`；本機 HTTP 僅使用 HttpOnly、SameSite=Lax、Path=/。Cookie 保存簽章 Session ID，不含完整 Session 或使用者密碼。

## 分類與交易 API（Phase 3A）

所有財務路由都需要有效 Session，未登入回 401。POST、PATCH、DELETE 另需允許的 `Origin` 和 `X-CSRF-Token`，缺少或錯誤回 403。所有查詢以 Session 的 userId 限定，非本人資源與不存在資源都回 404。

- `GET /api/categories`：回傳 `{ "categories": [...] }`，只含本人分類。
- `POST /api/categories`：傳入 `{ "name": "餐飲", "type": "EXPENSE" }`；成功 201。名稱去除前後空白、長度 1 至 80；同使用者同類型名稱重複回 409。
- `PATCH /api/categories/:id`：只允許 `{ "name": "..." }`，不允許更改類型。
- `DELETE /api/categories/:id`：成功 204；被交易或其他既有資料使用時回 409 `CATEGORY_IN_USE`。
- `GET /api/transactions`：Phase 3B 的搜尋、篩選、排序與分頁參數及回應見下節；舊 `limit` 參數與 `transactions`、`hasMore` 回應欄位暫保留相容。
- `GET /api/transactions/:id`：回傳 `{ "transaction": ... }`，包含分類名稱與類型。
- `POST /api/transactions`：傳入 `{ "type": "EXPENSE", "amount": "1250.50", "categoryId": "UUID", "transactionDate": "2024-02-29", "description": "午餐" }`；成功 201。
- `PATCH /api/transactions/:id`：可修改上述交易欄位的一部分；類型與分類必須一致，不接受 id、userId、createdAt 等額外欄位。
- `DELETE /api/transactions/:id`：成功 204，只刪除本人指定的交易。

金額只接受正的十進位字串，最多 16 位整數及 2 位小數；不接受零、負數、指數格式或超出 `numeric(18,2)` 精度的值。回應以固定兩位小數字串表示。日期須為真實存在的 `YYYY-MM-DD`，對應 PostgreSQL DATE，回應不作時區位移。無效欄位回 400；分類不存在、非本人或類型不符回 400 `CATEGORY_INVALID`。錯誤格式沿用 `{ "error": { "code": "...", "message": "..." } }`。

財務統計 API 已於 Phase 3B 提供，詳見下節。後續新增的財務路由仍應以 `requireAuth` 與 `currentUserId(request)` 限定查詢。

## Phase 3B API 更新

本節取代上方 Phase 3A 的交易列表與「財務資料 API 尚未提供」說明。`GET /api/transactions` 現支援 `search`、`type`、`categoryId`、`startDate`、`endDate`、`sortBy`、`sortOrder`、`page`、`pageSize`。回傳 `items`、`page`、`pageSize`、`totalItems`、`totalPages`；舊版 `transactions`、`hasMore` 暫保留相容。`pageSize` 1–100，舊 `limit` 1–50。預設日期新到舊，相同排序值以次排序及 ID 穩定排序。所有條件經 Zod 驗證，查詢只限 Session 所屬使用者。

三個 Analytics GET 端點均需要有效 Session，且回應 `Cache-Control: no-store`。`startDate` 與 `endDate` 須同時提供真實 `YYYY-MM-DD` 日期，區間包含兩端；未提供時伺服器以 `Asia/Taipei` 當月為預設，瀏覽器則明確傳入使用者本機月份。無效或反向區間回 400。

- `GET /api/analytics/summary`：回傳 `startDate`、`endDate`、`income`、`expense`、`balance`、`transactionCount`。金額為固定兩位十進位字串，由全部符合條件的交易彙總，空結果為 `0.00`。
- `GET /api/analytics/trends`：回傳 `points`，每項含 `month`、`income`、`expense`；無交易月份補零，查詢最多 24 個月。
- `GET /api/analytics/categories`：回傳 `items`，每項含 `categoryId`、`categoryName`、`amount`、`transactionCount`，只彙總支出。

財務寫入仍需 Origin 與 CSRF；統計端點不提供寫入功能。資料庫不可用時回安全錯誤，不回傳 SQL 或憑證。

## Phase 4 預算 API

所有預算端點需要有效 Session，僅讀寫 Session userId 的資料，回應 `Cache-Control: no-store`。POST、PATCH、DELETE 同時要求可信任 Origin 及 `X-CSRF-Token`。`month` 格式為 `YYYY-MM`，未傳入列表或摘要時預設 `Asia/Taipei` 當月。金額為大於零、最多 16 位整數及兩位小數的十進位字串；超額、零、負數、科學記號及額外欄位回 400。

- `GET /api/budgets?month=2026-10`：回傳 `{ "month", "budgets": [...] }`，只列該月本人預算。
- `GET /api/budgets/summary?month=2026-10`：回傳 `{ "month", "overallBudget", "totalExpense", "categoryBudgets", "nearLimitCount", "atLimitCount", "overBudgetCount" }`。未設定整體預算時 `overallBudget` 為 null，`totalExpense` 仍為當月實際支出字串。
- `GET /api/budgets/:id`：回傳 `{ "budget": ... }`；不存在或非本人回 404。
- `POST /api/budgets`：傳入 `{ "month": "2026-10", "categoryId": null, "amount": "30000.00" }` 建立整體預算；分類預算改用本人 EXPENSE 分類 UUID。成功 201，回傳 `{ "budget": ... }`。同月同範圍重複回 409 `BUDGET_EXISTS`，分類不合法回 400 `CATEGORY_INVALID`。
- `PATCH /api/budgets/:id`：僅接受 `{ "amount": "..." }`；成功回傳更新後 `{ "budget": ... }`。調整月份或分類需刪除後另建。
- `DELETE /api/budgets/:id`：成功 204，只刪預算，不刪交易或分類；不存在或非本人回 404。

Budget 包含 `id`、`categoryId`、`category`、`month`、`amount`、`spent`、`remaining`、`usagePercent`、`status`、時間戳。金額與百分比均以固定兩位小數字串回傳；`remaining` 可為負數。狀態為 `NORMAL`（低於 80%）、`NEAR_LIMIT`（80% 至未滿 100%）、`AT_LIMIT`（100%）、`OVER_BUDGET`（大於 100%）。實際支出只計入本人、指定月份、`EXPENSE` 交易，月界線使用 `[月初, 下月月初)`。未登入回 401，無效 CSRF／Origin 回 403。

## Phase 5 帳號設定

- `PATCH /api/users/me`：需登入、可信任 Origin、CSRF。僅接受 `{ "name": "新的名稱" }`，去除前後空白後須為 1–100 字元；成功回 `{ "user": { "id", "name", "email", "preferredCurrency" } }`。Email、幣別與敏感欄位不可修改。
- `POST /api/users/me/change-password`：需登入、可信任 Origin、CSRF，且每 IP 15 分鐘最多 5 次。傳入 `{ "currentPassword": "...", "newPassword": "..." }`；新密碼須為 12–128 字元且不同於原密碼。成功 204，撤銷該會員全部 Session 並清除目前 Cookie；所有裝置須重新登入。錯誤原密碼回 401，重用舊密碼回 400，超限回 429。回應不含密碼或 Hash。

## Phase 5 CSV 交易匯出

`GET /api/transactions/export?startDate=2026-10-01&endDate=2026-10-31&type=EXPENSE&categoryId=UUID`。需登入；起訖日期必填，含兩端，最長 366 天。`type` 與 `categoryId` 選填，分類須屬於本人且與指定類型一致。後端以 Session userId 查全部符合條件的真實交易，不受列表分頁影響；單次最多 5,000 筆，超過回 413 `EXPORT_LIMIT`，非法參數回 400。日期新舊由 `transactionDate`、`id` 穩定排序。

回應為 `text/csv; charset=utf-8`，含 UTF-8 BOM、CRLF 行尾、安全的日期區間檔名、`Content-Disposition: attachment`、`X-Export-Count`，並設定 `Cache-Control: private, no-store` 與 `nosniff`。空結果只含標題列，`X-Export-Count: 0`。欄位順序：交易日期、收支類型、交易名稱／說明、分類、金額、貨幣。示意資料（非真實會員資料）：

```csv
交易日期,收支類型,交易名稱／說明,分類,金額,貨幣
"2026-10-15","支出","示範午餐","餐飲","1250.50","TWD"
```

欄位以雙引號包住，內部雙引號加倍；使用者可控制的說明與分類名稱若在空白、控制字元或零寬字元後以 `=`, `+`, `-`, `@` 開頭，會在欄位最前加 `'`，避免被常見試算表當成公式。這個前置單引號在不同 CSV 讀取器可能顯示為文字；請勿將 CSV 視為可無損還原所有原始文字的備份格式。金額保留兩位小數，不使用千分位；日期為原始 `YYYY-MM-DD`。
