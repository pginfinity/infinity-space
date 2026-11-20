import { describe, expect, it } from "vitest";
import { painelDeployRise, painelDeploys, painelParseBirthdays, painelParseGoals, painelPrintBirthdays, painelUpcoming } from "./painel.ts";

describe("painel do Átrio", () => {
  it("metas: uma por linha, sem marcador, com limite", () => {
    expect(painelParseGoals("- Fechar 3 contratos\n\n• Subir o CRM da Cunha\n  * Daily às 9h  ")).toEqual(["Fechar 3 contratos", "Subir o CRM da Cunha", "Daily às 9h"]);
    expect(painelParseGoals(Array.from({ length: 9 }, (_, i) => `meta ${i}`).join("\n"))).toHaveLength(6);
    expect(painelParseGoals(42)).toEqual([]);
  });

  it("aniversários: aceita formatos comuns e devolve o que não entendeu", () => {
    const { list, bad } = painelParseBirthdays("Ana 05/03\nBruno Lima - 7/11\nCarla: 29/02\nDani 31/04\nsem data\n\n");
    expect(list).toEqual([
      { name: "Ana", day: 5, month: 3 },
      { name: "Bruno Lima", day: 7, month: 11 },
      { name: "Carla", day: 29, month: 2 },
    ]);
    expect(bad).toEqual(["Dani 31/04", "sem data"]);
    expect(painelPrintBirthdays(list)).toBe("Ana 05/03\nBruno Lima 07/11\nCarla 29/02");
  });

  it("próximos 7 dias no fuso do escritório, hoje marcado, virando o mês", () => {
    const list = painelParseBirthdays("Bruno 20/11\nAna 20/11\nCaio 26/11\nDani 27/11\nEva 01/12").list;
    // 20/11/2026 01:00 em São Paulo (04:00 UTC).
    const now = Date.UTC(2026, 10, 20, 4);
    expect(painelUpcoming(list, now).map((b) => `${b.name}${b.today ? "*" : ""}`)).toEqual(["Ana*", "Bruno*", "Caio"]);
    // 23:30 do dia 19 em São Paulo ainda é dia 19: o 26/11 fica de fora.
    expect(painelUpcoming(list, Date.UTC(2026, 10, 20, 2, 30)).map((b) => b.name)).toEqual(["Ana", "Bruno"]);
    expect(painelUpcoming(list, Date.UTC(2026, 10, 26, 15)).map((b) => b.name)).toEqual(["Caio", "Dani", "Eva"]);
  });

  it("29/02 comemora no 28/02 do ano que não é bissexto", () => {
    const list = painelParseBirthdays("Carla 29/02").list;
    expect(painelUpcoming(list, Date.UTC(2027, 1, 28, 15))[0]).toMatchObject({ name: "Carla", today: true });
    expect(painelUpcoming(list, Date.UTC(2028, 1, 28, 15))[0]).toMatchObject({ name: "Carla", today: false });
  });

  it("deploys do Supremacy: valida, ordena e acha quem subiu", () => {
    expect(painelDeploys({ error: "x" })).toBeNull();
    const a = painelDeploys({ clientes: [{ client: "Cunha", deploys: 2 }, { client: "Álamo", deploys: 5 }, { client: "", deploys: 1 }, { client: "Xis", deploys: "3" }, { client: "Zero", deploys: 0 }] })!;
    expect(a).toEqual([
      { client: "Álamo", deploys: 5 },
      { client: "Cunha", deploys: 2 },
    ]);
    expect(painelDeployRise(null, a)).toEqual([]);
    expect(painelDeployRise(a, [{ client: "Álamo", deploys: 5 }, { client: "Cunha", deploys: 3 }, { client: "Kupper", deploys: 1 }])).toEqual(["Cunha", "Kupper"]);
    // A janela que anda à meia-noite só tira deploys: não comemora.
    expect(painelDeployRise(a, [{ client: "Álamo", deploys: 4 }])).toEqual([]);
  });
});
