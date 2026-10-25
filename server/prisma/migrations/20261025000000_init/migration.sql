-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "preferredCurrency" VARCHAR(3) NOT NULL DEFAULT 'TWD',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "EntryType" NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "icon" VARCHAR(60) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "type" "EntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" VARCHAR(500),
    "transactionDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Category_userId_type_idx" ON "Category"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_type_key" ON "Category"("id", "userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_type_name_key" ON "Category"("userId", "type", "name");

-- CreateIndex
CREATE INDEX "Transaction_userId_transactionDate_idx" ON "Transaction"("userId", "transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_userId_type_idx" ON "Transaction"("categoryId", "userId", "type");

-- CreateIndex
CREATE INDEX "Budget_userId_month_idx" ON "Budget"("userId", "month");

-- CreateIndex
CREATE INDEX "Budget_categoryId_userId_idx" ON "Budget"("categoryId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_categoryId_month_key" ON "Budget"("userId", "categoryId", "month");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_userId_type_fkey" FOREIGN KEY ("categoryId", "userId", "type") REFERENCES "Category"("id", "userId", "type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money must be positive. These database constraints complement API validation.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_amount_positive" CHECK ("amount" > 0);

-- Store a budget month as its first calendar day.
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_month_first_day" CHECK (EXTRACT(DAY FROM "month") = 1);
