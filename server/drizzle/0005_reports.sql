CREATE TABLE "report_versions" (
	"report_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"report" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_versions_report_id_version_pk" PRIMARY KEY("report_id","version"),
	CONSTRAINT "report_versions_source_check" CHECK ("report_versions"."source" in ('pipeline', 'refresh', 'chat', 'agent'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"share_id" text,
	"need" text NOT NULL,
	"framework" text NOT NULL,
	"dependencies" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "report_id" uuid;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_user_id_idx" ON "reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_expires_at_idx" ON "reports" USING btree ("expires_at");