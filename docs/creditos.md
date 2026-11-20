# Créditos de assets de terceiros

Cada frente acrescenta a sua seção. Só entram assets com licença que permita uso comercial
(CC0/domínio público de preferência; CC-BY só com a atribuição pedida).

## avatares

- **Mini Characters 2.0**, de Kenney (www.kenney.nl).
  - Fonte: https://kenney.nl/assets/mini-characters (download direto, sem login).
  - Licença: Creative Commons Zero (CC0 1.0), conferida na página oficial ("CC0 licensed") e no
    `License.txt` do pacote. Crédito não é exigido; fica aqui por cortesia.
  - Uso: `apps/web/public/avatar/kit.glb` é gerado por `scripts/avatar-kit.mjs` a partir dos GLB do
    pacote. Ele separa cada personagem em peças (cabeça, cabelos, troncos, braços, pernas, sapatos e
    acessórios), troca a textura por cor de vértice em tons de cinza (a cor do visual multiplica por
    cima) e mantém o esqueleto e as animações `idle`, `walk`, `sprint` e `sit`.
