import { defineConfig } from "@playwright/test";

/** Screenshots da galeria de móveis (temporário, fora do e2e). */
export default defineConfig({
  testDir: ".",
  outputDir: "../../../../../../test-results/furniture/_pw",
  timeout: 300_000,
  reporter: [["list"]],
  use: {
    channel: "chrome",
    headless: true,
    baseURL: "http://localhost:5173",
    viewport: { width: 1600, height: 1000 },
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
});
