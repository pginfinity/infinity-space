import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { GoogleAuth } from "google-auth-library";

/**
 * Envio das gravações para o Google Drive do time (um Drive compartilhado do Workspace),
 * com uma conta de serviço. Configuração (só na VPS, em variáveis de ambiente):
 * - GOOGLE_APPLICATION_CREDENTIALS: caminho do JSON da conta de serviço;
 * - DRIVE_FOLDER_ID: id da pasta de destino (a conta de serviço precisa ser membro do Drive compartilhado).
 * Sem isso, as gravações ficam salvas no servidor (DATA_DIR/gravacoes) até a configuração existir.
 */

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export function driveConfigured(): boolean {
  return !!process.env.DRIVE_FOLDER_ID && !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

export interface UploadResult {
  id: string;
  link: string;
}

/** Envia um arquivo (upload retomável) e devolve o link para abrir no Drive. */
export async function uploadToDrive(file: string, opts: { name?: string; description?: string; mimeType?: string } = {}): Promise<UploadResult> {
  const folder = process.env.DRIVE_FOLDER_ID;
  if (!folder) throw new Error("DRIVE_FOLDER_ID não configurado");
  const auth = new GoogleAuth({ scopes: SCOPES });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error("sem token do Google");
  const body = await readFile(file);
  const mimeType = opts.mimeType ?? "audio/ogg";

  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(body.length),
    },
    body: JSON.stringify({ name: opts.name ?? basename(file), parents: [folder], mimeType, description: opts.description }),
  });
  if (!init.ok) throw new Error(`Drive recusou o envio (${init.status}): ${(await init.text()).slice(0, 200)}`);
  const location = init.headers.get("location");
  if (!location) throw new Error("Drive não devolveu o endereço de envio");

  const put = await fetch(location, { method: "PUT", headers: { "Content-Type": mimeType, "Content-Length": String(body.length) }, body });
  if (!put.ok) throw new Error(`falha no envio ao Drive (${put.status}): ${(await put.text()).slice(0, 200)}`);
  const meta = (await put.json()) as { id: string; webViewLink?: string };
  return { id: meta.id, link: meta.webViewLink ?? `https://drive.google.com/file/d/${meta.id}/view` };
}
