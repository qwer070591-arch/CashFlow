# 第三方授權盤點

本文件依專案 `package.json` 與已安裝套件所附 `LICENSE`／套件中繼資料整理。這是第三方元件的授權資訊，**不是 CashFlow 專案本身的授權條款**。

| 用途 | 套件 | 已檢查授權 | 著作權／注意事項 |
| --- | --- | --- | --- |
| 狀態切換圖標 | `morphicons@2.0.2` | MIT，`node_modules/morphicons/LICENSE` | Copyright (c) 2026 Guillermo；散布套件或其衍生部分時須保留原授權與著作權聲明。 |
| 靜態與動畫來源圖標 | `lucide@1.61.0`、`lucide-react@1.61.0` | ISC，兩個套件各自的 `LICENSE` | Copyright (c) 2026 Lucide Icons and Contributors；散布圖標或其複本時須保留原授權與著作權聲明。 |
| 樣式工具 | `tailwindcss@4.3.3` | MIT，套件 `LICENSE` | CSS 由專案樣式編譯；若散布第三方原始碼或衍生部分，應保留適用授權聲明。 |
| 資料存取 | `prisma@7.10.1`、`@prisma/client@7.10.1`、`@prisma/adapter-pg@7.10.1` | Apache-2.0，套件 `LICENSE` | 部署後端時保留隨附套件的授權與必要聲明；檢查發行包中是否有其他 `NOTICE`。 |

其餘直接依賴已按本機套件中繼資料盤點，包含 MIT、Apache-2.0、ISC 與 BSD-2-Clause；未發現授權欄位缺失的直接依賴。完整相依套件及其授權須以發行當時的 lockfile 和各套件隨附文件再次核對。

專案圖表由 `client/src/components/AnalyticsCharts.tsx` 的 SVG 程式繪製，沒有圖表套件。標誌由文字樣式與 Lucide 圖標組成；程式碼中沒有另行下載的字體、圖片或 SVG 素材，字體使用系統字型堆疊。現有畫面設計文件描述設計方向，未發現引入第三方 UI 原始碼的紀錄；公開前仍應由作者確認素材來源。

若將編譯後網站或伺服器封裝另外散布，應在發布產物中提供適用的第三方授權與著作權聲明。不要把本文件誤作 CashFlow 的 `LICENSE`。
