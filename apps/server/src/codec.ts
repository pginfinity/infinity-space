import { Packr } from "msgpackr";
import type { ClientMsg, ServerMsg } from "@infinity/world";

const packr = new Packr({ useRecords: false, int64AsType: "number" });

export const encode = (msg: ServerMsg): Buffer => packr.pack(msg);

/** Decodifica e valida o formato mínimo. Retorna null para qualquer coisa estranha. */
export function decode(data: Buffer | ArrayBuffer | Buffer[]): ClientMsg | null {
  try {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.byteLength > 16 * 1024) return null;
    const msg = packr.unpack(buf) as unknown;
    if (!msg || typeof msg !== "object" || typeof (msg as { t?: unknown }).t !== "string") return null;
    return msg as ClientMsg;
  } catch {
    return null;
  }
}
