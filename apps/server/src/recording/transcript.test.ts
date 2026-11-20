import { describe, expect, it } from "vitest";
import { cleanLine, meetStamp, transcriptText } from "./transcript.ts";

describe("transcrição da gravação", () => {
  it("nome no formato do Meet, no fuso de São Paulo e em UTC", () => {
    const at = Date.UTC(2026, 10, 20, 17, 5, 30);
    expect(meetStamp(at, "America/Sao_Paulo")).toBe("2026/11/20 14:05 GMT-03:00");
    expect(meetStamp(at, "UTC")).toBe("2026/11/20 17:05 GMT+00:00");
  });

  it("só aceita texto, limpo e com tamanho limitado", () => {
    expect(cleanLine({ text: "  bom   dia\n time " })).toBe("bom dia time");
    expect(cleanLine({ text: "   " })).toBeNull();
    expect(cleanLine({ text: 42 })).toBeNull();
    expect(cleanLine(null)).toBeNull();
    expect(cleanLine({ text: "a".repeat(2000) })!.length).toBe(500);
  });

  it("falas com nome e uma marca de tempo por minuto", () => {
    const text = transcriptText("Infinity Space · Sala Eclipse - 2026/11/20 14:05 GMT-03:00 - Transcrição", ["Ana", "Bruno"], [
      { at: 2_000, name: "Ana", text: "Bom dia." },
      { at: 5_000, name: "Bruno", text: "Vamos ao plano." },
      { at: 65_000, name: "Ana", text: "Fechado: entrega na sexta." },
      { at: 70_000, name: "Dr: Fulano", text: "Ok." },
    ]);
    expect(text).toBe(
      [
        "Infinity Space · Sala Eclipse - 2026/11/20 14:05 GMT-03:00 - Transcrição",
        "Participantes: Ana, Bruno",
        "",
        "Transcrição",
        "00:00:02",
        "Ana: Bom dia.",
        "Bruno: Vamos ao plano.",
        "00:01:05",
        "Ana: Fechado: entrega na sexta.",
        "Dr  Fulano: Ok.",
        "",
      ].join("\n"),
    );
  });
});
