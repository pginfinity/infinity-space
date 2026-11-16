import { useEffect } from "react";
import { useApp } from "./state/store.ts";
import { loadAuth, useAuth } from "./net/auth.ts";
import { EntryScreen } from "./ui/EntryScreen.tsx";
import { LoginScreen } from "./ui/LoginScreen.tsx";
import { WorldView } from "./ui/WorldView.tsx";

export function App() {
  const phase = useApp((s) => s.phase);
  const auth = useAuth((s) => s.status);
  useEffect(() => void loadAuth(), []);
  // Com o login ligado, o mundo só abre depois de saber quem é a pessoa.
  if (auth === "checking") return phase === "world" ? <WorldView /> : <div className="h-full bg-space" />;
  if (auth === "anon") return <LoginScreen />;
  return phase === "entry" ? <EntryScreen /> : <WorldView />;
}
