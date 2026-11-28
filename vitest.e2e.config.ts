import { defineConfig } from "vitest/config";

// E2E config, kept separate from the default `npm test` suite because these tests
// launch a real Electron window and so need a display (DISPLAY :0, or an Xvfb
// virtual display) - they cannot run inside the Bash sandbox. The default
// vitest.config.ts includes only test/**, so `npm test` never picks these up.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
