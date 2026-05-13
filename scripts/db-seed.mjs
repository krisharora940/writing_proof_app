import { createHash } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const ids = {
  student: "11111111-1111-4111-8111-111111111111",
  professor: "22222222-2222-4222-8222-222222222222",
  class: "55555555-5555-4555-8555-555555555555",
  assignment: "33333333-3333-4333-8333-333333333333",
  session: "44444444-4444-4444-8444-444444444444"
};

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("begin");
  await pool.query(
    `insert into app_users (id, email, display_name, role)
     values
       ($1, 'student@example.test', 'Demo Student', 'student'),
       ($2, 'professor@example.test', 'Demo Professor', 'professor')
     on conflict (id) do update
     set email = excluded.email,
         display_name = excluded.display_name,
         role = excluded.role`,
    [ids.student, ids.professor]
  );
  await pool.query(
    `insert into assignments (id, professor_id, title, prompt, kind)
     values ($1, $2, 'Demo Class', 'Demo class workspace.', 'class')
     on conflict (id) do update
     set professor_id = excluded.professor_id,
         title = excluded.title,
         prompt = excluded.prompt,
         kind = excluded.kind`,
    [ids.class, ids.professor]
  );
  await pool.query(
    `insert into assignments (id, professor_id, title, prompt, kind, class_id)
     values ($1, $2, 'Process Evidence Reflection', $3, 'assignment', $4)
     on conflict (id) do update
     set professor_id = excluded.professor_id,
         title = excluded.title,
         prompt = excluded.prompt,
         kind = excluded.kind,
         class_id = excluded.class_id`,
    [
      ids.assignment,
      ids.professor,
      "Write a short paper on whether process evidence is fairer than final-text AI detection.",
      ids.class
    ]
  );
  await pool.query(
    `insert into assignment_students (assignment_id, student_id)
     values ($1, $2)
     on conflict (assignment_id, student_id) do nothing`,
    [ids.class, ids.student]
  );
  await pool.query(
    `insert into assignment_students (assignment_id, student_id)
     values ($1, $2)
     on conflict (assignment_id, student_id) do nothing`,
    [ids.assignment, ids.student]
  );
  await pool.query(
    `insert into assignment_instructors (assignment_id, professor_id, role)
     values
       ($1, $2, 'owner'),
       ($3, $2, 'owner')
     on conflict (assignment_id, professor_id) do nothing`,
    [ids.assignment, ids.professor, ids.class]
  );
  await pool.query(
    `insert into auth_identities (user_id, provider, provider_subject, email)
     values
       ($1, 'demo', 'demo-student', 'student@example.test'),
       ($2, 'demo', 'demo-professor', 'professor@example.test')
     on conflict (provider, provider_subject) do update
     set user_id = excluded.user_id,
         email = excluded.email`,
    [ids.student, ids.professor]
  );
  await pool.query(
    `insert into writing_sessions (id, assignment_id, student_id)
     values ($1, $2, $3)
     on conflict (id) do nothing`,
    [ids.session, ids.assignment, ids.student]
  );
  await pool.query(
    `insert into submission_snapshots (session_id, snapshot_index, captured_at, text, text_sha256)
     values ($1, 0, now(), '', $2)
     on conflict (session_id, snapshot_index) do nothing`,
    [ids.session, sha256("")]
  );
  await pool.query(
    `insert into writing_session_state (session_id, current_text, current_text_sha256, last_event_index)
     values ($1, '', $2, -1)
     on conflict (session_id) do nothing`,
    [ids.session, sha256("")]
  );
  await pool.query("commit");
  console.log("Demo data seeded.");
} catch (error) {
  await pool.query("rollback");
  throw error;
} finally {
  await pool.end();
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
