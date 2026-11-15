import { defineConfig } from "@playwright/test";

/**
 * Testes de ponta a ponta no Chrome instalado na máquina (sem baixar navegador).
 * Rode com o `npm run dev` no ar: `npx playwright test`.
 */
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/playwright",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    channel: "chrome",
    headless: true,
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      // WebGL por software, para rodar igual em qualquer máquina.
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        // Microfone e câmera falsos (tom e imagem de teste) para testar voz e vídeo.
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
