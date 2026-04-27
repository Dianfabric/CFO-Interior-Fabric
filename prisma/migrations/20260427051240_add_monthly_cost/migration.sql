-- CreateTable
CREATE TABLE "monthly_costs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cost_category_id" TEXT NOT NULL,
    "year_month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "monthly_costs_cost_category_id_fkey" FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "monthly_costs_year_month_idx" ON "monthly_costs"("year_month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_costs_cost_category_id_year_month_key" ON "monthly_costs"("cost_category_id", "year_month");
