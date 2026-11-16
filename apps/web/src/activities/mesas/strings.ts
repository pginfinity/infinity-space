import type { MesasItem } from "@infinity/world";

/** Textos do pacote "mesas" (pt-BR). */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const T = {
  close: "Fechar",
  // interação (E)
  checkinHere: "Fazer check-in nesta mesa",
  myDesk: "Minha mesa",
  myDeskNotes: (n: number) => `Minha mesa · ${plural(n, "recado", "recados")}`,
  leaveNote: (name: string) => `Recado para ${name}`,
  // etiqueta no mundo
  busy: "Ocupada",
  fixedTag: "Fixa",
  yours: "Sua mesa",
  // avisos
  checkedIn: (label: string) => `Check-in feito: ${label}. A mesa é sua até o fim do dia.`,
  checkedOut: "Mesa liberada.",
  noteLeft: (name: string) => `Recado deixado para ${name}.`,
  fixedSaved: "Mesas fixas atualizadas.",
  refuse: (code: string, name?: string, ms?: number): string => {
    switch (code) {
      case "longe":
        return "Chegue mais perto da mesa.";
      case "fixa":
        return name ? `Esta é a mesa fixa de ${name}.` : "Esta mesa é fixa de outra pessoa.";
      case "sua-fixa":
        return "Esta já é a sua mesa fixa.";
      case "ocupada":
        return name ? `${name} já fez check-in nesta mesa hoje.` : "Esta mesa já está ocupada hoje.";
      case "livre":
        return "Esta mesa está livre: não há para quem deixar recado.";
      case "propria":
        return "Esta é a sua mesa.";
      case "espera":
        return `Espere ${Math.max(1, Math.ceil((ms ?? 1000) / 1000))} s para deixar outro recado.`;
      case "limite":
        return name ? `Você já deixou recados demais para ${name}. Espere ela ler.` : "Você já deixou recados demais para esta pessoa.";
      case "sem-ultima":
        return "Você ainda não fez check-in em nenhuma mesa.";
      case "admin":
        return "Só quem administra o escritório marca mesas fixas.";
      case "vazio":
        return "Escreva o recado antes de deixar.";
      default:
        return "Não deu certo agora.";
    }
  },
  // painel "Minha mesa"
  panel: {
    title: "Minha mesa",
    none: "Sem mesa hoje",
    noneHint: "Sente numa mesa livre e faça o check-in (tecla E ou o botão na tela). Ela fica sua até o fim do dia.",
    until: "Sua até o fim do dia (meia-noite)",
    fixed: "Mesa fixa",
    fixedToo: (label: string) => `Sua mesa fixa: ${label}`,
    go: "Ir até lá",
    release: "Liberar mesa",
    last: (label: string) => `Check-in na última: ${label}`,
    lastBusy: (label: string) => `Sua última mesa (${label}) está ocupada hoje.`,
    free: (n: number) => (n === 1 ? "1 mesa livre agora" : `${n} mesas livres agora`),
    seeMap: "Ver no mapa",
    items: "Objetos na mesa",
    itemsHint: "Até três. Aparecem na mesa onde você fizer check-in (ou na fixa).",
    itemsCount: (n: number, max: number) => `${n} de ${max}`,
    notes: "Recados",
    notesEmpty: "Nenhum recado. Quem passar pela sua mesa pode deixar um.",
    notesPrivate: "Só você vê os recados deixados na sua mesa.",
    remove: "Apagar recado",
    admin: "Mesas fixas",
    adminHint: "Mesa fixa aparece com o nome da pessoa mesmo quando ela não está, e ninguém mais faz check-in nela.",
    adminDesk: "Mesa",
    adminName: "Nome da pessoa",
    adminSave: "Fixar",
    adminRemove: (label: string) => `Desfazer mesa fixa: ${label}`,
    adminEmpty: "Nenhuma mesa fixa.",
  },
  // cartão na mesa de outra pessoa
  card: {
    title: (name: string) => `Mesa de ${name}`,
    fixed: "Mesa fixa",
    busy: "Ocupada hoje",
    compose: (name: string) => `Recado para ${name}`,
    placeholder: "Passei aqui, me chama quando voltar",
    send: "Deixar recado",
    privacy: (name: string) => `Só ${name} e você veem este recado.`,
    mine: "Seus recados aqui",
    removeMine: "Apagar meu recado",
  },
  // cartão ao chegar na própria mesa
  welcome: {
    title: (n: number) => (n === 1 ? "Recado na sua mesa" : `${n} recados na sua mesa`),
    ok: "Ok, li",
    open: "Abrir minha mesa",
  },
  // atalho da última mesa
  arrival: {
    text: (label: string) => `Sua última mesa está livre: ${label}`,
    go: "Check-in e ir até lá",
    dismiss: "Agora não",
  },
  // mapa
  map: {
    title: "Mesas livres",
    room: (free: number, total: number) => `${free} de ${total}`,
    go: (room: string) => `Ir até uma mesa livre: ${room}`,
    none: "Nenhuma livre",
    legendFree: "livre",
    legendBusy: "ocupada",
    legendFixed: "fixa",
    legendMine: "sua",
  },
  timeAgo(at: number, now: number): string {
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 45) return "agora";
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? "ontem" : `há ${d} dias`;
  },
  item(i: MesasItem): string {
    return ITEM_LABEL[i];
  },
};

const ITEM_LABEL: Record<MesasItem, string> = {
  caneca: "Caneca",
  vasinho: "Vasinho",
  cacto: "Cacto",
  "porta-retrato": "Porta-retrato",
  boneco: "Astronauta",
  fones: "Fones",
  livros: "Livros",
  cubo: "Cubo mágico",
  luminaria: "Luminária",
  globo: "Globo",
  foguete: "Foguetinho",
  gatinho: "Gatinho",
};
