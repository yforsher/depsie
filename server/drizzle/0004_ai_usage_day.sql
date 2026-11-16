ALTER TABLE "ai_usage" ADD COLUMN "day" date DEFAULT (now() at time zone 'utc')::date NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_usage_day_idx" ON "ai_usage" USING btree ("day");--> statement-breakpoint
CREATE INDEX "ai_usage_user_id_day_idx" ON "ai_usage" USING btree ("user_id","day");