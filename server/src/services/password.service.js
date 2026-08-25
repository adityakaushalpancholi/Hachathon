/**
 * What counts as an acceptable password, in one place.
 *
 * The rules are deliberately short. Long composition rules ("one uppercase, one
 * symbol, no repeated characters") push people toward `Passw0rd!` — predictable
 * in exactly the way the rule was meant to prevent — so the weight here is on
 * length and on refusing the passwords that actually appear in breach lists.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt truncates beyond this; refuse rather than silently cut

/**
 * Passwords common enough that a guesser tries them first. Not a substitute for
 * a full breach corpus — it is the short head of the distribution, which is
 * where nearly all the risk in a small deployment actually sits.
 */
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyui', 'iloveyou', 'admin123', 'letmein1', 'welcome1',
  'abc12345', 'password!', 'passw0rd', 'monkey123', 'football', 'baseball',
  'sunshine', 'princess', 'dragon123', 'shadow123', 'master123', 'superman',
  'trustno1', 'starwars', 'whatever', 'computer', 'internet', 'samsung1',
  'india123', 'bharat123', 'krishna1', 'ganesh123', 'test1234', 'demo1234',
  'customer123', 'worker123', 'changeme', 'secret123', 'default1',
]);

/**
 * Judge a password, returning every problem rather than the first.
 *
 * Reporting one failure at a time turns a single fix into a guessing game, so
 * the caller gets the whole list and the user corrects everything at once.
 *
 * `context` holds values that must not appear inside the password — a name or a
 * phone number is public, and a password built from one is not a secret.
 */
export function assessPassword(plain, context = {}) {
  const problems = [];
  const value = String(plain ?? '');

  if (value.length < PASSWORD_MIN) {
    problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  }
  if (value.length > PASSWORD_MAX) {
    problems.push(`Keep it under ${PASSWORD_MAX} characters.`);
  }
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    problems.push('Mix letters and numbers.');
  }
  if (COMMON.has(value.toLowerCase())) {
    problems.push('That password is one of the first any guesser tries.');
  }
  if (/^(.)\1+$/.test(value)) {
    problems.push('Use more than one repeated character.');
  }

  /* Each word of the context is checked, not the whole string.
     "Aditya Pancholi" as a full name never appears inside a password, so
     comparing it whole would wave through `Aditya@2007` — which is precisely
     the shape this rule exists to catch. Tokens shorter than four characters
     are skipped: they collide with ordinary words too often to be evidence. */
  const lower = value.toLowerCase();
  const flagged = new Set();

  for (const [label, raw] of Object.entries(context)) {
    const tokens = String(raw ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);

    if (tokens.some((t) => lower.includes(t)) && !flagged.has(label)) {
      flagged.add(label);
      problems.push(`Do not build it from your ${label}.`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * A 0-4 score for the strength meter.
 *
 * Presentational only — `assessPassword` is what decides acceptance. The two
 * are kept apart so nudging the meter's feel can never quietly change what the
 * server will accept.
 */
export function passwordScore(plain) {
  const value = String(plain ?? '');
  if (!value) return 0;

  let score = 0;
  if (value.length >= PASSWORD_MIN) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^a-zA-Z0-9]/.test(value)) score += 1;
  if (COMMON.has(value.toLowerCase())) return 0;

  return Math.min(score, 4);
}
