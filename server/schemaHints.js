// 42703 is Postgres' "undefined column". Reaching it at runtime means a
// migration in supabase/migrations was never applied, which is worth saying
// plainly rather than returning a bare gateway error or leaking the column name.
export function missingColumnHint(error, migration) {
  if (error?.code === "42703" || /column .* does not exist/i.test(error?.message || "")) {
    return `The database is missing columns this build needs. Run supabase/migrations/${migration} in the Supabase SQL editor.`;
  }
  return null;
}
