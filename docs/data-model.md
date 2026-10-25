# 資料模型

| 表格 | 關鍵欄位 | 約束與用途 |
| --- | --- | --- |
| User | id、name、email、passwordHash、preferredCurrency、createdAt、updatedAt | email 唯一並於 API 轉為小寫；新增 `lower(email)` 唯一索引阻止大小寫重複帳號。幣別預設 TWD。 |
| session | sid、sess、expire | `connect-pg-simple` 的伺服器端 Session；sid 主鍵、expire 索引，定期清理過期記錄。Cookie 只保存簽章 sid。 |
| Category | id、userId、name、type、color、icon | 屬於 User；同使用者／類型／名稱唯一。 |
| Transaction | id、userId、categoryId、type、amount、description、transactionDate、createdAt、updatedAt | 金額 `numeric(18,2)`；複合外鍵確保類別與交易同屬一人且收支類型一致。 |
| Budget | id、userId、categoryId（可為 null）、month、amount、createdAt、updatedAt | 金額 `numeric(18,2)`；null 代表整體月預算；月份為每月 1 日。 |

Prisma schema 包含主鍵、外鍵、唯一鍵與查詢索引。初始 SQL migration 額外定義正金額與預算月份為 1 日的 CHECK constraints。Phase 3A 沿用既有模型與兩筆 migration，無需資料庫結構變更。分類以 `(userId, type, name)` 防止同名重複；交易的 `(categoryId, userId, type)` 複合外鍵確保分類所屬會員及收支類型一致，`RESTRICT` 阻止刪除仍被交易使用的分類。`Transaction` 的 `(userId, transactionDate)` 與分類的 `(userId, type)` 索引支援本人查詢。`amount` 為 `numeric(18,2)`，API 使用十進位字串及 Prisma Decimal，不使用 JavaScript 浮點數運算。`transactionDate` 是 PostgreSQL DATE；`createdAt`、`updatedAt` 是時間戳，兩者用途不同。Phase 4 Budget API 僅允許使用支出分類；資料庫本身未對關聯分類的 type 增設約束。

Phase 2 新增 `20261025010000_auth_sessions` migration，建立 Session 表與大小寫不敏感的 Email 唯一索引；未修改初始 migration。套用前確認 `DATABASE_URL` 指向 `cashflow` 專用資料庫，使用 `npm.cmd exec -w server prisma migrate deploy`，再以 `npm.cmd run db:status` 確認。不可重設資料庫或刪除原有資料。Session 表可能含使用者識別資訊，備份與存取權限應比照其他個資表。

## Phase 3B 查詢與精度

沿用 `Transaction.amount numeric(18,2)` 與 `transactionDate DATE`，無 schema 或 migration 變更。完整月份及指定區間的收入、支出和分類由資料庫彙總；淨結餘使用 Prisma Decimal 計算，全部金額以固定兩位小數字串回傳。趨勢查詢按資料庫月份聚合，空月份在 API 補零。交易查詢以既有 `(userId, transactionDate)` 索引支援會員與日期範圍，分類以既有關聯與索引篩選；所有查詢從 Session 取得 userId。前端 Number 僅用於圖形座標，不用於財務總額計算。

## Phase 4 預算約束

`20261025020000_monthly_budgets` migration 僅將 `Budget.categoryId` 改為 nullable，並新增 `UNIQUE (userId, month) WHERE categoryId IS NULL` partial index。既有 `(userId, categoryId, month)` 唯一約束保護分類預算；一般 unique 約束不能保證 null 的整體預算唯一。既有正金額及每月 1 日 CHECK 約束保留。API 僅接受本人 EXPENSE 分類，資料庫外鍵限制被預算使用的分類不得刪除。預算使用額從真實交易計算，不儲存衍生的 spentAmount。

## Phase 5 資料策略

沿用 User 的 `name`、`email`、`passwordHash`、`preferredCurrency` 與 PostgreSQL `session` 表；不新增欄位或 migration。Email 唯讀；`preferredCurrency` 仍以 TWD 為實際基準，不提供資料重標幣別或換算。密碼變更同一資料庫交易更新 Argon2id Hash 並撤銷本人全部 Session。CSV 匯出從 `Transaction.amount numeric(18,2)` 與 `transactionDate DATE` 讀取，保留精度和日期語意，不修改任何交易資料。
