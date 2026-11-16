/**
 * Textos do pacote "chat" em pt-BR. Ficam no pacote (e não no pt-BR.json geral) para vários
 * pacotes evoluírem ao mesmo tempo sem conflito. Migram para o i18n quando estabilizarem.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const T = {
  title: "Chat",
  open: "Chat",
  shortcut: "C",
  close: "Fechar chat (Esc)",
  dockLabel: (badge: number, dot: boolean) => (badge > 0 ? `Chat (C), ${badge} ${plural(badge, "nova", "novas")}` : dot ? "Chat (C), mensagens novas" : "Chat (C)"),
  tabs: { geral: "Geral", perto: "Perto", dm: "Conversas" } as const,
  tabHint: {
    geral: "Todo o escritório lê. Fica no histórico.",
    perto: "Só quem te ouve agora lê. Não fica guardado.",
  },
  placeholder: {
    geral: "Mensagem para o escritório",
    perto: "Fale com quem está perto",
    dm: (name: string) => `Mensagem para ${name}`,
  },
  composer: "Escrever mensagem",
  send: "Enviar (Enter)",
  newline: "Shift+Enter quebra a linha",
  count: (n: number, max: number) => `${n}/${max}`,
  empty: {
    geral: "Nenhuma mensagem ainda. Diga oi para o time.",
    perto: "Nada por aqui. O que você escrever aqui aparece num balão sobre sua cabeça para quem está perto.",
    dm: (name: string) => `Comece a conversa com ${name}. Só vocês dois leem.`,
    convs: "Nenhuma conversa ainda.",
  },
  loading: "Carregando…",
  near: {
    label: "Quem lê agora",
    nobody: "Ninguém por perto. Chegue perto de alguém para conversar.",
    people: (names: string[]) => names.join(", "),
    unheard: "Ninguém por perto leu.",
  },
  convs: {
    title: "Conversas",
    start: "Começar conversa",
    nobodyOnline: "Ninguém mais online agora.",
    back: "Voltar para as conversas",
    you: "Você: ",
    online: "No escritório",
    offline: "Fora do escritório",
    homonyms: (n: number) => `${n} conexões online com este nome (outra aba ou alguém com o mesmo nome): todas recebem esta conversa.`,
    unread: (n: number) => `${n} ${plural(n, "não lida", "não lidas")}`,
  },
  newDivider: "Novas",
  jump: "Ir para as novas",
  today: "Hoje",
  yesterday: "Ontem",
  you: "você",
  failed: {
    rate: "Calma: muitas mensagens seguidas.",
    empty: "Mensagem vazia.",
    unknown: "Essa pessoa não está disponível.",
    self: "Não dá para mandar mensagem para alguém com o seu nome.",
    offline: "Sem conexão. Não enviada.",
  } as Record<string, string>,
  retry: "Tentar de novo",
  discard: "Descartar",
  sending: "Enviando…",
  mentionList: "Mencionar",
  toast: {
    mention: (name: string, where: string, text: string) => `${name} mencionou você ${where}: ${text}`,
    dm: (name: string, text: string) => `${name}: ${text}`,
    where: { geral: "no Geral", perto: "aqui perto" } as Record<string, string>,
  },
  message: (name: string) => `Mensagem para ${name}`,
};
