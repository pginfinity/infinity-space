import { Suspense, lazy, useEffect } from "react";
import { useApp } from "./state/store.ts";
import { loadAuth, useAuth } from "./net/auth.ts";
import { EntryScreen } from "./ui/EntryScreen.tsx";
import { LoginScreen } from "./ui/LoginScreen.tsx";
// O mundo (Three.js, mídia, atividades) só carrega na hora de entrar: login e entrada abrem rápido.
const WorldView = lazy(() => import("./ui/WorldView.tsx").then((m) => ({ default: m.WorldView })));

function World() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center bg-space text-sm text-slate">Entrando no escritório…</div>}>
      <WorldView />
    </Suspense>
  );
}

export function App() {
  const phase = useApp((s) => s.phase);
  const auth = useAuth((s) => s.status);
  useEffect(() => void loadAuth(), []);
  // Com o login ligado, o mundo só abre depois de saber quem é a pessoa.
  if (auth === "checking") return phase === "world" ? <World /> : <div className="h-full bg-space" />;
  if (auth === "anon") return <LoginScreen />;
  return phase === "entry" ? <EntryScreen /> : <World />;
}
