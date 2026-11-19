/** Opções do criador de avatar. O índice é o que vai no AvatarLook (protocolo). */

export const HAIR_STYLES = ["Espetado", "Curto", "Topete", "Repartido", "Bagunçado", "Longo", "Rabo de cavalo", "Coque", "Com faixa", "Moicano", "Dois coques", "Careca"] as const;
export const EYE_STYLES = ["Pontinho", "Brilhante", "Sorridente", "Sereno", "Cílios", "Amêndoa"] as const;
export const BROW_STYLES = ["Normal", "Grossa", "Arqueada", "Nenhuma"] as const;
export const MOUTH_STYLES = ["Sorriso", "Sorrisão", "Neutro", "Gatinho"] as const;
export const FACIAL_STYLES = ["Nenhum", "Bigode", "Barba curta", "Barba cheia", "Cavanhaque"] as const;
export const TOP_STYLES = ["Camiseta", "Manga longa", "Moletom", "Blazer", "Polo", "Vestido", "Regata", "Jaqueta", "Jaleco"] as const;
export const BOTTOM_STYLES = ["Calça", "Bermuda", "Saia", "Jogger"] as const;
export const SHOE_STYLES = ["Tênis", "Bota", "Social"] as const;
export const ACCESSORIES = ["Óculos redondos", "Óculos quadrados", "Óculos escuros", "Fone de ouvido", "Boné", "Gorro", "Brincos", "Relógio", "Crachá Infinity", "Mochila"] as const;

/** Acessórios que ocupam a mesma parte do corpo não podem ser usados juntos. */
export const ACC_GROUP: Record<number, string> = { 0: "olhos", 1: "olhos", 2: "olhos", 3: "cabeça", 4: "cabeça", 5: "cabeça", 6: "orelha", 7: "pulso", 8: "peito", 9: "costas" };
