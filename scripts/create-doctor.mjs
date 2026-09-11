// Creates a doctor account directly, bypassing the approval queue. Nobody can
// approve the very first administrator, so that one has to be made here.
//
//   node --env-file=.env scripts/create-doctor.mjs \
//     --email doctor@example.com --name "Dr Adaeze Okonkwo" --role admin
//
// Prints a generated password when you do not supply one.
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "../server/supabaseAdmin.js";

function readFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const value = argv[index + 1];
    flags[key] = !value || value.startsWith("--") ? true : value;
  }
  return flags;
}

const flags = readFlags(process.argv.slice(2));
const email = String(flags.email || "").trim().toLowerCase();
const name = String(flags.name || "").trim();
const role = String(flags.role || "doctor");
const licenceNumber = flags.licence ? String(flags.licence) : null;
const password = typeof flags.password === "string" ? flags.password : randomBytes(12).toString("base64url");

if (!email || !name) {
  console.error("Usage: node --env-file=.env scripts/create-doctor.mjs --email <email> --name <name> [--role admin] [--licence <number>] [--password <password>]");
  process.exit(1);
}
const ROLES = ["chew", "cho", "nurse", "doctor", "admin"];
if (!ROLES.includes(role)) {
  console.error(`Role must be one of ${ROLES.join(", ")} — not "${role}".`);
  process.exit(1);
}

const supabase = getSupabaseAdmin();

// email_confirm skips the confirmation mail, which matters because the project's
// built-in SMTP is rate limited to a handful of messages an hour.
const { data: created, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (authError && !/already been registered/i.test(authError.message)) {
  console.error(`Could not create the sign-in: ${authError.message}`);
  process.exit(1);
}

const { data: doctor, error } = await supabase
  .from("doctors")
  .upsert({ name, email, role, status: "approved", licence_number: licenceNumber, reviewed_at: new Date().toISOString() }, { onConflict: "email" })
  .select("id,name,email,role,status")
  .single();
if (error) {
  console.error(`Could not write the doctor record: ${error.message}`);
  process.exit(1);
}

const LABELS = { admin: "Administrator", doctor: "Doctor", chew: "Community health extension worker", cho: "Community health officer", nurse: "Nurse" };
console.log(`${LABELS[doctor.role] || "Clinician"} ready: ${doctor.email}`);
if (created?.user) console.log(`Password: ${password}`);
else console.log("Sign-in already existed, so the password was left unchanged.");
console.log("Sign in at /doctor/login");
