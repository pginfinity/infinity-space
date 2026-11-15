/**
 * Mistura as vozes de uma reunião numa faixa só (mono, 48 kHz, 16 bits), num relógio fixo.
 * Cada pessoa tem um pequeno buffer contra variação de rede: só começa a tocar depois de juntar
 * PRIME amostras, e se esvaziar entra silêncio até juntar de novo. Assim a gravação segue contínua
 * mesmo quando ninguém fala, quando alguém entra ou quando alguém sai.
 */

export const RATE = 48_000;
/** 60 ms de folga contra variação de rede. */
const PRIME = (RATE * 60) / 1000;
/** Mais de 1 s acumulado: descarta o excesso (a pessoa estava atrasada demais). */
const MAX_BUFFER = RATE;

interface Voice {
  chunks: Int16Array[];
  /** Posição de leitura no primeiro bloco. */
  head: number;
  size: number;
  primed: boolean;
}

export class Mixer {
  private readonly voices = new Map<string, Voice>();

  /** Entrega amostras recebidas de uma pessoa (mono, 48 kHz). */
  push(id: string, samples: Int16Array): void {
    let v = this.voices.get(id);
    if (!v) {
      v = { chunks: [], head: 0, size: 0, primed: false };
      this.voices.set(id, v);
    }
    v.chunks.push(samples);
    v.size += samples.length;
    while (v.size > MAX_BUFFER) this.skip(v, v.size - MAX_BUFFER);
    if (v.size >= PRIME) v.primed = true;
  }

  remove(id: string): void {
    this.voices.delete(id);
  }

  get count(): number {
    return this.voices.size;
  }

  /** Próximas `n` amostras da mistura. */
  pull(n: number): Int16Array {
    const acc = new Int32Array(n);
    for (const v of this.voices.values()) {
      if (!v.primed) continue;
      let filled = 0;
      while (filled < n && v.chunks.length) {
        const c = v.chunks[0]!;
        const take = Math.min(n - filled, c.length - v.head);
        for (let i = 0; i < take; i++) acc[filled + i]! += c[v.head + i]!;
        filled += take;
        v.head += take;
        v.size -= take;
        if (v.head >= c.length) {
          v.chunks.shift();
          v.head = 0;
        }
      }
      if (filled < n) v.primed = false; // esvaziou: espera juntar de novo
    }
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.max(-32768, Math.min(32767, acc[i]!));
    return out;
  }

  private skip(v: Voice, n: number): void {
    while (n > 0 && v.chunks.length) {
      const c = v.chunks[0]!;
      const take = Math.min(n, c.length - v.head);
      v.head += take;
      v.size -= take;
      n -= take;
      if (v.head >= c.length) {
        v.chunks.shift();
        v.head = 0;
      }
    }
  }
}
