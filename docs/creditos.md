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

## midia

Fundos virtuais da câmera (`apps/web/public/fundos/`, 1280x720 JPG, com miniaturas em `fundos/mini/`).

| Arquivo | Origem | Autor | Licença |
|---|---|---|---|
| `escritorio.jpg` | Vista recortada do panorama [Poly Haven Studio](https://polyhaven.com/a/poly_haven_studio) | Poly Haven | CC0 ([polyhaven.com/license](https://polyhaven.com/license)) |
| `sala.jpg` | Vista recortada do panorama [Lythwood Lounge](https://polyhaven.com/a/lythwood_lounge) | Poly Haven | CC0 ([polyhaven.com/license](https://polyhaven.com/license)) |
| `natureza.jpg` | Vista recortada do panorama [Mossy Forest](https://polyhaven.com/a/mossy_forest) | Poly Haven | CC0 ([polyhaven.com/license](https://polyhaven.com/license)) |
| `estante.jpg` | [Abbotsford House Study Room](https://commons.wikimedia.org/wiki/File:Abbotsford_House_Study_Room.jpg), recortada para 16:9 | Michael D Beckwith (Wikimedia Commons) | CC0 1.0 |
| `espaco.jpg`, `gradiente.jpg`, `azul.jpg` | Gerados aqui, só com as cores da marca | AI Infinity | Próprio |
| `infinity.jpg` | Fundo da marca (já existia) | AI Infinity | Próprio |

CC0 não exige crédito; ele fica registrado para saber de onde veio cada imagem.

## universo (céu, Terra, astros)

As texturas e os dados do céu ficam em `apps/web/public/space/`, com a tabela completa (fonte, licença, crédito
pedido e o comando que gerou cada arquivo) em [`apps/web/public/space/CREDITOS.md`](../apps/web/public/space/CREDITOS.md).
Resumo:

| Arquivo | Fonte | Licença |
|---|---|---|
| `terra-dia-*.webp` | NASA Blue Marble: Next Generation (NASA GIBS) | Domínio público (NASA) |
| `terra-luzes-2k.jpg` | NASA Black Marble 2016 | Domínio público (NASA) |
| `terra-nuvens-*.webp` | NASA GIBS, NOAA-20 VIIRS de 02/11/2026 | Domínio público (NASA/NOAA) |
| `lua-1k.jpg` | NASA SVS CGI Moon Kit (LRO/LROC) | Domínio público (NASA) |
| `via-lactea-*.jpg` | NASA SVS Deep Star Maps 2020 (Gaia DR2) | NASA, com dados ESA/Gaia/DPAC (CC BY-SA 3.0 IGO): manter o crédito |
| `estrelas.bin`, `constelacoes.json` | Yale Bright Star Catalog, 5ª ed. (`bsc5.dat`); figuras das constelações escritas por nós | Catálogo científico livre (NASA ADC / CDS V/50) |
