import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const result = await pool.query(
    `with deleted as (
       delete from signup_email_verifications
       where expires_at <= now()
       returning 1
     )
     select count(*)::text as deleted_count from deleted`
  );
  console.log(`Deleted ${Number(result.rows[0]?.deleted_count || 0)} expired signup verifications.`);
} finally {
  await pool.end();
}
