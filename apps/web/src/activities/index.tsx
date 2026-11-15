import { Component, type ReactNode } from "react";
import type { Lens } from "@infinity/world";
import { activityClients, useActs } from "./registry.ts";

/**
 * Carrega todos os pacotes de atividades (`activities/<pacote>/index.ts` ou `index.tsx`).
 * Criar uma pasta nova com um index que chama `registerActivity` basta: nada mais precisa mudar.
 */
import.meta.glob(["./*/index.ts", "./*/index.tsx"], { eager: true });

/** UI das atividades por cima do mundo (dentro do HUD). */
export function ActivitiesOverlay() {
  useActs((s) => s.version);
  return (
    <>
      {activityClients().map((c) =>
        c.Overlay ? (
          <Guard key={c.name} name={c.name}>
            <c.Overlay />
          </Guard>
        ) : null,
      )}
    </>
  );
}

/** Coisas das atividades dentro do mundo (Canvas), iguais nas duas lentes. */
export function ActivitiesScene({ lens }: { lens: Lens }) {
  useActs((s) => s.version);
  return (
    <>
      {activityClients().map((c) =>
        c.Scene ? (
          <Guard key={c.name} name={c.name}>
            <c.Scene lens={lens} />
          </Guard>
        ) : null,
      )}
    </>
  );
}

/** Um pacote com erro de UI não derruba o escritório. */
class Guard extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error(`[atividades] ${this.props.name} quebrou a interface:`, error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
