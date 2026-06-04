/**
 * Global test setup (registered via `setupFiles` in vitest.config.ts).
 *
 * Runs once per test file, before the file's module graph is evaluated. It
 * redirects Sentiph's global state directory to a unique temp directory so that
 * tests never read from or write to the developer's real `~/.sentiph`. Without
 * this, tests that touch `GLOBAL_SENTIPH_DIR` / `PROJECTS_FILE` race against any
 * live Sentiph instance writing to the same files, producing flaky failures.
 *
 * `SENTIPH_HOME_DIR` is consumed at module load by projectPersistence.ts, so it
 * must be set here (in setup) rather than inside a test, where the constant
 * would already be frozen.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const isolatedHome = mkdtempSync(join(tmpdir(), "sentiph-test-home-"));
process.env.SENTIPH_HOME_DIR = isolatedHome;

// Pin the Claude launcher token so bootstrap-command assertions stay
// deterministic regardless of the host OS or how `claude` is installed there.
// resolveClaudeCommand() otherwise probes PATH and, on Windows, returns an
// absolute `claude.cmd` path — which would break the exact-string checks that
// integration tests make against the PTY bootstrap write.
process.env.SENTIPH_CLAUDE_PATH = "claude";

afterAll(() => {
  rmSync(isolatedHome, { recursive: true, force: true });
});
