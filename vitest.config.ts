import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Each test file gets its own scheduler folder (runs, the workspace
    // database), not the project's .scheduler.
    setupFiles: ['./tests/setup-env.ts'],
  },
})
