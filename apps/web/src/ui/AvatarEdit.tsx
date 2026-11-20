import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../state/store.ts";
import { sendInfo } from "../net/session.ts";
import { EntryScreen } from "./EntryScreen.tsx";

/** "Editar avatar" sem sair do escritório: o estúdio cobre a tela e a conexão segue viva por baixo. */
export function AvatarEdit() {
  const open = useApp((s) => s.avatarEdit);
  return open ? <Editor /> : null;
}

function Editor() {
  const { t } = useTranslation();
  // Visual de antes: Cancelar (ou Esc) volta para ele.
  const [before] = useState(() => useApp.getState().profile.look);
  const close = (saved: boolean) => {
    const app = useApp.getState();
    if (saved) sendInfo({ look: app.profile.look });
    else app.setProfile({ look: before });
    app.editAvatar(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={t("entry.editTitle")} className="pointer-events-auto fixed inset-0 z-[70]">
      <EntryScreen onClose={close} />
    </div>
  );
}
