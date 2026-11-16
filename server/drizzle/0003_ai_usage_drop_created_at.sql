DROP INDEX "ai_usage_created_at_idx";--> statement-breakpoint
DROP INDEX "ai_usage_user_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "ai_usage" DROP COLUMN "created_at";