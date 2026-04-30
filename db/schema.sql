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
  create type writing_session_status as enum (
    'draft',
    'submitted',
    'summary_pending',
    'summary_submitted',
    'report_ready',
    'archived'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type snapshot_kind as enum ('initial', 'checkpoint', 'submitted');
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

create table if not exists auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references app_users(id),
  title text not null,
  prompt text not null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists assignment_instructors (
  assignment_id uuid not null references assignments(id) on delete cascade,
  professor_id uuid not null references app_users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (assignment_id, professor_id),
  check (role in ('owner', 'reviewer'))
);

insert into assignment_instructors (assignment_id, professor_id, role)
select id, professor_id, 'owner'
from assignments
on conflict (assignment_id, professor_id) do nothing;

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
  status writing_session_status not null default 'draft',
  attempt_number integer not null default 1,
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (attempt_number >= 1),
  check (locked_at is null or submitted_at is not null)
);

alter table writing_sessions
drop constraint if exists writing_sessions_assignment_id_student_id_key;

alter table writing_sessions
add column if not exists status writing_session_status not null default 'draft',
add column if not exists attempt_number integer not null default 1,
add column if not exists updated_at timestamptz not null default now(),
add column if not exists archived_at timestamptz;

alter table writing_sessions
drop constraint if exists writing_sessions_attempt_number_check;

alter table writing_sessions
add constraint writing_sessions_attempt_number_check check (attempt_number >= 1);

create unique index if not exists writing_sessions_attempt_unique
on writing_sessions(assignment_id, student_id, attempt_number);

create table if not exists writing_session_state (
  session_id uuid primary key references writing_sessions(id) on delete cascade,
  current_text text not null default '',
  current_text_sha256 text not null,
  last_event_index integer not null default -1,
  updated_at timestamptz not null default now(),
  check (last_event_index >= -1),
  check (length(current_text_sha256) = 64)
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
  kind snapshot_kind not null default 'submitted',
  event_index integer,
  created_at timestamptz not null default now(),
  unique (session_id, snapshot_index),
  check (snapshot_index >= 0),
  check (event_index is null or event_index >= 0),
  check (length(text_sha256) = 64)
);

alter table submission_snapshots
add column if not exists kind snapshot_kind not null default 'submitted',
add column if not exists event_index integer;

insert into writing_session_state (session_id, current_text, current_text_sha256, last_event_index)
select
  writing_sessions.id,
  coalesce(latest_snapshot.text, ''),
  encode(digest(coalesce(latest_snapshot.text, ''), 'sha256'), 'hex'),
  coalesce(latest_event.event_index, -1)
from writing_sessions
left join lateral (
  select text
  from submission_snapshots
  where submission_snapshots.session_id = writing_sessions.id
  order by snapshot_index desc
  limit 1
) latest_snapshot on true
left join lateral (
  select event_index
  from writing_events
  where writing_events.session_id = writing_sessions.id
  order by event_index desc
  limit 1
) latest_event on true
on conflict (session_id) do nothing;

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
  report_id uuid references professor_reports(id) on delete set null,
  provider text not null,
  model text not null,
  request_json jsonb not null,
  response_json jsonb not null,
  schema_version text not null,
  fallback_used boolean not null default false,
  prompt_hash text,
  input_hash text,
  output_hash text,
  latency_ms integer,
  token_usage jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(request_json) = 'object'),
  check (jsonb_typeof(response_json) = 'object'),
  check (prompt_hash is null or length(prompt_hash) = 64),
  check (input_hash is null or length(input_hash) = 64),
  check (output_hash is null or length(output_hash) = 64),
  check (latency_ms is null or latency_ms >= 0),
  check (token_usage is null or jsonb_typeof(token_usage) = 'object')
);

alter table ai_evaluation_logs
add column if not exists report_id uuid references professor_reports(id) on delete set null,
add column if not exists prompt_hash text,
add column if not exists input_hash text,
add column if not exists output_hash text,
add column if not exists latency_ms integer,
add column if not exists token_usage jsonb;

create index if not exists auth_identities_user_idx on auth_identities(user_id);
create index if not exists assignments_professor_created_idx on assignments(professor_id, created_at desc);
create index if not exists assignment_instructors_professor_idx on assignment_instructors(professor_id);
create index if not exists assignment_students_student_idx on assignment_students(student_id);
create index if not exists writing_sessions_assignment_idx on writing_sessions(assignment_id);
create index if not exists writing_sessions_student_idx on writing_sessions(student_id);
create index if not exists writing_sessions_assignment_status_idx on writing_sessions(assignment_id, status);
create index if not exists writing_sessions_student_status_idx on writing_sessions(student_id, status);
create index if not exists writing_events_session_idx on writing_events(session_id, event_index);
create index if not exists submission_snapshots_session_idx on submission_snapshots(session_id, snapshot_index);
create index if not exists submission_snapshots_session_kind_idx on submission_snapshots(session_id, kind, snapshot_index);
create index if not exists timed_summaries_session_created_idx on timed_summaries(session_id, created_at desc);
create index if not exists professor_reports_session_idx on professor_reports(session_id);
create index if not exists professor_reports_professor_generated_idx on professor_reports(professor_id, generated_at desc);
create index if not exists ai_evaluation_logs_session_created_idx on ai_evaluation_logs(session_id, created_at desc);

update writing_sessions
set status = case
  when archived_at is not null then 'archived'::writing_session_status
  when exists (select 1 from timed_summaries where timed_summaries.session_id = writing_sessions.id) then 'summary_submitted'::writing_session_status
  when submitted_at is not null then 'summary_pending'::writing_session_status
  else 'draft'::writing_session_status
end;

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
