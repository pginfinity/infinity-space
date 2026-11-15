import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Persistência simples em JSON (um arquivo por chave), para coisas que ficam de um dia para o outro:
 * recados do mural, plantas, rankings, perguntas do quiz.
 * Grava com atraso (agrupa mudanças) e de forma atômica (arquivo temporário + rename).
 *
 * Pasta: DATA_DIR ou apps/server/data (fora do Git).
 * Regra da casa: nada de métrica individual de tempo, atividade ou fala. Ranking de jogo é ok.
 */
export class Store {
  private readonly cache = new Map<string, unknown>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  /** Lê o valor salvo (ou `fallback` se não existe ou está corrompido). */
  get<T>(key: string, fallback: T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    let value: T;
    try {
      value = JSON.parse(readFileSync(this.file(key), "utf8")) as T;
    } catch {
      value = fallback;
    }
    this.cache.set(key, value);
    return value;
  }

  /** Guarda o valor (em memória na hora; em disco em até `delayMs`). */
  set<T>(key: string, value: T, delayMs = 1000): void {
    this.cache.set(key, value);
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => this.write(key), delayMs),
    );
  }

  /** Grava tudo que está pendente (ao desligar). */
  flush(): void {
    for (const [key, t] of this.timers) {
      clearTimeout(t);
      this.write(key);
    }
    this.timers.clear();
  }

  private write(key: string): void {
    this.timers.delete(key);
    const file = this.file(key);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.cache.get(key)));
    renameSync(tmp, file);
  }

  private file(key: string): string {
    if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(key) || key.includes("..")) throw new Error(`chave inválida: ${key}`);
    return join(this.dir, `${key}.json`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(here, "../data");
