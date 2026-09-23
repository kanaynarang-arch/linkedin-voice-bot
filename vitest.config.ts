import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // better-sqlite3's native addon can crash Node's worker-thread pool
    // during GC teardown of in-memory databases; forked child processes
    // avoid that entirely.
    pool: "forks",
  },
});
