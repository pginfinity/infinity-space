# Flat.social: engenharia reversa de produto

> **Alvo:** flat.social (https://flat.social/pt), escritório e espaço social **3D no navegador**, com avatares em forma de **bolha de vídeo**, áudio espacial, build mode e muitos jogos embutidos.
> **Data da pesquisa:** 15/11/2026. Usei só informação pública: site (PT/EN), preços, FAQ, changelog, central de docs, política de privacidade, créditos, Product Hunt, comparativo de concorrente e o HTML/JS público da **demo aberta** (`app.flat.social/f/demo-flat`), que não exige login. Analisei os bundles apenas com grep, sem executar nada. Não criei conta nem fiz login.
> **Legenda:** **[confirmado]** = está em fonte citada (códigos na seção 7). **[inferido]** = dedução minha a partir de indícios. "não encontrado" = procurei e não achei.
> **A1** é a evidência extraída do HTML público da demo: ~5.000 strings de interface (i18n em inglês) embutidas no payload RSC do Next.js, mais os chunks JS referenciados. **A2** são os pôsteres dos vídeos de marketing (imagens públicas do bucket do site).

---

## Resumo executivo

- O flat.social é um **espaço 3D low-poly no navegador** (WebGL). Cada pessoa é uma **bolha circular com a própria webcam** (nome em cima e sombra projetada no chão 3D) que anda pelo mapa. A conversa acontece por proximidade "como numa festa" **[confirmado]** (A2, F-HOME). Posiciona-se como "escritório virtual divertido para equipes remotas e escolas", contra Gather e SoWork ("eles são 2D, nós somos 3D") **[confirmado]** (F-FAQ).
- **Empresa pequena e liderada pelo fundador:** Borkowski Consulting Ltd (Londres), fundador e maker Paweł Borkowski, lançado em 2022. Diz ter **33.000+ pessoas** que já passaram pelo produto **[confirmado]** (F-PRIV, F-PH, F-HOME).
- **Preço simples e agressivo:** grátis até **5 pessoas simultâneas** sem limite de tempo; **US$6 por assento/mês** por capacidade (6–100); **Day Pass de US$2 por assento/dia**; **convidados nunca pagam** e entram sem conta, só com um nome **[confirmado]** (F-PRICE, F-LIMITS).
- **Áudio espacial bem especificado:** volume cheio até **~7,5 m**, queda até o silêncio em **~22,5 m**, panorâmica estéreo pela posição na tela, só as **12 vozes mais próximas** tocam, paredes isolam salas e pods, **megafone (10× alcance)**, **palco com PA**, "Mute for me". A mídia roda em **LiveKit auto-hospedado** **[confirmado]** (F-AUDIO, F-FW, F-PRIV).
- **Jogos são o DNA do produto:**
  - *Salas-arena:* Futebol, Maze Race, Arena Shooter, Territory, Surf e **Grand Prix**.
  - *Brinquedos no mundo:* boliche, xadrez, Snake, piano, dados, foguete, balão, helicóptero, UFO, roda-gigante, photo booth, disco.
  - *Social:* **speed networking** e **watercooler** com perguntas **[confirmado]** (F-ROOMS, F-CAT, A1, F-CHANGELOG).
- **Além dos jogos:**
  - **Slides interativos** no estilo Mentimeter: enquete, quiz cronometrado, nuvem de palavras, Q&A, retro, eNPS, dot voting e mais.
  - Atividades fixáveis por sala: whiteboard, webinar, **standup com roster e timer**.
  - Insights: horários de pico, novos vs. recorrentes, adoção de câmera/mic e tempo de fala **[confirmado]** (A1).
- **Fraquezas principais:**
  - Escala pequena: 50 pessoas por sala espacial, 25 por conferência e 100 por flat.
  - Exige WebGL com aceleração de hardware e **não roda em VMs ou desktops remotos**.
  - Mobile limitado: sem compartilhar tela, sem build mode, sem supressão de ruído; no iOS não há fade nem pan espacial.
  - Ausências: status de trabalho persistente, calendário, Slack, SSO/SAML, gravação, transcrição e IA.
  - Risco de fornecedor muito pequeno, quase nenhuma review (Product Hunt 3,0 com 3 reviews; G2 com 0).

---

## 1. Visão geral

### 1.1 Empresa e linha do tempo

| Data | Evento | Status |
|---|---|---|
| 2022 | Lançamento (Product Hunt: "Launched in 2022", 2 lançamentos); posts no DEV e no Indie Hackers do maker | [confirmado] (F-PH, F-DEV) |
| 2022–2024 | Blog com conteúdo de trabalho remoto/Scrum; posicionamento "digital spaces for fun online meetings & virtual events" | [confirmado] (F-BLOG) |
| mar–jul/2026 | Grande onda de conteúdo SEO (alternativas a Gather, SoWork, Kumospace, oVice, Wonder.me "shut down", Ro.am etc.) | [confirmado] (F-BLOG) |
| 29/07/2026 | Surf | [confirmado] (F-CHANGELOG) |
| 21/09/2026 | Gatos e pets | [confirmado] (F-CHANGELOG) |
| 27/09/2026 | **Palcos** para talks e all-hands (6 auditórios); chapéus para convidados | [confirmado] (F-CHANGELOG) |
| 02/10/2026 | Vibes de Marte e Lua | [confirmado] (F-CHANGELOG) |
| 13/10/2026 | **Escadas, portas e elevadores** (2º andar); mais animais; templates de escritório, campus e networking na praia | [confirmado] (F-CHANGELOG) |
| 19/10/2026 | **Gerador de café** em 1 clique (Paris, Brooklyn, diner) | [confirmado] (F-CHANGELOG) |
| 22/10/2026 | **Speed networking** | [confirmado] (F-CHANGELOG) |
| 28/10/2026 | **Grand Prix**: corrida de 3 voltas com 8 carros | [confirmado] (F-CHANGELOG) |
| 01/11/2026 | **Nova configuração guiada** do espaço (perguntas → espaço pronto) | [confirmado] (F-CHANGELOG) |

O ritmo de lançamentos no 2º semestre de 2026 é alto, focado em diversão e em "montagem rápida". As strings ainda falam em **beta** de preços ("During beta, all limits are on us"; "Prices shown are what we plan to launch with") **[confirmado]** (A1).

### 1.2 Posicionamento e público

- **Tagline (PT):** "Escritório virtual divertido para equipes remotas e escolas". Também: "Nada pra instalar, nada pra agendar" e "Nada de agendar. É só chegar perto do colega e conversar" **[confirmado]** (F-HOME).
- **Públicos:**
  - times remotos (mesas, encontros espontâneos, fusos);
  - escolas (palco e salas de estudo);
  - comunidades e eventos (meetups, speed networking);
  - happy hours e rotinas (daily, sexta social, coworking silencioso) **[confirmado]** (F-HOME).
- **Mensagem sobre adoção:** "Espaço com rotina é usado; espaço vazio é esquecido". O FAQ orienta dar um "trabalho" ao espaço **[confirmado]** (F-FAQ).
- **Concorrentes citados:** Gather e SoWork (FAQ); Kumospace, WorkAdventure, Teemyco, Cosmos, Ro.am, oVice e Wonder.me (blog) **[confirmado]**.

### 1.3 Dimensão gráfica

- **3D real em WebGL.** Arte low-poly com modelos de Poly Pizza, Quaternius e Kenney (CC0/CC-BY) **[confirmado]** (F-CREDITS, F-REQ).
- **"Motor de física 3D em tempo real em cada sala":** bolas quicam, avatares pulam, objetos colidem **[confirmado]** (F-FEAT).
- **Quatro câmeras sobre o mesmo mundo:**
  - **Normal** (ângulo baixo e próximo, para conversa);
  - **Isométrica** (padrão);
  - **Top** (de cima, praticamente uma visão 2D);
  - **Primeira pessoa** (só no computador, lente de 12 a 135 mm) **[confirmado]** (F-CAM).
- **Avatar = bolha de vídeo:** um disco com a webcam, borda branca, nome acima e sombra no chão. Em grupo, as bolhas formam rodas ao redor de objetos (fogueira) **[confirmado]** (A2).

### 1.4 Plataformas

| Plataforma | Situação | Fonte |
|---|---|---|
| Navegador desktop | Chrome, Edge, Firefox, Safari e Brave em Mac, Windows e Linux; "tudo funciona no computador" | [confirmado] (F-REQ, F-FAQ) |
| Navegador mobile/tablet | Layout touch; tablets com mais de 768 px usam o layout de desktop; recursos limitados (seção 2.15) | [confirmado] (F-MOBILE) |
| App nativo | Não encontrado (o produto se vende como "sem download") | — |
| VM / desktop remoto | Mostra "3D isn't available on this device" quando o WebGL não sobe | [confirmado] (F-REQ) |

### 1.5 Modelo de preço e limites

| Plano | Preço | Limites e recursos | Fonte |
|---|---|---|---|
| **Free** | US$0 para sempre | Até **5 pessoas simultâneas** no flat inteiro (e 5 por sala); sessão ilimitada; salas espaciais e de vídeo; mapas e visual próprios; botão de embed | [confirmado] (F-PRICE, F-LIMITS) |
| **Monthly** | **US$6 por assento/mês** | Capacidade de 6 a 100 escolhida pelo dono; insights; remove a marca flat.social; **roles e controle de acesso avançado**; suporte prioritário; proporcional via Stripe; **50 por sala espacial e 25 por sala de conferência** | [confirmado] (F-PRICE, F-LIMITS) |
| **Day Pass** | **US$2 por assento/dia** | 24 h, até 100 pessoas; mínimo de 6 assentos extras no Free e 1 no Monthly; reagendar grátis até 5 min antes; cancelar grátis até 24 h antes (pela página de preços) | [confirmado] (F-PRICE, F-LIMITS, A1) |
| Acima de 100 | Sob consulta | "Capacity is scaling" | [confirmado] (F-PRICE) |
| Educação e ONGs | Desconto por e-mail | — | [confirmado] (F-PRICE) |

- **Regra de ouro:** cobra só pela **capacidade simultânea**. "No named seats, no per-guest surprises". O lobby não conta; só quem está dentro das salas **[confirmado]** (F-PRICE, F-LIMITS).
- **Conflito:** a página de features diz "até 100 pessoas por sala", enquanto o doc de limites diz 50 (espacial) e 25 (conferência) **[confirmado]** (F-FEAT vs. F-LIMITS).
- **Outros limites:**
  - 1.000 elementos e 10.000 tiles de piso por sala.
  - Convites por e-mail: 10 por dia (Free) ou 100 (Monthly), válidos por 30 dias.
  - Allowlist de até 10 domínios.
  - 1 flat por conta até verificar o e-mail.
  - Chat de até 2.000 caracteres **[confirmado]** (F-LIMITS).

---

## 2. Inventário completo de features

### 2.1 Mundo, mapa e movimentação

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Flat → andares → salas | O flat tem um link único, vários andares e salas com layouts e atividades diferentes; existe um lobby com cards de salas **[confirmado]** (F-FAQ, A1) | **Card "vivo"**: a capa da sala se desenha mostrando quem está dentro agora (A1 `coverLiveHint`) |
| Tipos de sala | **Open Spatial** (mundo 3D andável), **Conference** (grade de vídeo, sem mapa nem avatares) e salas de chat de texto **[confirmado]** (F-ROOMS, F-FEAT) | Estilos fixos na criação: Walk & talk, Futebol, Maze, Shooter, Territory, Surf |
| Câmeras | Normal / Isométrica / Top / Primeira pessoa; zoom por scroll ou pinch; clicar no avatar foca a pessoa; clicar no billboard abre o conteúdo; Esc volta **[confirmado]** (F-CAM) | Mudar a sua câmera não muda o que os outros veem. Alguns jogos bloqueiam vistas (ex.: o Maze desliga Top e zoom distante) |
| Teclado | WASD ou setas; diagonais; **Espaço pula** (e solta balões); sem tecla de correr **[confirmado]** (F-MOVE, F-KEYS) | Setas recomendadas para AZERTY |
| Mouse | **Clicar no chão** = andar com pathfinding (teleporta se travar); **pressionar e arrastar** = joystick em direção ao cursor; duplo clique também anda **[confirmado]** (F-MOVE, A1) | |
| Interagir | **Enter** executa o prompt sob o avatar (sentar, dirigir, montar, tocar); Esc esconde; **T** liga a lanterna; **F** abre palco ou compartilhamento em tela cheia **[confirmado]** (F-KEYS) | Os prompts são consistentes: "Press Enter to …" em centenas de objetos (A1) |
| **Quick Access (Ctrl/⌘+K)** | Paleta de comandos com todas as ações: mudar câmera, mic, câmera, ir até alguém, convidar, moderar etc. **[confirmado]** (F-KEYS, F-MOVE) | Mic e câmera **não têm atalho dedicado**: busca-se "mic" na paleta (F-KEYS) |
| Teleport home | Botão de casa na barra ou "Teleport home (unstuck)"; veículos vêm junto **[confirmado]** (F-MOVE) | Saída universal para "fiquei preso" |
| Ir até / chamar | "Go to a person" (Quick Access); "Invite someone to join me" (pede que a pessoa teleporte até você) **[confirmado]** (F-MOVE, A1) | |
| Seguir | Clicar no avatar → Follow; "Following {name}"; **"Everyone follows your view"** (o apresentador conduz a câmera de todos) e "Follow active speaker" **[confirmado]** (F-MOVE, A1) | Tour guiado nativo |
| Moderação espacial | Summon (trazer selecionados), **puxar todos para perto**, **alinhar todos em grade**, mandar todos para os spawn points, convidar todos para esta ou outra sala, dividir em 2/3/4 grupos **[confirmado]** (A1) | Ferramentas de "professor/host" bem completas |
| Portais | Levam a outro ponto, sala ou flat **[confirmado]** (F-CAT) | |
| Andares, portas, elevadores | Escadas, portas (de dobradiça, de correr automática, de saloon, com fechamento automático) e elevadores (andar até a cabine e esperar; chamar na porta) **[confirmado]** (F-CHANGELOG, A1) | Cada andar de um "Floored Room" é uma zona de áudio (F-CAT) |
| Sentar e deitar | Cadeiras, sofás, pufes, redes, espreguiçadeiras; mover-se levanta (no mobile, arrastar) **[confirmado]** (F-CAT, F-MOBILE) | |
| Veículos e brinquedos | Golf cart, Fusca, carro custom, scooter, **helicóptero**, **UFO** ("joyride ou abdução de alguém"), **balão de ar quente**, roda-gigante, pranchas e barco **[confirmado]** (F-CAT, A1) | O helicóptero sobe com Espaço segurado; K buzina |
| NPCs e pets | Robô (com "humores", "rebelião" e "brincar"), gato, araras, papagaio, galinhas, saguis, pinguins, gaivotas, vacas, **T. rex** ("acordar o T. rex") **[confirmado]** (F-CAT, F-CHANGELOG, A1) | Personalidade do mundo, sem utilidade funcional |
| Objetos que reagem | Lâmpadas, letreiros com luz, discoteca, lava lamp (muda a cor para todos), fogueira ("não pise"), sino, megafone, quadro de direções com mapa, timezone clocks, contagem regressiva ao vivo **[confirmado]** (F-CAT, A1) | Estados compartilhados: o que um liga, todos veem |
| Modal ao entrar | Elemento que mostra um pop-up de texto quando alguém pisa nele **[confirmado]** (A1 `infoModalHint`) | |

### 2.2 Áudio e vídeo por proximidade (as "bolhas")

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| **Bolha de vídeo** | O avatar é a sua webcam num círculo; o nome flutua acima; a sombra fica no chão **[confirmado]** (A2) | A pessoa está **no** mundo, não num painel lateral |
| Distância | Volume cheio até **~7,5 m**; cai até **silêncio em ~22,5 m** **[confirmado]** (F-AUDIO) | Gradiente contínuo: "background audio" a poucos passos (F-SPATIAL) |
| Panorâmica | Voz à esquerda ou à direita conforme a posição na tela **[confirmado]** (F-AUDIO) | |
| Limite de vozes | Só as **12 pessoas mais próximas que estão falando** tocam **[confirmado]** (F-AUDIO) | Protege CPU e banda em multidões |
| Vídeo | Mesma lógica de distância do áudio **[confirmado]** (F-AUDIO) | No tier "Low performance", só as **duas câmeras mais próximas** (A1) |
| Salas e pods isolados | Paredes criam privacidade: dentro, só se ouve e vê quem está na mesma sala ou pod **[confirmado]** (F-AUDIO, F-CAT) | "Paredes bloqueiam som como na vida real" (F-FAQ) |
| Zonas de áudio | Retângulos colocáveis e esticáveis; podem se sobrepor (**a menor vence**); contorno visível só para quem está dentro ou fraco para todos **[confirmado]** (A1) | |
| Booths e pods | Focus booth (duo) e pods retrô (solo, duo, quad) com **lâmpada vermelha quando ocupados**; casa na árvore (no deck, só quem está lá se ouve) **[confirmado]** (A1) | Indicador físico de "ocupado" |
| **Megafone** | Enter perto do megafone (ou da torre de megafone) faz sua voz ir **~10× mais longe**, mas não entra em salas isoladas **[confirmado]** (F-AUDIO, F-CAT) | "{name} is yelling through megaphone" (A1) |
| **Palco / auditório** | Quem está no palco é ouvido em volume cheio por todo o auditório (PA); 6 estilos (Minimal, Theatre, Lecture Hall, Cinema, Business, Festival); púlpito ("Press Enter to take the lectern") **[confirmado]** (F-AUDIO, F-CAT, A1) | Sair do auditório encerra seu compartilhamento (A1) |
| **Spotlight** | Até **6 câmeras em círculos grandes no palco**, configuradas por e-mail ou escolhidas ao vivo **[confirmado]** (A1) | Painel, aniversariante, novatos |
| Salas de jogo | Sem áudio espacial: **todos ouvem todos em volume cheio** **[confirmado]** (F-AUDIO, F-ROOMS) | |
| Conferência | Uma chamada sem distância; Gallery / Speaker / Dynamic; fixar tile; webinar **[confirmado]** (F-ROOMS, A1) | |
| Webinar | Só os oradores escolhidos falam; ouvintes **levantam a mão**; convite ao palco (aceitar ou recusar); "deixar um ouvinte publicar A/V" **[confirmado]** (A1) | |
| Mute for me | Clicar no avatar → "Mute for me": só você deixa de ouvir a pessoa **[confirmado]** (F-AUDIO) | |
| Moderação de A/V | Mutar uma pessoa ou todos, desligar todas as câmeras, "Silence room" (mutar e parar compartilhamentos; as pessoas podem religar) **[confirmado]** (A1) | |
| iPhone/iPad | Sem fade nem pan (limitação do Safari): todos no alcance em volume cheio; as zonas privadas funcionam **[confirmado]** (F-AUDIO, F-MOBILE) | |
| Pop-out (PiP) | Janela flutuante da chamada ao trocar de aba; auto PiP opcional **[confirmado]** (A1) | Só no computador (F-REQ) |
| Self-view | A própria câmera pode ser arrastada para outro canto **[confirmado]** (A1) | |
| Entrar só ouvindo | "Join and listen" sem câmera nem mic **[confirmado]** (F-MOBILE, A1) | Sem microfone dá para entrar e ouvir (F-REQ) |

### 2.3 Compartilhamento de tela

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Espacial | Permissão "Screenshare spatially"; aparece em **TVs/telas no mundo** ("Press Enter to watch {name}'s screen") **[confirmado]** (F-ROLES, A1) | A tela é um objeto do lugar |
| Palco | "Step on stage to share your screen"; **um palco por vez**, com confirmação de "take over" que derruba o anterior **[confirmado]** (A1) | Aviso claro: "{name} took over the screen share, so yours was stopped" |
| Mesa de conferência | "Share to the table's screen"; só quem está à mesa ouve o vídeo **[confirmado]** (A1) | |
| Simultâneos | "Múltiplos participantes podem compartilhar ao mesmo tempo" (espacial) **[confirmado]** (F-FAQ) | No palco, um por vez |
| Tela cheia | Tela compartilhada em tamanho cheio com a câmera do apresentador no canto; tecla F **[confirmado]** (A1, F-KEYS) | |
| Áudio da aba | Avisos específicos: "nenhum som compartilhado; compartilhe a aba com áudio" e "seu navegador não compartilha som; use Chrome ou Edge" **[confirmado]** (A1) | Microcopy exemplar |
| YouTube sincronizado | Vídeo em palco ou mesa toca **em sincronia** para todos; só quem está ali ouve, cada um no próprio volume; dá para pausar e pular **[confirmado]** (A1) | Watch party nativa |
| Mobile | Não compartilha (nem iPad) **[confirmado]** (F-MOBILE) | |
| Gravação | Não existe ("We do not record your calls") **[confirmado]** (F-PRIV) | |

### 2.4 Qualidade de áudio

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Provedor | **LiveKit auto-hospedado** (`livekit.flat.social`, TURN em `livekit-turn.flat.social`) **[confirmado]** (F-FW, F-PRIV) | |
| Cancelamento de ruído | Toggle que "filtra música e conversa de fundo do seu mic. Usa CPU extra e **baixa ~24 MB na primeira vez**". Só no computador **[confirmado]** (A1, F-MOBILE) | Modelo de ML no cliente (WASM) [inferido]; fornecedor não identificado |
| Desfoque de fundo | Toggle; só no computador e em navegadores compatíveis **[confirmado]** (A1, F-MOBILE) | |
| Eco e AGC | Não documentado; padrão do WebRTC do navegador [inferido] | — |
| Dispositivos | Escolher mic, câmera e alto-falante; página pública de teste de webcam e mic **[confirmado]** (A1, F-HOME) | |
| Diagnóstico | Docs de "can't hear", "spatial audio issues" e "connection issues"; mensagens de erro específicas (em uso por outro app, sem permissão, iOS "não vai perguntar de novo") **[confirmado]** (F-DOCS, A1) | |

### 2.5 Chat e comunicação assíncrona

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Chat por sala | Toda sala tem chat próprio **[confirmado]** (F-ROOMS) | |
| Lobby e canais | "Message the lobby", canais **[confirmado]** (A1, F-FEAT) | |
| DM | "Private message" pelo menu do avatar; seção "Direct Messages" **[confirmado]** (A1) | |
| Menções | `@` menciona alguém **ou a sala** **[confirmado]** (F-KEYS) | |
| Composição | Enter envia, Shift+Enter quebra linha; até 2.000 caracteres **[confirmado]** (F-KEYS, F-LIMITS) | |
| Moderação | Apagar mensagens de outros (permissão); filtro de palavrões em nomes de convidados e no chat (só em inglês) **[confirmado]** (F-ROLES, A1) | |
| **Anúncios** | Banner para todo o flat; **Markdown**, `#sala` cria link para a sala, até 10 imagens, opção "notificar todos online" **[confirmado]** (A1, F-LIMITS) | Conecta comunicação assíncrona ao espaço |
| Notas e sticky notes | Notas que qualquer um na sala edita; sticky notes colocadas no mundo **[confirmado]** (A1, F-CAT) | |
| **Whiteboard** | Canvas estilo Jamboard: caneta, sticky notes em 6 cores, imagens, multisseleção; alterna "todos desenham" e "só o apresentador"; limpar para todos **[confirmado]** (A1, F-FEAT) | Também como quadro de pé no mundo ("Press Enter to draw on the whiteboard") |
| Quadro de boas-vindas | Mensagem de boas-vindas e **diretório** (mapa com "Norte para cima") num elemento **[confirmado]** (A1) | |
| Threads | Não encontrado | — |

### 2.6 Presença e status

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Quem está aqui | "{a}, {b} e N outros já estão aqui" na entrada; contadores online; painel de pessoas (ouvindo e mãos levantadas) **[confirmado]** (A1) | Prova social antes de entrar |
| Ocupação de salas | Cards de lobby vivos; lâmpada vermelha em booths e pods ocupados **[confirmado]** (A1) | |
| Levantar a mão | Raise / lower hand; lista "Raised hands (N)" **[confirmado]** (A1) | |
| Mesas | Os templates citam "cada um tem uma mesa", "**knock on a desk**", "pin notices and a dashboard to the wall" **[confirmado como texto de template]** (A1) | A mecânica de "mesa própria" ou "bater" não está documentada: [inferido] que é só convenção espacial |
| Fusos | Timezone clocks (cidades) e relógio do palco no horário de cada um **[confirmado]** (A1, F-CAT) | |
| Status textual | O pôster de marketing mostra um balão "Feeling Happy" sobre um avatar **[confirmado na imagem]** (A2) | Funcionalidade não documentada [inferido] |
| Ocupado / ausente / foco / DND | Não encontrado. A SoWork (concorrente) afirma que a presença é "session-dependent" **[confirmado como claim de concorrente]** (F-SOWORK) | |

### 2.7 Avatares e customização

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Bolha de webcam | O avatar é a câmera **[confirmado]** (A2) | Não há corpo de personagem, então não há "uncanny valley" |
| Nome e foto | Convidado: nome de 2 a 10 caracteres (perguntado na entrada). Logado: username único e foto de perfil **[confirmado]** (F-MOBILE, A1) | |
| Chapéus | Cabideiros onde se pega, troca e devolve chapéus (cowboy, chef, pirata, viking, boné etc.) **[confirmado]** (F-CHANGELOG, A1) | Personalização vinda do mundo, não de um menu |
| Reações | Shift+1..6: coração, fogos, magia, bolhas, **backflip**, lanterna (T); bandeja com o Shift segurado; desligáveis por papel **[confirmado]** (F-REACT) | Não funcionam em salas de conferência |
| Dança | "Frog dance" citada no FAQ **[confirmado]** (F-FAQ-LD) | |
| Roupa de surf | Wetsuit opcional no surf **[confirmado]** (F-CHANGELOG) | |

### 2.8 Editor de mapa, build mode, objetos interativos, embeds e scripts

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Build mode | Permissão "Build Map", **só no computador**; mudanças aparecem ao vivo para todos **[confirmado]** (F-CAT, F-FEAT) | Edição colaborativa ao vivo, sem "salvar e recarregar" |
| Catálogo | Salas e palcos, assentos, escritório, sinalização e mídia, decoração e luz, natureza e terrenos, animais e NPCs, veículos, **jogos e brinquedos**, blocos de construção, monumentos (Big Ben, Liberdade, Pirâmide, Torii) **[confirmado]** (F-CAT) | **Badges** em cada item: Sit, Drive, Ride, Play, Talk, Teleport, Shows content, Private audio, Customisable, Pushable, Wanders |
| Colocação | Arrastar para colocar vários; Esc para; Ctrl+Z; gizmo de redimensionar; Shift coloca sobre o deck; Ctrl+clique desmarca **[confirmado]** (F-CAT, A1) | |
| Geração procedural | "Regenerate" em dunas, lua, prado, deserto, Patagônia, padrão de tapete, mesa e layout de sala **[confirmado]** (A1) | Variedade sem esforço |
| Gerador de café | Café completo (Paris, Brooklyn, diner) em 1 clique **[confirmado]** (F-CHANGELOG) | |
| Templates e configuração guiada | O onboarding pergunta o uso, o tom (profissional, casual ou divertido) e o número de pessoas, e então escolhe as salas **[confirmado]** (F-CHANGELOG, A1) | Templates com tags **capacidade**, **diversão 1–5**, **tamanho 1–5** e **peso na GPU 1–5** |
| Vibes | 8 presets de luz (Daylight, Synthwave, Island Bright, Sunset, Warm, Soft Night, Matrix…), além de gradiente de fundo e capa do card (imagem, GIF, MP4) **[confirmado]** (F-CUST) | Salva na hora para todos |
| Marca | Logo, billboard com logo, **tapete com logo** (remove o fundo), bandeiras, texto 3D, letras de balão, letreiro "Hollywood" com 14 letras **[confirmado]** (A1) | |
| Conteúdo | Billboards, molduras e galerias com luz, sites (preview em card quando o site bloqueia iframe), YouTube nas telas, social buttons que abrem perfis **[confirmado]** (A1) | |
| Limites | 1.000 elementos e 10.000 tiles por sala; rate limit ("Slow down — too many edits"); elementos travados ("only builders can edit") **[confirmado]** (F-LIMITS, A1) | |
| Utilitários de sala | "Clean up room" (volta ao template), duplicar sala (mapa, visual e atividades, sem chat) **[confirmado]** (A1) | |
| **Embed no site** | Botão "flat.social" para o seu site, com **contagem ao vivo de pessoas** (via script) ou versão estática **[confirmado]** (A1, F-PRICE) | Todo embed é um link de volta (aquisição) |
| Scripts / SDK de terceiros | Não encontrado. Não há API nem SDK público para criar jogos ou objetos | — |

### 2.9 Jogos e social

**Salas-arena (estilo da sala, com arena pronta e editável)**

| Jogo | Como funciona | Fonte |
|---|---|---|
| **Futebol** | Times vermelho e azul atribuídos automaticamente (anel sob o avatar); a bola gruda no pé até alguém tirar; **K segurado carrega o chute** (anel de faísca) e mira sozinho no gol; dois tempos com troca de lado; começa ao atingir N jogadores; exige gols vermelho e azul no mapa | A1, F-KEYS |
| **Maze race** | Labirinto novo a cada rodada; moedas +10, diamantes +100; bombas tiram pontos e lançam você longe; bônus de fuga que diminui a cada segundo; o primeiro a sair ganha bônus; vista de cima bloqueada | A1, F-CAM |
| **Arena shooter** | WASD e clique para atirar; destruir blocos dá pontos; um abate rouba 30% do XP da vítima; pontos de upgrade com as teclas 1–6; HP só regenera 60 s após o último golpe; 3 s invulnerável ao nascer; "construa sua arena" | A1 |
| **Territory** | Pinte o chão e feche o laço para conquistar; tocar a linha de alguém elimina essa pessoa; de frente, saem os dois; o mapa é zerado a cada rodada | A1 |
| **Surf** | Pegue uma prancha na areia (sem ela você afunda); reme até a onda; manobras (pular, girar com A/D, aterrissar); pranchas fish, short e gun com multiplicadores; prioridade e "burn"; barrel; **tsunami**; barco com pesca e resgates; heat = 2 melhores ondas + pontos do porto | A1, F-CHANGELOG |
| **Grand Prix** | Pise no botão vermelho da arquibancada; poucos segundos para pular num carro; setas e freio de mão (drift); **3 voltas** no circuito costeiro, 8 carros; dano acumulado explode (3 s de penalidade, igual a cair no mar); a arquibancada mostra os **rostos dos pilotos em ordem**; pistas novas geradas com cooldown | A1, F-CHANGELOG |

**Jogos e brinquedos no mundo (elementos)**

| Item | Como funciona | Fonte |
|---|---|---|
| Boliche | Pista com placar por pessoa e recorde da pista | A1, F-CAT |
| Xadrez | Tabuleiro compartilhado com a sala ("arraste uma peça branca para começar"); "novo jogo" limpa para todos | A1, F-CAT |
| Snake (fliperama) | WASD; Enter ou Espaço para começar | F-KEYS |
| Piano e teclado | Fileira central toca; Z/X mudam a oitava; Espaço sustenta; teclado elétrico com "vozes" que todos ouvem | F-KEYS, A1 |
| Dados e dreidel | Resultado visível a todos; "d20 gigante" com jackpot | F-CAT, A1 |
| Foguete | Montar partes (teclas 1–6), lançar, recordes ("chegou à ISS", mesosfera; avisos "sem aletas", "pesado demais") | A1 |
| Balão de ar quente | Pilotar (Espaço = queimador, setas, Enter pula) | A1 |
| Photo booth | Tira **polaroid** com legenda manuscrita configurável, para baixar | A1 |
| Outros | Canhão de confete, trampolim, bola de praia, patinho, tornado, jarra de picles, chalá, banana para arremessar, disco, sino, megafone, **menorá de Hanukkah** (segue o calendário hebraico), boneco de neve, árvore de Natal | F-CAT, A1 |

**Social**

| Item | Como funciona | Fonte |
|---|---|---|
| **Speed networking / speed dating** | Divide a sala em pequenos grupos, **um por zona de áudio isolada**, e embaralha a cada rodada; prompt de conversa a cada rodada; início automático com N pessoas; modo permanente na sala; avisos de "rodada termina em X s" | A1, F-CHANGELOG |
| **Watercooler** | Bebedouro com perguntas (padrão ou próprias, uma por linha); todos ali veem a mesma pergunta | A1 |
| **Voting booth** | Urna física: andar até ela e votar anonimamente (dá para mudar o voto) | A1 |
| Fogueira e rodas | Rodas de conversa ao redor de objetos | F-HOME, A2 |
| Opcionalidade | O maker responde que os mini-games são opcionais e que o host escolhe incluí-los ou não | F-PH |

### 2.10 Reuniões

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Sala de conferência | Grade (Gallery, Speaker ou Dynamic), palco para compartilhamento, slides e atividades, chat ao lado, modo webinar **[confirmado]** (F-ROOMS, A1) | "Sem mapa e sem avatares, só a chamada" |
| **Atividades fixáveis** | Whiteboard, Webinar, **Standup** e Slides; "fixar na sala" sobrevive a reinícios; uma atividade (um palco) por vez **[confirmado]** (A1) | Rituais viram parte da sala |
| **Standup** | Atualizações uma a uma com **pass-the-mic**, **timer suave por pessoa** (avisa, nunca corta), roster que **lembra o time entre execuções**, auto-adiciona quem chega, desmarcar quem pulou hoje **[confirmado]** (A1) | Excelente desenho de ritual |
| **Slides interativos** | Decks criados no dashboard e apresentados dentro do flat, "sem código de entrada e sem segundo dispositivo". Modos ao vivo (com moderador) ou **self-paced** (salvo para a próxima visita); resultados por sessão **[confirmado]** (A1) | Mentimeter e Kahoot embutidos no escritório |
| Tipos de slide | Ver a lista abaixo da tabela **[confirmado]** (A1) | |
| Breakouts | Dividir a sala em 2, 3 ou 4 grupos **[confirmado]** (A1) | |
| Agendamento | Não encontrado; só "Add to calendar" (day pass e eventos) e a dica de colar o link num convite recorrente **[confirmado]** (A1) | |
| Gravação, transcrição, resumo | **Não existem**: "not recorded, stored, transcribed or analysed" **[confirmado]** (F-PRIV) | Escolha deliberada de privacidade |

Tipos de slide disponíveis:
- **Perguntas e votação:** enquete com barras ao vivo, quiz cronometrado (mais rápido = mais pontos), leaderboard, nuvem de palavras, respostas em cards, Q&A com upvote e moderação, escala de nota, escala de emoji, ranking, dot voting, palpite numérico com "alvo", pin no mapa, rotular diagrama.
- **Rituais prontos:** retro Start/Stop/Continue, **eNPS anônimo**, fechamento de aula (entendimento + dúvidas), peer instruction (vota → discute → vota de novo).
- **Conteúdo:** spotlight de câmeras, título, texto, divisória, tabela, formas, sticky e setas.

### 2.11 IA

| Feature | Status |
|---|---|
| Qualquer IA no produto (resumo, transcrição, assistente, geração de mapa) | **não encontrado**. O blog tem posts SEO sobre "AI meeting assistants", mas o produto não tem IA |
| Configuração guiada ("We use it to pick rooms that fit") | Existe; se usa IA ou regras não foi possível confirmar [inferido: regras/templates] |
| Gerador de café e "Regenerate" | Geração **procedural**, não IA generativa [inferido] |

### 2.12 Integrações

| Integração | Detalhe | Status |
|---|---|---|
| YouTube | Vídeos sincronizados em telas do palco e das mesas | [confirmado] (A1) |
| Sites | Embed por iframe com fallback de preview | [confirmado] (A1) |
| Social buttons | Abrem perfis de redes dentro da sala | [confirmado] (A1) |
| Widget no site | Botão "join" com contagem ao vivo | [confirmado] (A1) |
| Login | Google e Facebook (verificados automaticamente), e-mail e senha com verificação | [confirmado] (F-ROLES) |
| Pagamentos | Stripe (proporcional, recibos) | [confirmado] (F-PRIV, A1) |
| Eventos | Tours ao vivo pelo Luma | [confirmado] (F-HOME) |
| Comunidade | Discord | [confirmado] (F-HOME) |
| Slack, Teams, Google/Outlook Calendar, Zapier, API, webhooks | não encontrado | — |
| SSO SAML/OIDC corporativo | não encontrado | — |

### 2.13 Admin, segurança e privacidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Papéis | **Guest** (padrão), **Member** (+Build Map), **Moderator** (+moderação, anúncios, "Always Access", convites), **custom**, **Owner** (tudo) **[confirmado]** (F-ROLES) | Quem entra por link sem login fica sem papel |
| Permissões (granulares) | *Gestão:* Basic Info, Access, Look & Feel, Rooms, Build Map, Invite, Announcements, Insights, Always Access. *Na reunião:* Camera, Audio, Reactions, Guest List, Chat Window, Screenshare, Present Slides. *Moderação:* Moderate Slides, Move, Mute, Remove, Stop Presentations, Manage Activities, Banned Users, Moderate Chat **[confirmado]** (F-ROLES) | Exclusivos do Owner: planos, embed, papéis, propriedade |
| Acesso ao flat | Qualquer pessoa com o link, **fechado** (só convidados), só logados (sem convidados), **allowlist de domínio** (até 10) **[confirmado]** (A1, F-LIMITS) | Aviso: anônimos são bloqueados pela restrição de domínio |
| Convites | E-mail pessoal com papel; **links por papel** com contador de usos e limite; importação de CSV; expiram em 30 dias **[confirmado]** (A1, F-LIMITS) | O papel só vale com e-mail verificado (F-ROLES) |
| Kick e ban | Remover da sala; banir do flat (por conta ou e-mail); lista de banidos **[confirmado]** (F-ROLES, A1) | Ban por identidade, não por IP |
| Privacidade | Chamadas não são gravadas; o servidor só **encaminha** A/V; replays de sessão do Sentry "capturam a interface, não câmera nem mic" (até 90 dias) **[confirmado]** (F-PRIV, F-FAQ-LD) | |
| Leis | UK/EU data protection, SCCs e IDTA; dados no Reino Unido, na Europa e nos EUA; cookies analíticos só com aceite (UK/EEA/CH) **[confirmado]** (F-PRIV) | LGPD: não citada |
| Retenção | Conta até ser excluída; convites 30 dias; billing 6 anos; logs 30 dias; replays 90 dias; feedback 2 anos **[confirmado]** (F-PRIV) | |
| SOC 2 / ISO | Não encontrado | — |
| SSO | Não encontrado (só OAuth Google e Facebook) | — |
| Insights (Monthly) | Visitas, únicos, atividade, top salas, **países de origem**, busiest hours (heatmap UTC), novos vs. recorrentes, pico de concorrência, adoção de câmera/mic/tela, % engajados vs. "lurking", **quem falou mais**, "superlatives/awards", funil link→entrada, bounce (<30 s), visita mediana **[confirmado]** (A1) | Analytics rico, mas com risco de percepção de vigilância |
| Transferir propriedade | "Em breve" **[confirmado]** (A1) | |

### 2.14 Performance e requisitos

| Item | Detalhe | Fonte |
|---|---|---|
| Navegador | Chrome, Edge, Firefox, Safari (Brave citado) recentes; **WebGL com aceleração de hardware** | F-REQ, F-FAQ-LD |
| Tiers gráficos | **High** (sombras, glow, rastros), **Normal**, **Basic** (resolução menor, sem sombras, **menos feeds de vídeo**), **Low performance** (resolução mínima, **30 FPS**, sem contornos ou luzes, **só 2 câmeras mais próximas**). Escolha automática, com sugestão de nível mais leve quando a sala fica lenta | A1, F-REQ |
| Peso do template | Tag de 1 a 5 "quanto exige do seu computador" | A1 |
| Primeiro acesso | "First visits take a little longer" (cache de modelos e shaders: "Preparing graphics") | A1 |
| Rede | "Estável vale mais que rápido"; UDP 50000–60000 direto; TURN UDP 3478; TCP 7881; TURN/TLS em 443 | F-REQ, F-FW |
| VM / remote desktop | 3D não roda ("3D isn't available on this device") | F-REQ |
| Capacidade | 5 (Free), 50 por sala espacial e 25 por conferência (Monthly), 100 por flat | F-LIMITS |
| Profiler interno | Strings de "rank elements, floors and shaders by what they cost per frame" | A1 (ferramenta interna [inferido]) |

### 2.15 Mobile e acessibilidade

| Feature | Detalhe | Status |
|---|---|---|
| Layout touch | Tela de entrada única, dock (mic, câmera, chat, More, sair), menu More (reações, pessoas, câmera, dispositivos, virar câmera, teleport home, ajuda) | [confirmado] (F-MOBILE) |
| Movimento | Tocar no chão, arrastar como joystick, pinça para zoom, botão de pulo | [confirmado] (F-MOBILE) |
| Conferência no mobile | Paginação de 6 em 6 com swipe; tela compartilhada no topo com expandir e recolher | [confirmado] (F-MOBILE) |
| Fora do mobile | Compartilhar tela, build mode, primeira pessoa, pop-out, Quick Access, blur, cancelamento de ruído, layouts de conferência | [confirmado] (F-MOBILE) |
| Navegadores in-app | Detecta Instagram, LinkedIn e WhatsApp e ensina a abrir no Safari ou Chrome (copiar link, menus ⋮/⋯) | [confirmado] (A1, F-MOBILE) |
| Tela acordada | A tela fica ligada durante a chamada; a câmera reinicia após o bloqueio | [confirmado] (F-MOBILE) |
| Bug de microcopy | Os pills no mobile ainda dizem "Press Enter to…" | [confirmado] (F-MOBILE) |
| Acessibilidade | Há descrições para leitor de tela em alguns componentes (`srDescription`) [confirmado em A1]. Declaração de acessibilidade, legendas e transcrição: não encontrado. Interação baseada em teclado e física 3D dificulta para usuários com deficiência motora ou visual [inferido] | parcial |

### 2.16 Onboarding

| Etapa | Detalhe | Fonte |
|---|---|---|
| Demo sempre aberta | `app.flat.social/f/demo-flat`: "Nosso escritório está aberto. Sem cadastro" | F-HOME |
| Tours ao vivo grátis | Via Luma | F-HOME |
| Entrada de convidado | Só nome (2–10 caracteres); prévia de câmera e mic; "Join and listen" | F-MOBILE, A1 |
| Tutorial no mundo | "Use WASD para andar" → "Espaço para pular" → "siga as setas" → "All four explored. You're ready!"; versões para teclado e toque | A1 |
| Card de primeiro uso | "Sofás, jogos, quadros, pianos: chegue perto e aperte Enter" | A1 |
| Configuração guiada | Uso → tom (profissional, casual, divertido) → quantas pessoas → salas sugeridas → nome e logo → convidar por e-mail ("A flat comes alive with people") | A1, F-CHANGELOG |
| Nudge de convite | "flat.social is better with others" | A1 |
| Saudação humana | "An organic human is here to help you settle in" | A1 |
| Dica de hábito | FAQ: dar uma rotina ao espaço (daily, sexta social) | F-FAQ |

---

## 3. Stack técnica

| Camada | Tecnologia | Evidência | Status |
|---|---|---|---|
| Front (site e app) | **Next.js** (App Router com RSC; chunks **Turbopack**), **React**, **Tailwind** (tailwind-merge), ícones lucide, fontes Typekit | `turbopack-*.js`, `_next/static/chunks`, classes Tailwind, `lucide` (A1) | [confirmado] |
| Render 3D | **Não identificado.** O WebGL é obrigatório e a física 3D é anunciada. O engine não está nos chunks pré-carregados da demo (provavelmente carregado sob demanda) | F-REQ, F-FEAT, A1 | engine JS sobre WebGL [inferido]; nome não encontrado |
| Assets 3D | Low-poly CC0/CC-BY (Poly Pizza, Quaternius, Kenney, Poly by Google) em DigitalOcean Spaces (`flat-social-bucket.lon1...`) | F-CREDITS, F-FW | [confirmado] |
| Mídia | **LiveKit auto-hospedado** (`livekit.flat.social`; TURN `livekit-turn.flat.social`; UDP 50000–60000, 3478; TCP 7881) | F-FW, F-PRIV | [confirmado] |
| Tempo real (salas, presença, chat) | `lon.flat.social` via WSS (Londres) | F-FW; A1 | [confirmado] |
| Biblioteca de socket | Cliente **Socket.IO** presente no bundle | A1 | [confirmado] presença; uso em `lon.flat.social` [inferido] |
| Auth e DB | **Firebase** (auth e banco para contas, flats e chat; `flatsocial.firebaseio.com`) | F-PRIV, F-FW, A1 | [confirmado] |
| Estatísticas | **Neon** (Postgres) para estatísticas de sessão | F-PRIV | [confirmado] |
| Hospedagem | **DigitalOcean** (app e storage; UK/EU/US) | F-PRIV | [confirmado] |
| Borda e antibot | **Cloudflare** (Turnstile em `challenges.cloudflare.com`) | F-FW, F-PRIV | [confirmado] |
| Pagamentos e e-mail | Stripe; Resend | F-PRIV | [confirmado] |
| Observabilidade e produto | **Sentry** (com Session Replay), **Mixpanel** (EU), Google Analytics; alertas internos via Slack | F-PRIV, A1 | [confirmado] |
| Cancelamento de ruído | ML no cliente (~24 MB, CPU extra); fornecedor não identificado | A1 | [confirmado] / modelo [inferido] |
| Vagas e blog técnico | Não encontrados (o blog é 100% SEO) | F-BLOG | não encontrado |

---

## 4. Padrões de UX e design que valem estudar

1. **Avatar = bolha de webcam no mundo 3D.** Resolve três problemas: identidade (rosto real), "uncanny valley" (sem corpo falso) e leitura de grupo (as rodas são visíveis de cima).
2. **Áudio espacial com números simples e explicáveis** (7,5 m cheio, 22,5 m silêncio, 12 vozes) e regras arquitetônicas (paredes, pods, deck, andares).
3. **Megafone, palco e spotlight como objetos físicos:** você vai até o megafone ou o púlpito, e o papel social vem do lugar.
4. **Quatro câmeras para o mesmo mundo** (Normal, Isométrica, Top, 1ª pessoa). A vista **Top** é quase um "modo 2D" do mesmo estado, o que serve de prova de conceito para o objetivo da Infinity.
5. **Tiers gráficos que reduzem também o vídeo** (Basic com menos feeds, Low com só as 2 câmeras mais próximas e 30 FPS): performance tratada como algo que inclui A/V, não só gráficos.
6. **Paleta de comandos (Ctrl+K) como interface universal** de ações, inclusive moderação.
7. **Prompts contextuais "Press Enter to…"** em todos os objetos, com badges no catálogo (Sit, Ride, Play, Private audio…).
8. **Atividades fixadas na sala** (standup, slides, whiteboard) que sobrevivem a reinícios: rituais com endereço.
9. **Standup com roster que lembra o time, timer suave e pass-the-mic.**
10. **Speed networking implementado com zonas de áudio isoladas** e reembaralhamento automático.
11. **Estados compartilhados e lúdicos** (luzes, lava lamp, discoteca) para que o espaço pareça vivo.
12. **Microcopy de erro excelente** (áudio de aba, navegador in-app, iOS "não pergunta de novo", take over de tela).
13. **Card de sala que se desenha ao vivo** com quem está dentro; "{a} e {b} já estão aqui" ao entrar.
14. **Tags de template** com capacidade, diversão, tamanho e **peso de GPU**: honestidade sobre o custo de performance.
15. **Preço por capacidade simultânea** com convidados grátis e Day Pass: nada de "assento nomeado".

---

## 5. Críticas e pontos fracos

### 5.1 Reclamações reais e sinais públicos

| Sinal | Fonte |
|---|---|
| Product Hunt: **3,0** com 3 reviews, 283 seguidores. Review visível: o áudio espacial "funcionou melhor que o esperado", mas **"os mini-games podem distrair"**; sugere um prompt para voltar à conversa depois do jogo, para não virar "só noite de jogos" | F-PH |
| G2: **0 reviews** | busca (G2) |
| SoWork (concorrente, parcial): "evento e social forte, mas plataforma de trabalho diário mais fraca"; presença "dependente de sessão"; sem IA, resumo ou transcrição; integrações rasas | F-SOWORK |
| Limitações admitidas nos docs: sem compartilhar tela no mobile; iOS sem fade nem pan espacial; 3D não roda em VMs e desktops remotos | F-MOBILE, F-AUDIO, F-REQ |
| Strings de "beta" nos preços e analytics "not connected" em algumas configurações (maturidade) | A1 |
| Muito conteúdo de blog SEO genérico e quase nenhum conteúdo técnico ou de prova social (sem clientes nomeados na home) | F-BLOG, F-HOME |

### 5.2 Minha análise crítica (o que falta)

1. **Trabalho diário:** sem status persistente (ocupado, foco, ausente), sem calendário, sem "bater na porta" real, sem mesa atribuída e sem integrações com Slack ou Teams. É ótimo para eventos e sociais, fraco como "sede" do dia a dia.
2. **Escala e empresa:** 50 por sala e 100 por flat, um fornecedor muito pequeno e sem SOC 2 ou SSO. Inviável para empresas médias e grandes com compliance.
3. **Dependência de GPU e WebGL:** barra quem usa VDI, Citrix ou notebooks corporativos travados. Não há **fallback 2D**.
4. **Bolha de vídeo sem câmera:** com a câmera desligada, a presença vira uma bolha vazia ou com foto, e o produto depende de câmera ligada para ter vida (comportamento sem câmera não documentado).
5. **Salas de jogo sem áudio espacial** viram um caos sonoro com muitas pessoas.
6. **Sem gravação, transcrição ou IA:** coerente com privacidade, mas deixa de fora a memória das reuniões (atas, decisões).
7. **Novidades sazonais e lúdicas demais** (menorá, chalá, T. rex) em relação a recursos de produtividade. Isso reforça a crítica de "distração".
8. **Mic e câmera sem atalho de teclado:** um detalhe pequeno com impacto diário grande.
9. **Acessibilidade fraca:** controles de jogo, física e microcopy de teclado no mobile.
10. **Insights com "quem falou mais" e "lurking"** podem soar como vigilância num escritório interno.

---

## 6. Para a Infinity

> Contexto: escritório virtual **interno**, com **2D e 3D no mesmo mundo**. Não há guests pagantes. O foco é adoção diária, rituais de time, privacidade (LGPD) e máquinas corporativas variadas.

### 6.1 O que copiar

1. **Bolhas de vídeo como avatar no 3D** (disco com webcam, nome, sombra) e, no modo 2D, o **mesmo disco visto de cima** como token. A identidade fica igual nos dois modos.
2. **Os parâmetros de áudio** (cheio até ~7,5 m, silêncio em ~22,5 m, panorâmica, limite de N vozes mais próximas), **paredes que isolam**, **zonas sobrepostas em que a menor vence**, **megafone**, **palco com PA** e "Mute for me".
3. **Múltiplas câmeras sobre um mundo só** (Normal, Isométrica, Top, 1ª pessoa). A vista Top é a ponte natural para o modo 2D da Infinity.
4. **Tiers de performance que incluem o vídeo** (só 2 câmeras próximas no modo leve, 30 FPS) e a **tag de peso de GPU** nos templates de sala.
5. **Ctrl+K como interface universal**, mais "Teleport home (unstuck)", seguir, "todos seguem minha vista" e summon/agrupar/dividir em grupos.
6. **Atividades fixadas na sala:** Standup (roster que lembra o time, timer suave, pass-the-mic), Retro, eNPS, Whiteboard, Webinar com mão levantada, Slides interativos.
7. **Speed networking com zonas isoladas** e o **Watercooler com perguntas** para integrar times de unidades diferentes.
8. **Anúncios com Markdown e `#sala`**, cards de sala ao vivo e "{a} e {b} já estão aqui".
9. **A microcopy de erros de dispositivo e navegador** (áudio da aba, iOS, navegador in-app).

### 6.2 O que melhorar

1. **Fallback 2D automático:** se o WebGL falhar (VDI, GPU fraca) ou a bateria estiver baixa, a mesma sala abre em 2D com o mesmo grafo de áudio. É exatamente o buraco do Flat ("3D isn't available on this device").
2. **Presença de trabalho persistente:** status, foco ligado ao Google/Microsoft Calendar, mesa atribuída, "bater na porta" real e horários de trabalho e fuso.
3. **Comportamento sem câmera:** avatar ilustrado ou foto animada pelo áudio (anel de fala), para que câmera desligada não pareça "ausência".
4. **Salas de jogo com áudio por time e proximidade** (não "todos a 100%") e um **prompt de "voltar à conversa"** ao fim, como sugeriu o review do PH.
5. **SSO corporativo** (Google Workspace, Entra ID), papéis sincronizados com grupos, logs de auditoria e **LGPD** com dados no Brasil.
6. **Memória de reunião opcional e transparente:** gravação e transcrição com consentimento visível para todos, resumo por IA publicado no canal do time e retenção configurável.
7. **Atalhos de teclado para mic e câmera** e acessibilidade como requisito (navegação por teclado no 2D, legendas ao vivo).
8. **Insights centrados no time e agregados** (picos de uso de salas, adoção de rituais), sem ranking individual de fala nem de "lurkers".

### 6.3 O que evitar

1. Novidade lúdica sem fim às custas de recursos de produtividade.
2. Depender 100% de GPU e WebGL.
3. Capacidade baixa por sala (25 a 50) para all-hands. A Infinity precisa de auditório para a empresa toda.
4. Prompts de teclado ("Press Enter") em telas de toque.
5. Métricas pessoais que soem como vigilância.
6. "Take over" de tela que derruba o apresentador anterior sem fila ou pedido.

### 6.4 Ideias inovadoras inspiradas pelo Flat.social

1. **Câmera contínua de 2D a 3D.** Um slider ou zoom semântico que vai da **planta 2D (Top ortográfica)** à isométrica e à vista "Normal" 3D, sem recarregar e com o mesmo estado. O 2D vira um ângulo de câmera, não outro produto. Com o fallback automático, o mesmo controle resolve VDI e máquinas fracas.
2. **Bolha adaptativa.** A bolha cresce levemente quando a pessoa fala, ganha um anel de "status" (foco, em reunião, disponível) e mostra um mini ícone do calendário. Com a câmera desligada, vira um avatar ilustrado animado pela voz. No 2D, o mesmo anel aparece no token.
3. **Rituais com endereço e memória.** Cada time tem uma "sala de ritual" com Standup fixado: roster sincronizado com o diretório, pass-the-mic, notas compartilhadas e, ao final, **resumo por IA** com bloqueios e decisões postado no Slack ou Teams e anexado à tarefa (Jira/Linear).
4. **Café aleatório entre unidades.** Speed networking agendado (ex.: quinzenal) que embaralha pessoas de áreas e cidades diferentes em pods isolados, com prompts tirados de interesses e projetos e um "match" opcional para marcar café depois.
5. **Palco híbrido de all-hands.** Auditório com PA para 500+ pessoas, spotlight de até 6 câmeras, Q&A com upvote e reações em massa visíveis no 3D (fogos, corações) e agregadas no 2D (contadores). Ao final, a sala vira o "after" com rodas espaciais.

---

## 7. Fontes

**Site oficial e preços**
- F-HOME: https://flat.social/pt (home PT, acessada em 15/11/2026)
- F-PRICE: https://flat.social/pt/pricing
- F-FAQ: https://flat.social/en/faq (FAQ curto de marketing no HTML)
- F-FAQ-LD: FAQ estruturado (JSON-LD) no HTML de https://flat.social/en/faq
- F-CHANGELOG: https://flat.social/en/changelog
- F-FEAT: https://flat.social/en/online-meeting-features
- F-SPATIAL: https://flat.social/en/spatial-chatting
- F-BLOG: https://flat.social/en/blog
- F-PRIV: https://flat.social/en/privacy
- F-CREDITS: https://flat.social/en/credits

**Central de docs (flat.social/en/docs/...)**
- F-DOCS: https://flat.social/en/docs (índice)
- F-AUDIO: /docs/how-spatial-audio-works
- F-ROOMS: /docs/room-types
- F-CAM: /docs/camera-views
- F-REQ: /docs/system-requirements
- F-CONN: /docs/connection-issues
- F-FW: /docs/firewalls-and-vpns
- F-MOVE: /docs/move-your-avatar
- F-KEYS: /docs/keyboard-shortcuts
- F-REACT: /docs/reactions-and-actions
- F-CAT: /docs/element-catalog
- F-CUST: /docs/customize-rooms
- F-MOBILE: /docs/phones-and-tablets
- F-ROLES: /docs/roles-and-permissions
- F-LIMITS: /docs/plans-and-limits

**Terceiros**
- F-PH: https://www.producthunt.com/products/flat-social/reviews
- F-SOWORK: https://www.sowork.com/blog/sowork-vs-flat-social-virtual-office-comparison-2026 (comparativo escrito por concorrente; usar com cautela)
- F-DEV: https://dev.to/paweldotio/what-are-the-use-cases-for-flatsocials-spatial-audio-video-tech-4o47
- G2 (0 reviews, via busca): https://www.g2.com/products/flat-social/reviews
- Tentativa sem sucesso (403): https://www.indiehackers.com/post/show-ih-flat-social-digital-spaces-for-fun-online-meetings-virtual-events-238fc1f85c
- Também via busca: https://chatgate.ai/post/flat-social , https://alternativeto.net/software/flat-social/about

**A1 / A2 (análise de artefatos públicos)**
- A1: HTML público da demo https://app.flat.social/f/demo-flat (payload RSC com strings i18n em inglês) e os chunks JS `/_next/static/chunks/*.js` referenciados por ele, salvos em scratchpad e analisados só com grep.
- A2: pôsteres públicos dos vídeos da home: https://flat-social-bucket.lon1.cdn.digitaloceanspaces.com/website-videos/spatial-audio-square-poster.webp e .../beach-square-poster.webp
