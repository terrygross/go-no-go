/**
 * Build the web app for Android and copy it into the native project.
 *
 * This exists because of how v1.4 shipped. The web build happily succeeds
 * without a RevenueCat key: `billingChannel()` just returns "unavailable" and
 * the paywall politely says purchases are not available right now. Nothing
 * errors, nothing is logged, and the bundle uploads to Play looking perfect —
 * and then cannot take a single payment. That mistake cost a release, so the
 * key is now checked *before* anything is built, and a missing one stops the
 * build the way it already does in the iOS workflow.
 *
 *   npm run build:android
 *
 * The key is the PUBLIC, app-specific Play key from RevenueCat (Project
 * settings -> API keys). It starts `goog_`, it ships inside the APK, and it is
 * not a secret. The `sk_` secret key must never appear here: it belongs only
 * in the Worker, as REVENUECAT_SECRET_API_KEY.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const KEY = "VITE_REVENUECAT_ANDROID_KEY";

const die = (...lines) => {
  console.error(`\n  Android build stopped.\n\n  ${lines.join("\n  ")}\n`);
  process.exit(1);
};

/**
 * Read the key the same way Vite will: a real environment variable wins, and
 * .env.local is the fallback. Parsed by hand rather than with dotenv so this
 * script has no dependency of its own and cannot fail to run.
 */
function readKey() {
  if (process.env[KEY]) return process.env[KEY].trim();
  const envFile = join(root, ".env.local");
  if (!existsSync(envFile)) return "";
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[1] === KEY) return m[2].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const key = readKey();

if (!key) {
  die(
    `${KEY} is not set, so this build could not sell anything.`,
    "",
    "Put the public Play key from RevenueCat in .env.local at the repo root:",
    "",
    `    ${KEY}=goog_xxxxxxxxxxxxxxxx`,
    "",
    "See docs/BILLING_SETUP.md, section 1.",
  );
}
if (key.startsWith("sk_")) {
  die(
    `${KEY} looks like a RevenueCat SECRET key (sk_...).`,
    "That must never be built into the app: anyone could read it out of the",
    "APK and read or alter every subscriber. Use the public key, which starts",
    "`goog_`, and keep the secret one in the Worker only.",
  );
}
if (key.startsWith("appl_")) {
  die(`${KEY} is the iOS key (appl_...). Android needs the goog_ one.`);
}
if (!key.startsWith("goog_")) {
  die(
    `${KEY} does not look like a RevenueCat Play key.`,
    "It should start `goog_`. Check you copied the App-specific public key for",
    "the Play Store app, not a project key or an App Store one.",
  );
}

// npm and npx are .cmd shims on Windows, which Node will not launch through
// execFile without a shell. These two command lines are fixed literals with
// nothing interpolated into them, so running them through the shell is safe.
const run = (command, cwd) => execSync(command, { cwd, stdio: "inherit" });

console.log(`\n  Billing key present (${key.slice(0, 10)}…). Building.\n`);
run("npm run build", root);

// Capacitor's webDir is app/dist, but Vite builds to dist/ at the root, so the
// output is copied across rather than built twice.
const appDist = join(root, "app", "dist");
rmSync(appDist, { recursive: true, force: true });
cpSync(join(root, "dist"), appDist, { recursive: true });

run("npx cap sync android", join(root, "app"));

console.log(
  "\n  Android project updated.\n" +
    "  Next: npx cap open android, or from app/android:\n" +
    "      ./gradlew bundleRelease\n",
);
