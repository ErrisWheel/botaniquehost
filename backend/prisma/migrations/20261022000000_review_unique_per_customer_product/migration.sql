-- Keep the newest existing review when older data contains duplicates.
-- Back up the database before applying migrations in production.
WITH ranked_reviews AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "userId", "productId"
            ORDER BY "createdAt" DESC, "id" DESC
        ) AS row_number
    FROM "Review"
)
DELETE FROM "Review" AS review
USING ranked_reviews
WHERE review."id" = ranked_reviews."id"
  AND ranked_reviews.row_number > 1;

CREATE UNIQUE INDEX "Review_userId_productId_key"
ON "Review"("userId", "productId");
