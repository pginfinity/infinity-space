# Créditos do céu e da Terra (`public/space/`)

Tudo aqui é servido pelo próprio app (sem rede externa em tempo de execução). Os originais foram baixados
uma vez, reduzidos com ffmpeg e convertidos para formatos leves. Total: ~1,8 MB.

| Arquivo | O que é | Fonte original | Licença / crédito |
|---|---|---|---|
| `terra-dia-4k.webp` (4096×2048), `terra-dia-2k.webp` (2048×1024) | Terra sem nuvens (dia) | NASA **Blue Marble: Next Generation**, camada `BlueMarble_NextGeneration` do NASA GIBS, pedida em 4096×2048: <https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&FORMAT=image/png> | Domínio público (imagem da NASA). Crédito: NASA Earth Observatory (Reto Stöckli) / NASA EOSDIS GIBS. |
| `terra-luzes-2k.jpg` (2048×1024, tons de cinza) | Luzes das cidades à noite | NASA **Black Marble 2016** (*Earth at Night*), `BlackMarble_2016_3km.jpg` (13500×6750), registro 144898 do Earth Observatory: <https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg> | Domínio público. Crédito: NASA Earth Observatory, imagem de Joshua Stevens com dados Suomi NPP VIIRS de Miguel Román (NASA GSFC). |
| `terra-nuvens-2k.webp` (2048×1024), `terra-nuvens-1k.webp` (1024×512) | Nuvens de um dia real (02/11/2026) | NASA GIBS, camada `VIIRS_NOAA20_CorrectedReflectance_TrueColor` de 2026-11-02 em 4096×2048 (<https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&TIME=2026-11-02&FORMAT=image/png>), comparada com o Blue Marble acima por `scripts/ceu/nuvens.mjs` | Domínio público. Crédito: NASA EOSDIS GIBS / LANCE, NOAA-20 VIIRS. |
| `lua-1k.jpg` (1024×512) | Mapa de cor da Lua | NASA SVS **CGI Moon Kit** (ID 4720), `lroc_color_poles_1k.jpg`: <https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg> | Domínio público. Crédito: NASA's Scientific Visualization Studio; dados LRO/LROC WAC (NASA/GSFC/Arizona State University). |
| `via-lactea-2k.jpg` (2048×1024), `via-lactea-1k.jpg` (1024×512) | Via Láctea sem as estrelas, em RA/Dec (J2000) | NASA SVS **Deep Star Maps 2020** (ID 4851), `milkyway_2020_4k.exr`: <https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k.exr> | Crédito pedido pela NASA: "NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC". Imagem da NASA (domínio público) feita com dados do Gaia DR2 da ESA, que a ESA licencia como CC BY-SA 3.0 IGO: manter este crédito. |
| `estrelas.bin` (17 KB, 2.887 estrelas até a magnitude 5,5) | Posição J2000, magnitude e cor (B-V) das estrelas | **Yale Bright Star Catalog**, 5ª edição (Hoffleit & Warren 1991), arquivo `bsc5.dat` do Harvard-Smithsonian CfA: <http://tdc-www.harvard.edu/catalogs/bsc5.html>, convertido por `scripts/ceu/estrelas.mjs` | Catálogo de dados científicos distribuído livremente (NASA ADC / CDS V/50); sem restrição de uso. |
| `constelacoes.json` (~5 KB: 24 constelações e 24 estrelas com nome) | Traços das constelações e estrelas que abrem cartão ao clicar | Posições do mesmo **Yale Bright Star Catalog** (`bsc5.dat`); as figuras (quem liga com quem) foram escritas à mão em `scripts/ceu/constelacoes.mjs`, pela designação de Bayer | Posições: catálogo livre (como acima). Figuras: nossas, sem fonte de terceiros. |

## Como foram gerados

```bash
# Dia (Blue Marble NG, PNG 4096×2048 do GIBS)
ffmpeg -i gibs_bmng_4096.png -vf format=rgb24 -c:v libwebp -quality 82 terra-dia-4k.webp
ffmpeg -i gibs_bmng_4096.png -vf "scale=2048:1024:flags=area,format=rgb24" -c:v libwebp -quality 82 terra-dia-2k.webp

# Luzes (Black Marble 2016): tira o fundo azul da terra, fica só o brilho das cidades
ffmpeg -i BlackMarble_2016_3km.jpg -vf "format=rgb24,colorlevels=rimin=0.15:gimin=0.15:bimin=0.15,extractplanes=r,scale=2048:1024:flags=area,lutyuv=y='min(255,val*1.3)'" -q:v 3 terra-luzes-2k.jpg

# Nuvens (VIIRS de 02/11/2026 contra o Blue Marble NG)
node scripts/ceu/nuvens.mjs gibs_viirs_20261102_4096.png gibs_bmng_4096.png nuvens.jpg 2048
ffmpeg -i nuvens.jpg -c:v libwebp -quality 80 terra-nuvens-2k.webp
ffmpeg -i nuvens.jpg -vf scale=1024:512:flags=area -c:v libwebp -quality 80 terra-nuvens-1k.webp

# Lua
ffmpeg -i lroc_color_poles_1k.jpg -q:v 4 lua-1k.jpg

# Via Láctea (EXR linear → sRGB, preto um pouco mais fundo para o fundo não ficar cinza)
ffmpeg -i milkyway_2020_4k.exr -vf "scale=2048:1024:flags=area,zscale=transferin=linear:transfer=iec61966-2-1,format=rgb24,colorlevels=rimin=0.07:gimin=0.07:bimin=0.07,gblur=sigma=0.6" -q:v 4 via-lactea-2k.jpg
ffmpeg -i via-lactea-2k.jpg -vf scale=1024:512:flags=area -q:v 4 via-lactea-1k.jpg

# Estrelas
node scripts/ceu/estrelas.mjs bsc5.dat.gz
node scripts/ceu/constelacoes.mjs bsc5.dat.gz
```
