-- A null category represents the overall monthly spending budget.
ALTER TABLE "Budget" ALTER COLUMN "categoryId" DROP NOT NULL;

-- PostgreSQL permits repeated NULL values in ordinary unique indexes. Keep the
-- existing (userId, categoryId, month) unique index for category budgets and
-- protect the one-overall-budget-per-user-month rule separately.
CREATE UNIQUE INDEX "Budget_userId_month_overall_key"
  ON "Budget" ("userId", "month")
  WHERE "categoryId" IS NULL;
