/**
 * Textos do pacote "portas" em pt-BR. Ficam no pacote (e não no pt-BR.json geral) para vários
 * pacotes evoluírem ao mesmo tempo sem conflito. Migram para o i18n quando estabilizarem.
 */

const list = (names: string[]) => (names.length <= 2 ? names.join(" e ") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`);

export const T = {
  /** Tecla de sussurro: B de "baixinho". Não conflita com WASD/E/F/Q/R/M/V/L/G/T/C/P/1-8. */
  whisperKey: "B",
  door: {
    title: "Porta",
    states: { open: "Aberta", closed: "Fechada", locked: "Não perturbe" },
    hints: {
      open: "Qualquer um entra.",
      closed: "Quem chega bate; alguém daqui deixa entrar.",
      locked: "Ninguém entra; quem bate recebe “não perturbe”.",
    },
    groupLabel: "Estado da porta da sala",
    note: "Bilhete",
    notePlaceholder: "Ex.: em entrevista até 15h",
    noteSave: "Pendurar",
    noteClear: "Tirar bilhete",
    noteLabel: "Bilhete na porta (aparece para quem chega perto)",
    // Interação (E) na porta.
    knock: "Bater na porta",
    dnd: "Não perturbe",
    close: "Fechar a porta",
    lock: "Trancar (não perturbe)",
    open: "Abrir a porta",
    // Avisos.
    knocked: "Você bateu. Espere alguém abrir.",
    dndToast: (note: string) => (note ? `Não perturbe · ${note}` : "Não perturbe. Tente mais tarde."),
    isOpen: "A porta está aberta. Pode entrar.",
    letIn: (by: string) => (by ? `${by} deixou você entrar.` : "Pode entrar."),
    notNow: (by: string) => `${by}: agora não.`,
    noAnswer: "Ninguém atendeu.",
    redirected: "A porta está fechada. Bata para entrar.",
    knockFrom: (name: string) => `${name} bateu`,
    knockDesktop: (name: string) => `${name} está batendo na porta da sua sala`,
    letInBtn: "Deixar entrar",
    notNowBtn: "Agora não",
    badge: { closed: "Fechada", locked: "Não perturbe" },
  },
  circle: {
    close: (names: string[]) => `Fechar a roda com ${list(names)}`,
    closeShort: "Fechar a roda",
    closeHint: "Só quem está na roda passa a se ouvir.",
    closed: (names: string[]) => `Roda fechada · ${list(names)}`,
    openBtn: "Abrir a roda",
    closedToast: (by: string) => `${by} fechou a roda. Só quem está nela se ouve.`,
    openedToast: (by?: string) => (by ? `${by} abriu a roda.` : "A roda foi aberta."),
    leftToast: "Você saiu da roda.",
    alone: "Não há ninguém perto para fechar a roda.",
    ask: "Pedir para entrar na roda",
    asked: "Pedido enviado",
    askedToast: "Pedido enviado. Espere alguém da roda responder.",
    askFrom: (name: string) => `${name} quer entrar na roda`,
    joined: (by: string) => `${by} deixou você entrar na roda.`,
    refused: (by: string) => `${by}: agora não.`,
    badge: "Roda fechada",
  },
  whisper: {
    hold: (name: string) => `Sussurrar para ${name}`,
    holdHint: "Segure para falar só com essa pessoa",
    nobody: "Chegue mais perto de alguém (até 1,5 m) para sussurrar.",
    to: (name: string) => `Sussurrando para ${name}`,
    away: (name: string) => `${name} se afastou: ninguém te ouve`,
    from: (name: string) => `${name} está sussurrando para você`,
    micOff: "Seu microfone está desligado (M).",
  },
};
