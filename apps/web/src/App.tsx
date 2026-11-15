import { useApp } from "./state/store.ts";
import { EntryScreen } from "./ui/EntryScreen.tsx";
import { WorldView } from "./ui/WorldView.tsx";

export function App() {
  const phase = useApp((s) => s.phase);
  return phase === "entry" ? <EntryScreen /> : <WorldView />;
}
