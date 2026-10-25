# Docker PostgreSQL 開發指南

## 前置條件

安裝 [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)，選擇 WSL 2 後端並啟動 Linux containers。先以 `wsl --version`、`wsl --status`、`wsl --list --verbose` 確認 WSL 2；以 `docker --version`、`docker compose version`、`docker info` 確認 CLI、Compose 與 Engine。官方需求包含 WSL 2.1.5 以上、相容的 64 位元 Windows、8 GB RAM 與硬體虛擬化。安裝可能需要使用者操作或系統權限；本專案指令不會變更 Windows 功能、BIOS 或 WSL 設定。

## 專案設定

`compose.yaml` 僅定義一個 PostgreSQL 服務，Compose 專案名為 `cashflow-dev`，映像固定為 `postgres:17.11-bookworm`。此版本的資料目錄是 `/var/lib/postgresql/data`，named Volume `postgres_data` 掛載於該路徑；實際 Volume 名稱由 Compose 加上專案前綴。資料庫埠只綁定 `127.0.0.1:${POSTGRES_PORT}`，預設 `5432`，不對區域網路公開。

專案根目錄 `.env` 同時供 Compose 與 Prisma 使用；此檔受 `.gitignore` 排除。`POSTGRES_DB=cashflow`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_PORT` 與 `DATABASE_URL` 必須一致。`npm.cmd run db:check-config` 會檢查一致性，且不顯示帳號、密碼或連線字串。密碼只供本機開發使用，不會送至 React 前端。

若 `5432` 已被其他服務佔用，先查明來源，不要停止其他服務；在 `.env` 同時更改 `POSTGRES_PORT` 與 `DATABASE_URL` 中的埠號，再執行設定檢查。

## 日常操作

在專案根目錄執行：

```powershell
npm.cmd run db:check-config
npm.cmd run db:up
npm.cmd run db:ps
npm.cmd run db:logs
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run dev
```

`db:up` 使用 `docker compose up -d --wait postgres`，等待 healthcheck。`db:logs` 僅讀取日誌。`db:migrate` 使用既有 Prisma 7 migration，執行前務必確認資料庫名稱與目前資料；不要對含有需保留資料的資料庫任意套用 migration。

停止與重新啟動：

```powershell
npm.cmd run db:down
npm.cmd run db:restart
```

`db:down` 僅執行 `docker compose stop postgres`，保留容器與 Volume。`docker compose down` 會移除容器但通常保留 named Volume；`docker compose down -v` 會刪除 named Volume，可能造成資料永久遺失，**不得作為日常停止指令**。Prisma `migrate reset` 也會清除資料，不用於本專案日常開發。

PostgreSQL 官方映像只在空資料目錄首次啟動時使用 `POSTGRES_DB`、`POSTGRES_USER` 與 `POSTGRES_PASSWORD` 初始化。更改 `.env` 不會重設既有 Volume 的帳號或密碼。遇到設定不一致時，先查明資料狀態，不要刪除 Volume。
