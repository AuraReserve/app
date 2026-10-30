-- CreateTable
CREATE TABLE "two_factors" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failed_verification_count" INTEGER DEFAULT 0,
    "locked_until" TIMESTAMP(3),

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "two_factors_secret_idx" ON "two_factors"("secret");

-- CreateIndex
CREATE INDEX "two_factors_user_id_idx" ON "two_factors"("user_id");

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

