create extension if not exists pgcrypto;

do $$
begin
  create type user_role as enum ('student', 'professor', 'admin');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type writing_event_type as enum ('insert', 'delete', 'paste', 'submit');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type report_observation_group as enum (
    'Major Event',
    'Context Event',
    'Typical Process Indicator',
    'Comprehension Check'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  role user_role not null,
  created_at timestamptz not null default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references app_users(id),
  title text not null,
  prompt text not null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists assignment_students (
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

create table if not exists writing_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id),
  student_id uuid not null references app_users(id),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  locked_at timestamptz,
  unique (assignment_id, student_id),
  check (locked_at is null or submitted_at is not null)
);

create table if not exists writing_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references writing_sessions(id) on delete cascade,
  event_index integer not null,
  type writing_event_type not null,
  occurred_at timestamptz not null,
  input_type text,
  start_offset integer,
  removed text,
  added text,
  removed_characters integer,
  added_words integer,
  removed_words integer,
  duration_since_previous_ms integer,
  paste_words integer,
  deletion_event boolean not null default false,
  words integer,
  created_at timestamptz not null default now(),
  unique (session_id, event_index),
  check (event_index >= 0),
  check (start_offset is null or start_offset >= 0),
  check (removed_characters is null or removed_characters >= 0),
  check (added_words is null or added_words >= 0),
  check (removed_words is null or removed_words >= 0),
  check (duration_since_previous_ms is null or duration_since_previous_ms >= 0),
  check (paste_words is null or paste_words >= 0),
  check (words is null or words >= 0)
);

create table if not exists submission_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references writing_sessions(id) on delete cascade,
  snapshot_index integer not null,
  captured_at timestamptz not null,
  text text not null,
  text_sha256 text not null,
  created_at timestamptz not null default now(),
  unique (session_id, snapshot_index),
  check (snapshot_index >= 0),
  check (length(text_sha256) = 64)
);

create table if not exists timed_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references writing_sessions(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  summary_text text not null,
  summary_text_sha256 text not null,
  created_at timestamptz not null default now(),
  check (completed_at >= started_at),
  check (length(summary_text_sha256) = 64)
);

create table if not exists professor_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references writing_sessions(id) on delete cascade,
  professor_id uuid not null references app_users(id),
  generated_at timestamptz not null default now(),
  observations jsonb not null,
  replay_frame_count integer not null,
  exported_at timestamptz,
  check (jsonb_typeof(observations) = 'array'),
  check (replay_frame_count >= 0)
);

create table if not exists ai_evaluation_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references writing_sessions(id) on delete cascade,
  provider text not null,
  model text not null,
  request_json jsonb not null,
  response_json jsonb not null,
  schema_version text not null,
  fallback_used boolean not null default false,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(request_json) = 'object'),
  check (jsonb_typeof(response_json) = 'object')
);

create index if not exists writing_sessions_assignment_idx on writing_sessions(assignment_id);
create index if not exists writing_sessions_student_idx on writing_sessions(student_id);
create index if not exists writing_events_session_idx on writing_events(session_id, event_index);
create index if not exists submission_snapshots_session_idx on submission_snapshots(session_id, snapshot_index);
create index if not exists professor_reports_session_idx on professor_reports(session_id);

create or replace function prevent_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Evidence records are append-only and immutable';
end;
$$;

drop trigger if exists writing_events_are_immutable on writing_events;
create trigger writing_events_are_immutable
before update or delete on writing_events
for each row execute function prevent_evidence_mutation();

drop trigger if exists submission_snapshots_are_immutable on submission_snapshots;
create trigger submission_snapshots_are_immutable
before update or delete on submission_snapshots
for each row execute function prevent_evidence_mutation();

drop trigger if exists timed_summaries_are_immutable on timed_summaries;
create trigger timed_summaries_are_immutable
before update or delete on timed_summaries
for each row execute function prevent_evidence_mutation();
