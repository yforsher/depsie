-- Anonymous analytics: one row per visit and per report request. Never the need text,
-- dependency names, the report or the IP address.
create table if not exists events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('visit', 'report')),
  -- Hash of the IP with a salt that is replaced daily and never stored, so it only links the
  -- events of one visitor within one day.
  visitor text not null,
  -- ISO 3166 country code from the IP; null when unknown.
  country text,
  -- Report requests only.
  framework text,
  status smallint,
  prompt_tokens integer,
  completion_tokens integer,
  cost numeric
);
