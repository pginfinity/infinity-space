import type { CopaItem, HeldItem } from "@infinity/world";

/**
 * Textos do pacote "vivo" em pt-BR. Ficam no pacote (e não no pt-BR.json geral) para vários pacotes
 * evoluírem ao mesmo tempo sem conflito. Migram para o i18n quando estabilizarem.
 */

const ITEM: Record<HeldItem, string> = {
  coffee: "Café",
  tea: "Chá",
  water: "Água",
  juice: "Suco",
  popcorn: "Pipoca",
  paper: "Papel",
  microphone: "Microfone",
  trophy: "Troféu",
  flower: "Flor",
  "watering-can": "Regador",
};

/** "um café", "uma água": para frases. */
const ITEM_A: Record<CopaItem, string> = { coffee: "um café", tea: "um chá", water: "uma água", juice: "um suco", popcorn: "uma pipoca" };

/** Plural para o quadro do dia. */
const ITEM_N: Record<CopaItem, [string, string]> = {
  coffee: ["café", "cafés"],
  tea: ["chá", "chás"],
  water: ["água", "águas"],
  juice: ["suco", "sucos"],
  popcorn: ["pipoca", "pipocas"],
};

export const T = {
  close: "Fechar",
  cancel: "Cancelar",
  item: (i: HeldItem) => ITEM[i],
  held: {
    holding: "Segurando",
    drop: "Soltar",
    dropHint: "Soltar o item (G)",
  },
  copa: {
    machine: "Café ou chá",
    water: "Pegar água",
    juice: "Pegar suco",
    popcorn: "Fazer pipoca",
    choose: "O que vai ser?",
    chooseHint: "Escolha e espere a máquina terminar.",
    preparing: (i: CopaItem) => `Preparando ${ITEM_A[i]}…`,
    busy: (name: string) => `${name} está usando agora. Já já fica livre.`,
    ready: (i: CopaItem) => `Pronto: ${ITEM_A[i]} na mão.`,
    walkedAway: "Você saiu de perto antes de ficar pronto.",
    tooFar: "Chegue mais perto da copa.",
    boardTitle: "Hoje na copa",
    boardEmpty: "Ninguém passou por aqui ainda hoje.",
    boardEmptyLines: ["Ninguém passou", "por aqui ainda."] as const,
    boardEmptyCall: "Inaugure o dia!",
    boardShort: "Copa hoje",
    boardNone: "ninguém ainda",
    count: (i: CopaItem, n: number) => `${n} ${ITEM_N[i][n === 1 ? 0 : 1]}`,
    coffeesToday: (n: number) => (n === 1 ? "1 café hoje" : `${n} cafés hoje`),
  },
  plants: {
    water: "Regar a planta",
    happy: "Planta feliz",
    full: "Esta planta já está bem regada.",
    thanks: (name: string) => `${name} regou uma planta`,
    stage: { happy: "feliz", thirsty: "com sede", wilted: "murcha" } as const,
    board: (n: number, m: number) => `${n} de ${m}`,
    ofTotal: (m: number) => `de ${m}`,
    boardTitle: "Plantas felizes",
    canPick: "Pegar o regador",
    canDrop: "Devolver o regador",
  },
  orbi: {
    name: "Orbi",
    call: "Chamar o Orbi",
    pet: "Fazer carinho no Orbi",
    following: "O Orbi está te seguindo",
    dismiss: "Dispensar",
    dismissHint: "Pedir para o Orbi voltar a passear",
    petBy: (name: string) => `${name} fez carinho no Orbi`,
    waitedOutside: "O Orbi esperou do lado de fora.",
    backToWander: "O Orbi voltou a passear.",
  },
  jukebox: {
    title: "Jukebox",
    action: "Escolher música",
    nowPlaying: "Tocando agora",
    nothing: "Nada tocando. Escolha a primeira.",
    queue: "Na fila",
    queueEmpty: "Fila vazia.",
    add: "Pôr na fila",
    playingTag: "Tocando",
    added: (title: string) => `“${title}” entrou na fila.`,
    skip: "Pular",
    volume: "Volume",
    volumeHint: "Volume da jukebox (só para você)",
    mute: "Silenciar a jukebox",
    unmute: "Ligar o som da jukebox",
    by: (name: string) => `pedida por ${name}`,
    tracks: "Faixas",
    refused: { unknown: "Faixa desconhecida.", full: "A fila está cheia.", limit: "Você já tem 2 músicas na fila." } as const,
    tooFar: "Chegue mais perto da jukebox.",
    left: (s: string) => `faltam ${s}`,
  },
  telescope: {
    action: "Olhar pelo telescópio",
    title: "Telescópio",
    hint: "Esc para voltar ao escritório",
    caption: "A Terra, daqui da estação",
    captionMoon: "A Lua, daqui da estação",
  },
};
