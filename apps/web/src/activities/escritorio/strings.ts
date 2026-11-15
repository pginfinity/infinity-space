/**
 * Textos do pacote "escritorio" em pt-BR. Ficam no pacote (e não no pt-BR.json geral) para
 * vários pacotes evoluírem ao mesmo tempo sem conflito. Migram para o i18n quando estabilizarem.
 */
export const T = {
  cancel: "Cancelar",
  gong: {
    action: "Tocar o gongo",
    hint: "O escritório inteiro ouve. Conte o que estamos comemorando.",
    placeholder: "Ex.: fechamos com a Acme! (opcional)",
    ring: "Tocar",
    bannerTitle: (name: string) => `${name} tocou o gongo!`,
    bannerCount: (n: number) => (n === 1 ? "Primeira comemoração do mês" : `${n}ª comemoração do mês`),
  },
};
