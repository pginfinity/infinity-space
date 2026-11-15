// Sobe o servidor do LiveKit em modo de desenvolvimento (chave devkey / segredo secret).
// O binário fica em .tools/livekit (fora do Git). Em produção o LiveKit roda em Docker na VPS.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const bin = join(process.cwd(), ".tools", "livekit", process.platform === "win32" ? "livekit-server.exe" : "livekit-server");
if (!existsSync(bin)) {
  console.log("[livekit] binário não encontrado em .tools/livekit. Voz e vídeo ficam desligados.");
  console.log("[livekit] baixe em https://github.com/livekit/livekit/releases e extraia nessa pasta.");
  setInterval(() => {}, 1 << 30);
} else {
  const child = spawn(bin, ["--dev", "--bind", "0.0.0.0"], { stdio: "inherit" });
  const stop = () => child.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}
