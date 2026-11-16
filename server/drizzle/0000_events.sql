CREATE TABLE IF NOT EXISTS "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"visitor" text NOT NULL,
	"country" text,
	"framework" text,
	"status" smallint,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost" numeric,
	CONSTRAINT "events_kind_check" CHECK ("events"."kind" in ('visit', 'report'))
);
