# ZEP (zep.us): engenharia reversa de produto

> **Alvo:** ZEP (https://zep.us/en), a plataforma de "espaços virtuais" 2D da ZEP Co., Ltd. (joint venture de NAVER Z/ZEPETO e SUPERCAT). O foco é o produto **ZEP Spaces** (escritório, eventos, aulas), com atenção especial ao **sistema de mini-games, apps e ZEP Script**. Cito ZEP QUIZ e ZEP School só quando ajudam a entender a estratégia.
> **Data da pesquisa:** 15/11/2026. Usei só informação pública: site, guia oficial (Channel Talk), central de suporte, notas de atualização, docs do ZEP Script (GitBook), FAQ de preços e o HTML/JS público de `zep.us/en`, `zep.us/pricing` e `zep.us/play`. Analisei os bundles apenas com grep, sem executar nada. Não criei conta nem fiz login.
> **Legenda:** **[confirmado]** = está em fonte citada (códigos na seção 7). **[inferido]** = dedução minha a partir de indícios. "não encontrado" = procurei e não achei.
> **B1** é a evidência que extraí do HTML e dos bundles públicos (`zep.us/en`, `zep.us/home/landing`, `zep.us/pricing`, chunks de `zep.us/play/_next/...`), incluindo as tabelas de strings (i18n) embutidas no HTML.

---

## Resumo executivo

- O ZEP é um **metaverso 2D em pixel art, visto de cima e baseado em tiles de 32 px**, que roda no navegador. Foi lançado em beta em nov/2021 e oficialmente em mar/2022. É feito por uma JV entre a **NAVER Z (ZEPETO)** e a **SUPERCAT** (estúdio de *Baram-ui Nara: Yeon*). Diz ter **30 milhões+ de usuários acumulados** e suportar **até 50.000 pessoas por espaço**. Outras fontes falam em 150.000 simultâneos, com "canais" de 500 (Z-HOME, E1, B1).
- **Posicionamento atual:** a home de 2026 virou uma vitrine de **educação** ("Making learning more fun than ever"), com três produtos: **ZEP** (espaços em tempo real), **ZEP QUIZ** (quizzes com IA) e **ZEP School** (aulas prontas). Escritório e eventos continuam, mas como caso de uso secundário (Z-HOME).
- **Diferencial mais forte:** é uma **plataforma programável**. O **ZEP Script** é JavaScript/TypeScript, roda no servidor [inferido forte] e tem ciclo de vida (`onInit`, `onJoinPlayer`, `onStart`, `onUpdate` a cada ~20 ms, `onDestroy`), eventos de colisão/teclas/chat, widgets HTML com troca de mensagens, storage, chamadas HTTP e cobrança em moeda própria (ZEM). **Qualquer pessoa** pode criar e subir apps. Há **Asset Store** com revisão de 3 a 5 dias úteis e **split 70/30** (Z-S-*, Z-ASSET).
- **Mini-games oficiais** (Zumbi, Bombers, Boxe, Paintman, Corrida, Desviar do Cocô, OX Quiz, Quiz Show/Golden Bell, Múltipla Escolha, Pedra-Papel-Tesoura, Escape Room) seguem um padrão de UX simples e genial: o host abre pela sidebar, **surge uma "caixa de jogo" onde ele está**, o jogo começa na hora, e **pular na caixa (Espaço) encerra** (Z-MG).
- **Áudio/vídeo:** proximidade por **tiles** (≤6 cheio, 7–10 "meio", ≥11 desligado), **Private Areas** por ID, **Spotlight** que transmite para o mapa inteiro, vídeo em **caixas num painel/grade** (não sobre o avatar). A mídia roda em **LiveKit Cloud** [confirmado] (Z-FW, B1).
- **Momento da empresa: retração e monetização.** Em 2025–2026 o ZEP **descontinuou os apps nativos** (mai/2025), **o modo só áudio** (jul/2026), **10 apps oficiais de sidebar e a ZEM Door** (jul/2026) e as configurações de objeto **AI NPC, API Call e Animação** (nov/2026), sempre "para melhorar a estabilidade". No mesmo período moveu recursos para planos pagos (Basic/Pro, jul/2026) (Z-N-*).
- **Fraquezas principais:** só 2D com estética "de jogo" (pode parecer infantil num contexto corporativo); vídeo desacoplado do mundo; sem status/presença de trabalho, calendário ou integrações (Slack/Notion/Calendar não existem, e a própria pesquisa de cancelamento pergunta por elas); sem API pública; manutenção semanal e dezenas de avisos de manutenção; banimento de convidados **por IP** (um problema sério atrás de NAT corporativo); experiência de desenvolvimento de scripts primitiva (sem debug local, erros aparecem no chat).

---

## 1. Visão geral

### 1.1 Empresa e linha do tempo

| Data | Evento | Status |
|---|---|---|
| 2021 | ZEP nasce como JV metaverso de NAVER Z e SUPERCAT | [confirmado] (E1; B1 string "ZEP is developed by NAVER Z (ZEPETO) and SUPERCAT") |
| nov/2021 – mar/2022 | Beta em nov/2021, serviço oficial em mar/2022 | [confirmado] (E1) |
| mai/2023 | ~5 milhões de usuários acumulados; clientes Samsung, Lotte, BC Card, governo de Seul, secretarias de educação | [confirmado] (E1) |
| 21/07/2023 | Cobrança por **máximo de usuários simultâneos (CCU) por Space** | [confirmado] (busca em Z-PRICE-FAQ-KR) |
| 14/03/2024 | Reajuste de preços dos planos Premium | [confirmado] (Z-N-PRICE24) |
| 04/06/2024 | "Major Update": nova UI de chat (abas pública/privada, bubble/full view), sidebar em painéis, Add Media no menu | [confirmado] (Z-U2464) |
| 13/06/2024 | Fim do plano ZEP Edu gratuito de 50 CCU | [confirmado] (B1 `topNotify`) |
| 26/09/2024 | Novo modelo de preço por faixa de CCU, passes de 1 dia, 3 dias e N meses, pagamento por transferência | [confirmado] (B1; Z-U240926) |
| 24/10/2024 | Banner "Free" fixo no topo dos espaços gratuitos | [confirmado] (Z-U241024) |
| dez/2024 | Pro passa a incluir Data Dashboard e apps oficiais ilimitados; Free/Basic ficam com **1 app oficial** | [confirmado] (Z-PRO24) |
| 09/05/2025 | **Apps nativos (iOS/Android/Mac) descontinuados**; só web | [confirmado] (Z-N-APP) |
| 10/07/2025 | **AI Chat** dentro do espaço (Pro, em "Labs") | [confirmado] (Z-U250710) |
| 2026 | Deploy sem downtime: scripts precisam salvar estado (`onMigrationStart`) | [confirmado] (Z-N-MIGR) |
| 30/06/2026 | Gravação de tela (Enterprise) e arquivos/imagens no chat e DM (Enterprise) | [confirmado] (Z-U260630) |
| 13/07/2026 | Fim do modo "Só áudio" | [confirmado] (Z-N-AUDIO) |
| 22/07/2026 | Fim de 10 apps oficiais de sidebar e da ZEM Door | [confirmado] (Z-N-SIDEBAR) |
| 31/07/2026 | Recursos redistribuídos entre Basic e Pro; Free limitado a 1 spotlight e 1 compartilhamento de tela por mapa | [confirmado] (Z-PLAN26) |
| 04/11/2026 | Fim das configurações de objeto **Animation, API Call (POST) e AI NPC** (data "sujeita a mudança") | [confirmado] (Z-N-OBJ) |
| 10/11/2026 | **Map Editor V2 (Beta)** | [confirmado] (Z-U261110) |

### 1.2 Posicionamento e público

- **Hoje:** educação primeiro. A home lista prêmios do Ministério da Educação coreano (K-Edutech 2025) e três serviços: ZEP (até 50.000 pessoas), ZEP QUIZ (até 200) e ZEP School (até 50) **[confirmado]** (Z-HOME).
- **Histórico e casos de uso:** escritórios, bootcamps, feiras de emprego, eventos corporativos e de marca (pop-up stores, fan meetings de K-pop), setor público e escolas **[confirmado]** (E1, Z-S-USE).
- **Mercados:** Coreia em primeiro lugar, Japão (entrada via SoftBank anunciada em 2023), além de EN e TH **[confirmado]** (E1; B1: `hreflang` para `/th/`, mapeamento de idioma ko/en/ja). Os planos Premium aparecem como "não disponíveis na sua região" em algumas regiões (B1 `descriptionJapanReady`).

### 1.3 Dimensão gráfica

- **2D top-down em pixel art**, tiles de 32×32 px, mapa de até **512×512 tiles** (16.384 px) **[confirmado]** (Z-TOOLS).
- Avatares em sprite com **8 direções** (`dir` de 1 a 8) **[confirmado]** (Z-S-API).
- Camadas: piso, parede, objeto (abaixo do avatar), **top object** (acima do avatar), efeitos de tile, imagens de fundo e de frente **[confirmado]** (Z-OBJ, Z-PERF).
- **Não há 3D nem 2.5D.** O trunfo da SUPERCAT é justamente a pixel art "à la Baram" **[confirmado]** (E1).

### 1.4 Plataformas

| Plataforma | Situação | Fonte |
|---|---|---|
| Navegador desktop | Principal. "Desenvolvido com base no Chrome"; Safari e navegadores in-app limitam recursos | [confirmado] (Z-SPEC) |
| Navegador mobile | Funciona, com joystick virtual, botão de interação e chat em meia tela. **Sem compartilhamento de tela** | [confirmado] (Z-CTRL, Z-RTC) |
| App nativo iOS/Android/Mac | **Descontinuado em 09/05/2025**; instalações existentes pararam de funcionar | [confirmado] (Z-N-APP) |
| Desktop (Electron etc.) | Não encontrado | — |

### 1.5 Modelo de preço e limites

A cobrança é **por Space**, pelo **máximo de usuários simultâneos (CCU)** em todos os mapas do Space, em degraus de 10 **[confirmado]** (Z-PLAN, B1).

| Plano | Limites e recursos | Fonte |
|---|---|---|
| **Free** | Até **10 CCU** (fontes antigas falam em 20); **1 app** de sidebar; **1 spotlight e 1 compartilhamento de tela por vez por mapa**; banner "Free" no topo | [confirmado] (Z-PLAN, Z-PLAN26, Z-U241024; conflito em Z-FUNC) |
| **Basic** | A partir de **30 CCU**. Space fora de busca, senha, só logados, só membros, **allowlist de domínio**, título obrigatório na entrada, remove banner/pop-up | [confirmado] (B1 `basicPlanException`; Z-PLAN26) |
| **Pro** | URL customizada (`zep.us/@nome`), tela de loading customizada, download de chat (7 dias) e de visitas (30 dias), alerta de desconexão, ver vídeo de todos no spotlight, restringir chat/DM/embed a hosts, **corrida (tecla R)**, **apps oficiais ilimitados**, **Data Dashboard**, Google Analytics, **AI Chat** | [confirmado] (Z-PLAN26, Z-PRO24, Z-HOSTSPACE, Z-U250710) |
| **Enterprise** | Servidor dedicado, suporte prioritário com gerente, **SSO negociável**, **gravação de tela**, **arquivos/imagens no chat e DM**, número de pessoas por canal ajustável | [confirmado] (Z-PLAN, B1 `featureNegotiation: More features available including SSO`, Z-REC) |

- **Outras regras:** pagamento mensal ou anual (anual adiantado). Passes avulsos de 1 dia, 3 dias ou N meses. Mais de 300 CCU ou Enterprise exige falar com vendas. **Sem reembolso.** IVA de 10% cobrado à parte na Coreia desde 18/06/2026. Desconto EDU de 30% para professores coreanos **[confirmado]** (Z-PLAN, B1, Z-PRICE-FAQ-KR).
- **Preço por usuário:** **não encontrado em texto**. A tabela é carregada dinamicamente ou mostrada como imagem. As strings mostram apenas "Approx. {{price}} per user per month" (B1).
- **Escala:** canal padrão de **500 pessoas**. Um novo canal é criado quando o atual passa de 60%, e os usuários entram em canais abaixo de 80%. Até **300 canais**, ~150.000 CCU por Space **[confirmado]** (Z-HOSTCHK, Z-U2426, B1).

---

## 2. Inventário completo de features

### 2.1 Mundo, mapa e movimentação

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Space → Maps | O Space agrupa 1+ mapas, cada um com um HashID; um mapa é o "Entry Map". A URL `zep.us/play/{space}/{map}` leva direto ao mapa **[confirmado]** (Z-S-SPACES) | Opção "Sempre começar pelo Entry Map", mesmo vindo por link de outro mapa (Z-EDITOR) |
| Movimento | Setas no PC; joystick virtual no mobile (melhorado em ago/2026) **[confirmado]** (Z-MG-ESC, Z-U260804) | Velocidade padrão 80 (scripts mudam) (Z-S-API) |
| Corrida | Tecla **R** acelera (automático no mobile). Recurso **Pro** **[confirmado]** (Z-HOSTMAP, Z-PLAN26) | Correr virou recurso pago |
| Pular / sentar / seguir / fila | Espaço pula; sentar existe no PC e no mobile; "seguir, andar, fazer fila, sentar, pular" são citados como interações espaciais **[confirmado]** (Z-CTRL, B1 landing KR) | |
| Interagir | Tecla **F** (PC) ou botão de interação (mobile) **[confirmado]** (Z-CTRL) | Scripts podem trocar o ícone do botão mobile (Z-S-*) |
| "Atacar" / cutucar | Tecla **Z**. Usada em jogos (boxe) e para "poke" (notificação). O host pode desligar o poke **[confirmado]** (Z-HOSTMAP, Z-S-API) | Mesmo botão para luta e cutucada |
| Seguir alguém | Pelo perfil → Follow. Segue **até através de portais**; se a pessoa sai do Space, você fica em espera e volta a seguir quando ela retorna. Qualquer tecla cancela **[confirmado]** (Z-PROFILE) | Bom para tours e onboarding |
| Retomar de onde parou | Salva a última posição do usuário no Space **[confirmado]** (Z-HOSTSPACE) | |
| Respawn | Função de respawn (dez/2024) **[confirmado]** (Z-U241217) | |
| Portais | Tile de portal leva para outro mapa, para uma área do mesmo mapa ou para outro Space. O destino é um "Map Location" com nome exato **[confirmado]** (Z-TILE) | Falha se o nome de área se repete entre mapas (Z-MAPUP) |
| Portal temporário | Add Media → Portal cria um portal para outro Space seu, que some em ~10 s **[confirmado]** (Z-EMBED) | "Entre antes de mim": o portal fecha quando o criador passa |
| Pontos de spawn | Tile "Starting point". Com vários, sorteia; sem nenhum, nasce no centro **[confirmado]** (Z-TILE) | |
| Bloqueio | Tile "Impassable". Diagonais deixam frestas, e o guia recomenda "escadinha" **[confirmado]** (Z-TILE, Z-PERF) | |
| Menu "Move" | O host define destinos (inclusive em outros mapas do Space) que aparecem como ícone na sidebar **[confirmado]** (Z-SIDEBAR) | Teleporte de 1 clique sem andar |
| Admin: summon e teleport | Invocar 1 usuário pelo apelido, todos do mapa, ou todos de outros mapas (delay de 5 s); até 20 locais de teleporte só para admins; `!spawn NOME` **[confirmado]** (Z-ADMIN, Z-HOSTCHK) | Apelidos duplicados atrapalham: invoca o último que entrou |
| Câmera espectador | App com até 5 câmeras fixas (coordenadas); quem assiste fica parado; ESC sai. **Premium** **[confirmado]** (Z-APP-SPEC) | Bom para eventos e jogos |
| Zoom da tela | `displayRatio` por app ou por jogador (scripts) **[confirmado]** (Z-S-API) | Sem controle de zoom documentado para o usuário: não encontrado |
| Objetos interativos | Gatilho por F ou automático ao entrar no raio (máx. 312 tiles) **[confirmado]** (Z-OBJ, Z-PERF) | Raios sobrepostos causam problemas |
| Tile de galeria | O usuário sobe imagens no modo Play numa área definida pelo editor **[confirmado]** (Z-TILE) | Admin apaga qualquer uma; usuário só as próprias |
| Screenshot limpo | Ctrl+F12 captura a tela sem widgets **[confirmado]** (Z-EMBED, Z-SIDEBAR) | |
| Música de fundo | BGM por mapa (MP3/WMA até 10 MB); volume por usuário **[confirmado]** (Z-PERF, Z-USER) | |

### 2.2 Áudio e vídeo por proximidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Raio por tiles | **≤6 tiles: ativo; 7–10: "médio"** (janela translúcida); **≥11: inativo** **[confirmado]** (Z-RTC, Z-FUNC) | Três estados visuais em vez de uma curva de volume |
| Caixas de vídeo | O vídeo aparece numa **área de caixas** (topo/direita), não sobre o avatar. Borda menta e animação de voz para quem fala. Clicar abre em tela cheia **[confirmado]** (Z-RTC) | "Sem limite de caixas visíveis" (Z-FUNC) |
| Grade | Grade automática com 4 a 7 colunas; o usuário escolhe de 2 a 7 por linha; quem está sem câmera ganha caixa individual **[confirmado]** (Z-U250218, Z-U250613) | |
| Volume por pessoa | Slider em cada caixa de vídeo ou de compartilhamento **[confirmado]** (Z-RTC) | |
| Câmera/mic ao entrar | Desligados por padrão (ícone vermelho); verde quando ligados **[confirmado]** (Z-RTC) | |
| **Private Area** | Tile com **ID de área**. Áreas separadas com o mesmo ID conversam entre si; o lado de fora escurece; opção de capacidade (1 pessoa por tile); variante intransponível **[confirmado]** (Z-TILE) | Sombreamento suave ao entrar (ago/2026) (Z-U260828) |
| **Spotlight** | Tile/área ou permissão no perfil: transmite **vídeo, áudio e chat** para o mapa todo. Badge e cor de apelido próprios **[confirmado]** (Z-TILE, Z-PROFILE, Z-U250103) | Free: 1 por mapa; pagos: ilimitado (B1) |
| Spotlight vê todos | Quem está em spotlight vê as caixas de todos do mapa. **Pro** **[confirmado]** (Z-HOSTMAP, Z-PLAN26) | Útil para professor/apresentador |
| Modos A/V do mapa | "Todos", "Só spotlight", "Só em Private Areas", "Desativar A/V" (para otimizar). "Só áudio" saiu em jul/2026 **[confirmado]** (Z-HOSTMAP, Z-N-AUDIO) | Trocar de "desativado" para outro modo **recarrega o Space** |
| Mute em massa | `!muteall` / `!unmuteall` **[confirmado]** (Z-HOSTCHK) | Via comando de chat |
| Opções da caixa | Admin: Ver perfil, Kick. Usuário: Ver perfil **[confirmado]** (Z-RTC) | |
| PIP | PIP automático ao trocar de aba (em tela cheia ou do topo do spotlight), PIP manual, janela redimensionável; mic e câmera dentro do PIP (out/2025) **[confirmado]** (Z-RTC, Z-U250103, Z-U251031) | Às vezes exige mexer o avatar (política do navegador) |
| Status do servidor RTC | Ícone ao lado do apelido mostra o estado da conexão RTC (só para você); aviso para recarregar **[confirmado]** (Z-U250901) | |
| Alerta de desconexão | Som quando o Space ou o A/V cai. **Pro** **[confirmado]** (Z-U251218, Z-PLAN26) | Ótimo para quem deixa a aba em segundo plano |
| Megafone, palco, bolhas | Não há megafone separado: o **Spotlight** cumpre esse papel. Bolhas de vídeo sobre avatares: não encontrado | — |

### 2.3 Compartilhamento de tela

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Compartilhar | Botão na barra inferior: tela inteira, janela ou aba. **Só PC** **[confirmado]** (Z-RTC) | |
| Áudio do sistema/aba | Checkbox "Share tab audio" **[confirmado]** (Z-RTC, Z-HOSTCHK) | |
| Onde aparece | Uma caixa extra "{apelido}'s screen", ao lado da sua câmera (as duas transmitem juntas) **[confirmado]** (Z-RTC) | Fica no painel, não "dentro" do mundo |
| Múltiplos | Free: **1 por mapa por vez**; pagos: "ilimitado por mapa" **[confirmado]** (Z-PLAN26, B1 `screenShareUnlimited`) | |
| Zoom no compartilhamento | Até **300%** com arrastar para navegar (jan/2026) **[confirmado]** (Z-U260107) | Não melhora a qualidade se a rede do apresentador estiver ruim |
| Status de rede | Mostrado sobre a tela compartilhada **[confirmado]** (Z-U250103) | |
| Para o mapa todo | Spotlight + compartilhamento = todos do mapa veem **[confirmado]** (Z-HOSTCHK) | Receita oficial para palestras |
| Gravação | **Enterprise**. Feita **no servidor**; só grava o usuário em spotlight (tela + câmera); 1 gravação por Space; máximo de **1h20**; link por e-mail válido por 3 dias (3 downloads); indicador REC visível só para admins e para o gravado **[confirmado]** (Z-REC) | Atenção: os outros participantes **não veem** que há gravação |
| Telas no mundo | YouTube embutido como bloco no mapa (Add Media) e objeto "Apresentação" com PDF navegável (ago/2026). Tela compartilhada projetada num objeto do mapa: não encontrado | — |

### 2.4 Qualidade de áudio

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Provedor | **LiveKit Cloud** (`*.livekit.cloud`, `*.turn.livekit.cloud`; UDP 50000–60000, 3478; TCP 7881). "ZEP usa uma solução externa para vídeo, áudio e tela" **[confirmado]** (Z-FW; B1 strings "LiveKit doesn't seem to be supported") | Recomenda liberar UDP e hole punching |
| Supressão de ruído | Não encontrado (nenhum toggle documentado; supressão/eco padrão do WebRTC do navegador [inferido]) | — |
| Desfoque de fundo | Só PC web e tablet Android, no Chrome; avisa que afeta a performance **[confirmado]** (Z-USER, Z-AVG) | |
| Fones Bluetooth | "Não garantido em serviços WebRTC"; recomenda fone com fio **[confirmado]** (Z-AVG) | |
| Microfoneia | Recomenda 1 dispositivo de áudio por apresentador no mesmo local **[confirmado]** (Z-HOSTCHK) | |
| Volume padrão | Aumentado em jul/2024 e mar/2025 **[confirmado]** (Z-U24723, Z-U250328) | |
| Teste de microfone | Nas configurações de A/V **[confirmado]** (Z-USER) | |

### 2.5 Chat e comunicação assíncrona

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Chat do mapa | Abas **Pública** e **Privada** (Private Area). De fora dá para **ler** a aba privada, mas não escrever **[confirmado]** (Z-CTRL, Z-U2464) | Uma escolha estranha de privacidade: conversa "privada" legível de fora |
| Visualizações | **Bubble View** (balões; spotlight em menta, você em lilás) e **Full View**; no mobile, meia tela ou tela cheia **[confirmado]** (Z-CTRL) | Avatar ao lado de cada mensagem |
| Menu de contexto | Botão direito numa mensagem permite transformá-la em **anúncio** **[confirmado]** (Z-CTRL) | |
| Reações no chat | Joinha, coração e check (jun/2025) **[confirmado]** (Z-U250613) | |
| @menção | `@usuário`; admins usam `@all` e `@host`; notifica no navegador ou no ZEP (ago/2026) **[confirmado]** (Z-MENTION) | |
| DM | Só entre usuários logados; busca de conversas; janela no canto inferior direito **[confirmado]** (Z-PROFILE, Z-U260814, Z-U250710) | O host pode desligar DMs no mapa |
| Arquivos e imagens | No chat e na DM: imagens até 10 MB (convertidas para WebP), arquivos até 25 MB (pdf, docx, xlsx, pptx, hwp, zip, md, csv). **Enterprise** **[confirmado]** (Z-U260630) | |
| Moderação | Slow mode (`!chatinterval N`, padrão 0,5 s), filtro de palavras proibidas, `!clear`, apagar histórico, restringir chat a hosts e spotlight (Pro) **[confirmado]** (Z-HOSTCHK, Z-HOSTSPACE, Z-PLAN26) | Para aplicar palavras proibidas é preciso digitar `!destroyspace` |
| Histórico | Download dos últimos 7 dias (Pro); o histórico não foi migrado na grande atualização de 2024 **[confirmado]** (Z-HOSTSPACE, Z-U2464) | |
| Anúncios | Ícone na sidebar, até **400 caracteres**, só o mais recente aparece; pop-up na entrada; notificação de atualização **[confirmado]** (Z-SIDEBAR) | |
| Avisos do admin | Texto no topo do mapa (1×, a cada minuto ou sempre); **avisos com imagem** (na entrada 1×/dia para logados, uma vez só, ou para 1 usuário específico) **[confirmado]** (Z-ADMIN) | |
| Quadro branco | Add Media → Whiteboard: desenho e imagens em tempo real **[confirmado]** (Z-EMBED) | É um "bloco" no chão, removido ao pular nele |
| Arquivo no mapa | Add Media → File: some depois de um tempo **[confirmado]** (Z-EMBED) | |
| Livro de visitas | App Guest Book: posts coloridos; admin fixa ou apaga e deixa aviso de 80 caracteres **[confirmado]** (Z-APP-GB) | |
| Notas | "Quick Note" citada no Escape Room. O app oficial "Note" saiu em jul/2026 **[confirmado]** (Z-MG-ESC, Z-N-SIDEBAR) | |
| Threads | Não encontrado | — |

### 2.6 Presença e status

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Lista de usuários | Movida para o canto superior direito (jun/2025) **[confirmado]** (Z-U250613) | |
| Título sobre o apelido | Texto amarelo (afiliação, cargo ou grupo) de até 30 caracteres; o host pode exigir na entrada (Basic) **[confirmado]** (Z-HOSTSPACE, Z-U24626) | Útil para mostrar departamento |
| Apelido | Até 14 caracteres; filtro de palavras proibidas **[confirmado]** (Z-PROFILE) | |
| Notificações | Central de notificações e alertas do navegador por tipo: anúncios, DMs, presentes (ZEM) e cutucadas. Só no PC **[confirmado]** (Z-NOTIF) | O guia ensina a desligar o Foco do macOS e o Não Perturbe do Windows |
| Poke / "ring" | Poke com Z. O "ring" no perfil foi **removido** porque era usado para importunar outras pessoas sem identificação **[confirmado]** (Z-U24626) | Lição de abuso em features de chamar a atenção |
| Esconder avatar e apelidos | Admin pode andar invisível e ocultar apelidos **[confirmado]** (Z-ADMIN) | |
| App Study | Timer e cronômetro de estudo, estatísticas, **tempo de estudo sobre a cabeça** (`!zep_study_show_time`), ranking **[confirmado]** (Z-APP-STUDY) | Presença "focado" vinda da cultura de estudo coreana |
| Presença e chamada | App Attendance Check: check-in, pontos, fuso (14 opções), só dias úteis, export **[confirmado]** (Z-APP-ATT) | |
| Status ocupado/ausente/foco | Não encontrado | — |
| "Bater na porta" | Não encontrado | — |
| Mesa própria | Não encontrado | — |
| Horários | App Schedule: eventos (com repetição diária) que notificam e podem abrir um link ou imagem para todos na hora marcada **[confirmado]** (Z-APP-SCHED) | |

### 2.7 Avatares e customização

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Customização pixel art | Cabelo, roupa, rosto, trajes globais, tailandeses, temáticos (Halloween, frutas), efeitos e **pets** **[confirmado]** (Z-U250218, Z-U260206, Z-U260728, Z-U261110) | Lançamentos frequentes de itens |
| Itens de "Motion" | Ex.: cadeira que aparece quando o avatar senta (out/2026) **[confirmado]** (Z-U261008) | |
| Copiar roupa | "Copy outfit" no perfil de outro usuário **[confirmado]** (Z-PROFILE) | Viralidade social |
| ZEM | Moeda paga para itens e assets; presentes entre usuários (sem taxa), ligáveis por Space **[confirmado]** (Z-HOSTSPACE, Z-U260728) | |
| NFT e carteira | Aba de ativos digitais, emblemas NFT sobre a cabeça, carteira **ZETA** **[confirmado]** (Z-PROFILE, B1) | Herança da era Web3 |
| Sprite via script | Scripts trocam o sprite do avatar (ex.: virar zumbi) **[confirmado]** (Z-S-API, Z-S-FAQ) | |

### 2.8 Editor de mapa, builder, objetos interativos, embeds e scripts

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Permissão de edição | Editor ou acima. Matriz Owner/Admin/Staff/Editor/Member **[confirmado]** (Z-EDITOR) | |
| Ferramentas | Seleção, Carimbo, Borracha, Mão, Conta-gotas, Copiar, redimensionar mapa; camadas com bring forward/back **[confirmado]** (Z-TOOLS, Z-SHORT) | Atalhos 1–5 por camada, V/Q/W/E/R por ferramenta, Shift+arrastar apaga em área |
| Pisos e paredes | Tiles; paredes bloqueiam **[confirmado]** (Z-TOOLS) | |
| Objetos / Top Objects / texto | Objeto (abaixo do avatar), Top Object (acima), texto colorido; tamanho em % e posição X/Y finos **[confirmado]** (Z-OBJ) | Gear icon para abrir as configurações; confunde quando o objeto é "top" |
| My Objects | Upload de jpg/png/webp/gif até 3 MB e 1024×1024 px; objeto transparente **[confirmado]** (Z-OBJ, Z-PERF) | |
| Efeitos de tile | Spawn, Portal, Map Location, Impassable, Private Area, Spotlight, mídia (YouTube, site, BGM), Galeria; **1 efeito por tile** **[confirmado]** (Z-TILE) | A arquitetura do mapa vira regra de comunicação |
| Ações de objeto (display) | Mostrar nome, trocar ou sumir objeto (global ou **pessoal**), balão de fala, Stamp/Stamp Checker, animação por sprite sheet (sai em nov/2026) **[confirmado]** (Z-OBJDISP, Z-N-OBJ) | "Pessoal" = só quem interagiu vê a mudança |
| Pop-ups | Texto, imagem, **senha** (abre porta, troca objeto) e múltipla escolha **[confirmado]** (Z-OBJPOP) | Base para escape rooms sem código |
| Web | Abrir site em nova aba ou em pop-up (iframe); muitos sites bloqueiam iframe **[confirmado]** (Z-OBJAI) | |
| Dev | API Call POST (sai em nov/2026), portas NFT, FT (ERC20), ZEM e Token (ZEM Door saiu em jul/2026), "Interact with ZEP Script" **[confirmado]** (Z-OBJDEV, Z-N-*) | |
| AI NPC | Objeto com nome, descrição, saudação e "criatividade" (temperature). Lançado em set/2023, **descontinuado em 04/11/2026** **[confirmado]** (Z-OBJAI, busca Z-U230914, Z-N-OBJ) | |
| NPC com diálogo | Balões de fala em sequência ao interagir (ago/2026) **[confirmado]** (Z-U260814) | Substituiu parte do caso de uso do AI NPC |
| Objeto Apresentação | PDF com setas e tela cheia, direto no mapa (ago/2026) **[confirmado]** (Z-U260814) | |
| Add Media (no modo Play) | Imagem (some em 24 h), YouTube (busca por palavra-chave), Whiteboard, Portal temporário, Arquivo, Screenshot. Remove-se **pulando no bloco** **[confirmado]** (Z-EMBED) | Embeds efêmeros: bom para não poluir, ruim para conteúdo permanente |
| Salvar | "Save" ou "Save and Play"; o segundo **recarrega todos os usuários** do mapa **[confirmado]** (Z-EDITOR) | Edição ao vivo é disruptiva |
| Mapas múltiplos | Criar, copiar (no mesmo Space), reordenar, apagar **[confirmado]** (Z-EDITOR, Z-U241114) | |
| Copiar Space | Gera "_Copy"; desde jun/2025 também copia os apps de sidebar oficiais e da loja **[confirmado]** (Z-HOSTSPACE, Z-U250613) | |
| Templates | Escritório virtual, salas de aula, quiz run/room, OX castle, esportes, escape room etc. **[confirmado]** (Z-TPL, Z-SIGN) | |
| **Asset Store** | Mapas, objetos, apps e mini-games. Revisão de 3 a 5 dias úteis; **split 70/30**; saque a partir de 100.000 KRW; assets aprovados **não podem ser editados** (nova versão = novo asset "V2") **[confirmado]** (Z-ASSET, Z-APPUP, Z-MAPUP) | Mapa publicado fica bloqueado para edição e para exclusão do Space |
| Parceiros | "Certified Partners" constroem Spaces sob encomenda **[confirmado]** (B1) | |
| Map Editor V2 | Beta em nov/2026 **[confirmado]** (Z-U261110) | Detalhes não encontrados |
| **ZEP Script** | Ver a seção 2.8.1 | |

#### 2.8.1 ZEP Script: como funciona o sistema de apps e mini-games

**Quem pode criar:** "Anyone can create an app". Desenvolver e publicar é **grátis** **[confirmado]** (Z-S-DEV, Z-S-FAQ).

**Linguagem e ferramentas:**
- JavaScript (ES6). TypeScript via SDK `zep-script` (`npx zep-script init`), que transpila com Babel porque algumas APIs conflitam com namespaces do TS **[confirmado]** (Z-S-DEV; busca npm `zep-script`, repositório `zep-us/zep-script-sdk`).
- UI em **HTML** (widgets). Imagens dentro de widgets precisam ser base64 **[confirmado]** (Z-S-SIDEBAR).

**Empacotamento e deploy:**
1. Um `.zip` com `main.js` na raiz, mais imagens e HTMLs (sem pasta).
2. Upload em `zep.us/me/apps` ("My apps (Beta)") com nome, descrição, tipo e ícone.
3. Instalação conforme o tipo **[confirmado]** (Z-S-DEPLOY).

**Três tipos de app** **[confirmado]** (Z-S-DEV, Z-S-DEPLOY):

| Tipo | Escopo | Quem instala | Como roda |
|---|---|---|---|
| **Mini-Game** | Qualquer mapa | Quem tem permissão de embed; pode-se bloquear para convidados | Botão "Mini-Game" na sidebar → **roda na hora**, como um bloco no lugar do avatar; quem abriu encerra **pulando nele (Espaço)** |
| **Normal App** | Um mapa específico | Admin+ / Editor+ no Map Editor → Map Settings → Application | Sempre ativo naquele mapa (ex.: quiz rooms) |
| **Sidebar App** | Space inteiro | Owner/host em Sidebar → Apps → "+" | Ícone na sidebar para todos; máximo de 10 apps instalados, 1 app oficial nos planos Free/Basic |

**Modelo de execução:**
- Os scripts rodam **no servidor da sala**, de forma autoritativa [inferido forte]:
  - A nota de deploy sem downtime diz que "o script app do servidor antigo termina e reinicia no novo servidor". Variáveis em memória e timers zeram, e os mini-games em andamento podem ser interrompidos. O app deve salvar estado em `onMigrationStart` e checar `player.isMigrationJoin` **[confirmado]** (Z-N-MIGR).
  - `onUpdate` roda a cada ~20 ms **[confirmado]** (Z-S-API).
  - Os erros aparecem em vermelho no chat para Staff+ **[confirmado]** (Z-S-DEPLOY).
  - Há `httpGet`/`httpPost` sem CORS de navegador [inferido].
- **Um mini-game por vez:** `onDestroy` dispara "quando outro app é lançado ou o Game Block instalado é destruído" **[confirmado]** (Z-S-API), o que indica um único mini-game ativo por mapa [inferido].

**API** (4 classes) **[confirmado]** (Z-S-API):

- **ScriptApp:**
  - *Ciclo de vida:* `onInit`, `onJoinPlayer`, `onStart`, `onUpdate`, `onLeavePlayer`, `onDestroy`.
  - *Campos:* players, playerCount, cameraEffect (SPOTLIGHT/vinheta), displayRatio, followPlayer, showName, storage.
  - *Eventos:* `onSay` (chat), `onPlayerTouched`, `onObjectTouched`, `onAppObjectTouched`, `onUnitAttacked`/`onObjectAttacked` (tecla Z), `onTriggerObject` (tecla F), `onSidebarTouched`.
  - *Callbacks:* `runLater`, `addOnTileTouched`, `addOnLocationTouched` (áreas nomeadas no editor), `addOnKeyDown`, `setTimeout`/`setInterval`, `addMobileButton`, `putMobilePunch`.
  - *Métodos:* `loadSpritesheet`, `showCenterLabel`/`showCustomLabel` (com `<span>` estilizado), `sayToAll`, `showWidget`, `showYoutubeWidget`, **`showBuyAlert`** (compra em ZEM com callback), `spawnPlayer`, `kickPlayer`, `forceDestroy`, `clearChat`, `playSound`/`playSoundLink`, `changeAttackSound`, `httpGet`/`httpPost`/`httpPostJson`, `sendUpdated`, `save`, `setStorage`/`getStorage`.
- **ScriptMap:**
  - *Campos:* width, height.
  - *Métodos:* `putTileEffect` (cria portal ou private area por código), `putObject`, `putObjectMultiple`, `putObjectWithKey`, `moveObject`/`moveObjectWithKey` (com path), `playObjectAnimation`, `clearAllObjects`, `getTile`, `hasLocation`, `getObjectsByType`, `sayObjectWithKey`.
- **ScriptPlayer:**
  - *Campos:* id, name, title/titleColor, role (Guest −1 … Owner 3001), tileX/tileY, dir, moveSpeed, sprite, tag, hidden, spotlight, **disableVideo/disableAudio**, attackType/attackSprite, walletAddress, storage, isMobile, isMoving, isJumping, **customData (query string da URL)**, emailHash, isGuest.
  - *Métodos:* `showPrompt`/`showConfirm`/`showAlert`, `showWidget`/`showWidgetResponsive`, `showEmbed`, `openWebLink`, `isEmail`, `getLocationName`, `spawnAt`/`spawnAtLocation`/`spawnAtMap`, `playSound`, `sendMessage`.
- **ScriptWidget:** `onMessage` (widget → app), `sendMessage` (app → widget), `destroy`.

**Storage:** string (normalmente JSON) por app/Space e por jogador. `getStorage` assíncrono sincroniza entre mapas; gravar com `App.storage = ...; save()` causa sobrescrita entre mapas **[confirmado]** (Z-S-STORAGE).

**Integração externa:** chamadas HTTP do script (ex.: gerar apelidos por API), objeto "Interact with ZEP Script" com número e valor configurados no editor, e parâmetros por query string **[confirmado]** (Z-S-EXTAPI, Z-S-OBJ).

**Distribuição e monetização:**
- A FAQ (2022) dizia que não dava para vender apps "ainda". Hoje a sidebar mostra "**games purchased from the Asset Store**", e a loja tem split 70/30 **[confirmado]** (Z-S-FAQ, Z-SIDEBAR, Z-ASSET).
- **Regras de submissão:** testar em PC e mobile; resetar personagens, objetos e variáveis no fim do jogo; widgets durante jogos multiplayer causam lag; mostrar texto padrão para quem entra no meio do jogo **[confirmado]** (Z-APPUP).

**Limitações reconhecidas:**
- Sem ambiente de debug local ("estamos preparando").
- Só JavaScript.
- Apps já publicados na loja não podem ser editados nem apagados **[confirmado]** (Z-S-FAQ, Z-APPUP).
- Grandes atualizações de UI quebram posições de widgets e cores de apps de terceiros; a Major Update de 2024 trouxe uma seção específica "para criadores" **[confirmado]** (Z-U2464).

**Exemplos oficiais:**
- *Código:* Timer, Escape Timer, Zombie, Paintman, Quiz de iniciais (Hangul), Avoid Poop, Boxing, Race, Sidebar App, listas (imagem, texto, botões, ranking, seleção), Custom Labels A–J **[confirmado]** (Z-S-*, docs-kr).
- *Casos:* Rabbit Mountain, Bonbon School Detectives, Boxing Arena, Klaytn Museum, UNICEF, Samsung "Jet Land", Omok feito por usuários e Paintman para mais de 100 pessoas em feira de emprego **[confirmado]** (Z-S-HELLO, Z-S-USE).

### 2.9 Jogos e social

**Como os mini-games oficiais funcionam (padrão comum):**
- Qualquer pessoa num Space novo pode abrir; o host pode restringir a Staff+ **[confirmado]** (Z-MG).
- Sidebar → Mini-Games → escolhe o jogo → **aparece uma caixa onde você está** → o jogo começa → termina pela condição de vitória ou quando alguém **pula na caixa** **[confirmado]** (Z-MG).
- Os vencedores podem ganhar **Space Points**, que valem só naquele Space e podem ser usados no app Prize Event **[confirmado]** (Z-MG-OX, Z-APP-PRIZE, Z-APP-PTS).
- Os quizzes aceitam **arquivo com até 100 perguntas**, até 10 vencedores, tempo de até 100 s e **download dos vencedores** **[confirmado]** (Z-MG-OX, Z-MG-QS, Z-MG-MCQ).
- Os jogos usam **Map Locations nomeadas** (ex.: `quiz_seat_1..50`, `quiz_mc`, `quiz_fail`, `quiz_survival`) para teleportar jogadores **[confirmado]** (Z-MG-QS).

| Jogo | Regras | Escala recomendada (máx.) | Fonte |
|---|---|---|---|
| **Avoid Poop** | Cocôs caem cada vez mais rápido; quem é atingido vira lápide; ganha o último vivo | 200 (250); mapa de 50×50 | Z-MG-POOP |
| **Bombers** | "Batata quente": um jogador aleatório vira o Bomber e passa a bomba tocando em outro antes de explodir; zona da morte encolhe | 2–500; ideal 50 | Z-MG-BOMB |
| **Boxing Match** | Socos com Z; blocos de HP sobre o avatar; zona encolhe; modo em times com MVP | 150 (200) | Z-MG-BOX |
| **Zombie Game** | Zumbis aleatórios infectam por contato; ganham o último sobrevivente e o zumbi que mais infectou | 200 (250) | Z-MG-ZOMB |
| **Paintman** | Dois times (vermelho/azul) pintam o piso andando; vence quem tiver mais tiles | 200 (250); 50×50 | Z-MG-PAINT |
| **Race** | Todos vão para a largada; o 1º a chegar dispara uma contagem regressiva; precisa de área designada ou template | 100 (150) | Z-MG-RACE |
| **OX Quiz** | Todos vão para a arena O/X; 20 s por pergunta; quem erra sai | 350 (500) | Z-MG-OX |
| **Quiz Show (Golden Bell)** | O host digita a pergunta; 15 s; o chat dos outros fica oculto; quem erra vira fantasma | 150 (200) | Z-MG-QS |
| **Multiple-Choice Quiz** | Os jogadores andam até a área da resposta; eliminados saem | 350 | Z-MG-MCQ |
| **Rock-Paper-Scissors** | Contra o host: ele escolhe primeiro e os jogadores andam até o painel em 20 s; vitória 10 pts, empate 5; 10 rodadas; a partir da rodada 5 as escolhas ficam ocultas nos últimos 5 s | 350 (500) | Z-MG-RPS |
| **Escape Room "Bonbon School Detectives"** | Espaço-jogo oficial: investigar objetos (F), senhas, zonas de dica compráveis, carimbos de ursinho que servem de checkpoint | — | Z-MG-ESC |
| **Templates Quiz Run / Quiz Room** | Corrida com OX (acerto dá +velocidade por 2 s), salas de quiz de 4 opções ou OX, estatísticas por pergunta | — | Z-TPL |

**Apps sociais e utilitários oficiais:**

| App | O que faz | Fonte |
|---|---|---|
| Group Photo | Arranja todos em formas (linha, retângulo, triângulo, coração, árvore), trava o movimento por 5 s e tira foto | Z-APP-PHOTO |
| Random Picker | Sorteio com número por pessoa e contagem de 10 s; DM ao vencedor (mínimo de 3 pessoas) | Z-APP-RAND |
| Poll | Enquete em widget | Z-APP-POLL |
| Live Q&A | Perguntas anônimas, curtidas, "respondida". Free: 50 perguntas | Z-APP-QA |
| Prize Event | Prêmios trocados por pontos | Z-APP-PRIZE |
| Stamp / Daily Stamp | Caça ao tesouro com objetos-carimbo e verificador; carimbos diários aleatórios (até 30) | Z-APP-STAMP, Z-APP-DSTAMP |
| ChatGPT Cat | Gato NPC posicionável que responde no chat (opcional, só com "@") | Z-APP-CAT |
| Guest Book, Study, Attendance, Schedule, My Points, Spectator Camera, Admin | Ver as seções 2.5, 2.6, 2.1 e 2.13 | — |
| **Descontinuados em 22/07/2026** | Ride, Special Effects, Poke, Poke(All), External Notification, Title, Game Prediction, Note, Quick Move, Office Schedule, além da ZEM Door | Z-N-SIDEBAR |

### 2.10 Reuniões

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Sala de reunião | Private Area + caixas de vídeo + compartilhamento + whiteboard **[confirmado]** (Z-TILE, Z-EMBED) | Não há "modo reunião" distinto |
| Palestra | Spotlight + compartilhamento + "ver vídeo de todos" (Pro) + modo "só spotlight" **[confirmado]** (Z-HOSTCHK, Z-HOSTMAP) | |
| Agendamento | Só o app interno **Schedule** (notificação e link na hora) **[confirmado]** (Z-APP-SCHED). Integração com Google/Outlook Calendar: não encontrado (aparece como "desejo" na pesquisa de cancelamento, B1) | |
| Gravação | Enterprise, no servidor, só do usuário em spotlight **[confirmado]** (Z-REC) | |
| Transcrição / resumo por IA | Não encontrado | — |
| Q&A e enquetes | Apps Live Q&A e Poll **[confirmado]** | |
| Apresentação de PDF | Objeto Apresentação **[confirmado]** (Z-U260814) | |

### 2.11 IA

| Feature | Como funciona | Status |
|---|---|---|
| AI Chat no Space | Aba para conversar com a "ZEP AI" (perguntas, brainstorm, estudo). Pro, ligada em Settings → Labs | [confirmado] (Z-U250710, Z-HOSTSPACE) |
| AI NPC (objeto) | NPC estilo ChatGPT com persona, saudação e temperature. **Descontinuado em 04/11/2026** | [confirmado] (Z-OBJAI, Z-N-OBJ) |
| ChatGPT Cat | App de NPC gato que responde no chat | [confirmado] (Z-APP-CAT) |
| ZEP QUIZ AI | Gera perguntas e adapta o quiz ao nível do aluno | [confirmado] (Z-HOME) |
| "AI Spaces" | Strings "You haven't created any AI Spaces yet. Create your first AI Space" no HTML público sugerem a criação de Spaces por IA | [inferido] (B1); funcionalidade não documentada |
| Resumo, transcrição ou tradução de reuniões | — | não encontrado |

### 2.12 Integrações

| Integração | Detalhe | Status |
|---|---|---|
| API pública | "ZEP não oferece API pública"; integrações só via ZEP Script ou objetos do editor | [confirmado] (Z-FUNC) |
| Google Analytics | Measurement ID nas configurações (Pro) | [confirmado] (Z-DATA) |
| YouTube | Embeds (inclusive live), busca e widget por script | [confirmado] (Z-EMBED, Z-S-API) |
| Sites (iframe) | Pop-up ou nova aba; bloqueio de iframe é comum | [confirmado] (Z-OBJAI) |
| Webhooks de saída | API Call POST (sai em nov/2026); `httpPost` em scripts | [confirmado] |
| Login | Google, e-mail com código OTP de 6 dígitos, **Whalespace** (NAVER Whale, para escolas) | [confirmado] (Z-SIGN, B1) |
| Blockchain | Klaytn (casos), NFT/ERC20 doors, carteira ZETA | [confirmado] (Z-OBJDEV, B1) |
| Pagamentos | Cartão, transferência, conta virtual; PG **Payple** | [confirmado] (B1) |
| Slack, Notion, Google Calendar, Teams | **Não existem**. A pesquisa de cancelamento pergunta se "Notion, Slack, Google Calendar etc." fariam o usuário voltar | [confirmado por ausência] (B1 `integrationFeaturesDesc`) |
| SSO (SAML/OIDC) | Só "por negociação" no Enterprise | [confirmado] (B1) |

### 2.13 Admin, segurança e privacidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Papéis | Owner (1), Admin, Staff, Editor, Member, Guest. Matriz: editar mapas, comandos de chat e kick, acesso a todos os canais, configurações do Space, apps de sidebar, apagar o Space **[confirmado]** (Z-EDITOR) | Só contas que já logaram podem receber papel (Z-HOSTSPACE) |
| Acesso | Senha (até 32 caracteres), só logados, só Member+, **allowlist de até 10 domínios**, whitelist por CSV, Space privado fora de busca (Basic) **[confirmado]** (Z-HOSTSPACE) | Link de convite pode embutir a senha (Staff+) (Z-U24626) |
| Convites | Link, **código de entrada** (6+ dígitos) e **QR code** **[confirmado]** (Z-SIDEBAR, B1, Z-U24626) | |
| Kick e ban | Kick bloqueia por 24 h. **Convidado expulso tem o IP colocado na blacklist**, e todos naquele IP ficam bloqueados **[confirmado]** (Z-PROFILE, Z-HOSTSPACE) | Péssimo para escritórios com NAT |
| Report | Denunciar usuário pelo perfil **[confirmado]** (Z-PROFILE) | |
| Comandos | `!help`, `!destroyspace`, `!destroymap`, `!kick`, `!clear`, `!clearembed`, `!muteall`, `!unmuteall`, `!spawn`, `!chatinterval` **[confirmado]** (Z-HOSTCHK) | Moderação "à moda IRC", agora também listada no app Admin |
| Logs e dados | Visitas por até 30 dias (e-mail, apelido na entrada e na saída, horários, duração); **Data Dashboard** (visitantes únicos e totais, por mapa, chats públicos vs. PA, interações com objetos nomeados, plataforma; diário de 90 dias, mensal de 12 meses; D+1) **[confirmado]** (Z-HOSTSPACE, Z-DATA) | DMs não são contadas |
| GDPR | Página afirma conformidade com o GDPR **[confirmado]** (B1). LGPD: não encontrado | |
| SOC 2 / ISO 27001 | Não encontrado | — |
| Servidor dedicado | Enterprise **[confirmado]** (Z-PLAN) | |
| Cookies | Um banner diz "você precisa aceitar **todos** os cookies para usar o ZEP"; outra string oferece "aceitar só os essenciais" (provavelmente variam por região) **[confirmado]** (B1) | A versão "aceite tudo" conflita com boas práticas de consentimento (GDPR/LGPD) |
| Manutenção | Janela regular **toda quarta-feira** (servidor e editor) e dezenas de avisos de manutenção em 2024–2026 **[confirmado]** (índice Z-SUPPORT) | |

### 2.14 Performance e requisitos

| Item | Detalhe | Fonte |
|---|---|---|
| PC recomendado | Windows 11 / macOS 12, 8 GB de RAM, i5 de 3ª geração. Mínimo: Win 8 / macOS 10.15, 5 GB, dual core 2,5 GHz | Z-SPEC |
| Mobile recomendado | iOS 15+ com 6 GB (iPhone 12 Pro+), Android 12+ com 6 GB. Mínimo: iPhone X / Android 8 com 3–4 GB | Z-SPEC |
| Rede | Recomenda **80 Mbps**. Para compartilhar tela, mínimo de 3 Mbps de upload e 10 de download; 60–70 Mbps para muitos simultâneos | Z-SPEC, Z-FUNC |
| FPS | Limite configurável: até 60 FPS no PC e 40 no mobile, por causa de calor e bateria | Z-USER |
| Modo de baixo consumo | Existe, com modal (jul/2025) | Z-U250710 |
| Otimização de mapa | Fundo até 10 MB (4096², 2048² para mobile), frente até 5 MB, objetos de 3 MB, poucos tiles de efeito | Z-PERF |
| Escala do Space | Canais de 500, até 300 canais; lag com muitos spotlights e mapas grandes | Z-HOSTCHK, Z-FUNC, Z-MG |
| Telemetria | O bundle coleta `WEBGL_debug_renderer_info` (GPU) e flags | B1 [confirmado] |

### 2.15 Mobile e acessibilidade

| Feature | Detalhe | Status |
|---|---|---|
| Web mobile | Joystick, botão de interação, chat em meia tela ou tela cheia, sentar, reações, menu hambúrguer, barra inferior com recursos ligados pelo host | [confirmado] (Z-CTRL, Z-U2464) |
| Limitações | Sem compartilhamento de tela, sem configurações de notificação, sem cancelar assinatura ou pagar ("só no PC"); DMs privadas só dentro da Private Area | [confirmado] (Z-FUNC, Z-NOTIF, B1) |
| Botões custom | Scripts adicionam botões mobile e trocam o ícone de interação | [confirmado] (Z-S-API) |
| Tablet | Detecção e rotação (2024) | [confirmado] (Z-U2426) |
| Acessibilidade | Não encontrado (sem declaração, sem leitor de tela documentado; o movimento por setas e o pixel art pequeno dificultam) [inferido] | — |

### 2.16 Onboarding

| Etapa | Detalhe | Fonte |
|---|---|---|
| Entrar sem conta | Convidado entra com apelido aleatório ou digitado; o host pode exigir apelido e título | Z-HOSTSPACE |
| Criar Space | Login (Google ou OTP) → template ou mapa vazio → nome → público ou privado (aplica padrões de busca, embed, mini-game e filtro) → senha opcional | Z-SIGN, Z-U24626 |
| Tutorial | "Show tutorial (PC only)" para quem entra pela 1ª vez | Z-HOSTSPACE |
| Tela de loading | Logo, cor e sprite animado customizáveis (Pro) | Z-CUST |
| Guia na sidebar | Atalho de guia (jul/2025) e suporte via chat (Channel Talk) | Z-U250710, Z-SIDEBAR |
| Pesquisa de saída | Motivos de cancelamento: "difícil configurar mapa", "difícil no mobile", "faltou recurso" (lista de integrações) | B1 |

---

## 3. Stack técnica

| Camada | Tecnologia | Evidência | Status |
|---|---|---|---|
| Front web | **Next.js** (Pages Router), **React**. Duas apps separadas: `web-app` (home, preços) e `play-app` (`/play`, rota `[mapHashId]`) | `_next/static/web-app-.../_buildManifest.js`, `/play/_next/static/play-app-...` (B1) | [confirmado] |
| Hospedagem do front | **Vercel** | Parâmetro `?dpl=dpl_...` nos assets (padrão de deployment da Vercel) | [inferido forte] |
| Fonte | Pretendard via jsDelivr | B1 | [confirmado] |
| Mídia (A/V e tela) | **LiveKit Cloud** (SFU gerenciado) | Firewall: `*.livekit.cloud`, `*.turn.livekit.cloud`, UDP 50000–60000/3478, TCP 7881 (Z-FW); strings do livekit-client no bundle (B1) | [confirmado] |
| Backend do jogo | Servidores `*.zep.us` com auto scaling ("TTL < 5 min"), canais de 500, deploy sem downtime com migração de sessão | Z-FW, Z-HOSTCHK, Z-N-MIGR | [confirmado] |
| CMS / arquivos | `*.weegloo.com` (o bundle rotula erros desse domínio como "cms") | Z-FW; B1 | [confirmado] |
| Engine de render | **Não confirmado.** 2D com tiles de 32 px, sprite sheets, limite de 60 FPS e checagem de WebGL. O cliente do jogo não está nos chunks Next baixáveis | B1, Z-USER | Canvas/WebGL próprio [inferido] |
| Scripts | Sandbox JS no servidor de sala; SDK TS (`zep-script-sdk`, Babel); widgets HTML com troca de mensagens | Z-S-*, Z-N-MIGR | [confirmado] / execução no servidor [inferido forte] |
| Feature flags | Serviço próprio `flag.zep.us`, provider React com avaliação em **WebAssembly** | B1 (`FeatureFlagProvider.tsx`, `wasm-unsupported`) | [confirmado] |
| Observabilidade | **Sentry**, **PostHog**, Google Tag Manager/GA | B1 | [confirmado] |
| CDN de imagens | `cdn-static.zep.us` | B1 | [confirmado] |
| Pagamentos | Payple (PG coreano), cartão e conta virtual | B1 | [confirmado] |
| Suporte e docs | Channel Talk (`docs.channel.io/zep-guide`, `zep-support`), GitBook (`docs.zep.us`) | Fontes | [confirmado] |
| Vagas com stack | Não encontradas (só uma vaga de PM sem stack) | Busca | não encontrado |

---

## 4. Padrões de UX e design que valem estudar

1. **"Caixa de jogo" como objeto de controle.** O mini-game nasce como um objeto físico no lugar de quem o abriu, e **pular nele encerra**. Não há menu de "parar jogo": o controle está no mundo.
2. **Arquitetura = regra de comunicação.** Efeitos de tile (Private Area com **ID compartilhável** entre áreas separadas, Spotlight, Portal, Map Location) fazem o editor de mapa ser também o editor de "quem fala com quem".
3. **Três estados de proximidade discretos** (cheio / translúcido / nada). É fácil de explicar e de prever.
4. **Spotlight unificado:** um mesmo conceito serve para palco, megafone, professor, gravação e chat destacado (menta).
5. **Chat com abas pública e privada ligadas à Private Area** e balões coloridos por papel (spotlight em menta, você em lilás).
6. **Título sobre o apelido** (departamento, cargo, turma), com opção de exigir na entrada.
7. **Moderação com comandos de texto** (`!muteall`, `!spawn`, `!chatinterval`), depois espelhados num app Admin com UI. É bom ter os dois caminhos.
8. **Seguir através de portais**, com espera automática se a pessoa sair do Space.
9. **PIP automático ao trocar de aba**, com controles de mic e câmera no PIP.
10. **Alerta sonoro de desconexão:** pequeno, mas resolve o caso de "fiquei mudo sem saber".
11. **Objetos "pessoais" vs. globais** (trocar ou sumir só para quem interagiu). Permite puzzles e onboarding individual no mesmo mapa compartilhado.
12. **Economia de pontos por Space** (quiz → pontos → prêmios) e **carimbos** de caça ao tesouro: gamificação sem dinheiro real.
13. **Group Photo:** um utilitário trivial que gera um momento social memorável (formas de coração ou árvore e foto limpa).
14. **Separar "Save" de "Save and Play"** deixa explícito quando a edição vai afetar quem está online, embora o efeito seja recarregar todo mundo.
15. **Grade de vídeo configurável** (2 a 7 por linha) e **zoom de 300% no compartilhamento de tela**.

---

## 5. Críticas e pontos fracos

### 5.1 Reclamações reais e sinais públicos

| Sinal | Fonte |
|---|---|
| Descontinuação dos apps nativos (iOS/Android/Mac) em mai/2025; instalações existentes deixaram de funcionar | Z-N-APP |
| Descontinuação de recursos "para estabilidade": modo só áudio, 10 apps oficiais, ZEM Door, AI NPC, API Call e Animação | Z-N-AUDIO, Z-N-SIDEBAR, Z-N-OBJ |
| Recursos movidos para planos pagos (jul/2026) e Free com 1 spotlight e 1 compartilhamento por mapa; o número de usuários gratuitos caiu de 20 para 10 | Z-PLAN26, Z-PLAN, busca Z-PRICE-FAQ-KR |
| Recurso "ring" removido porque era usado para importunar outros usuários anonimamente | Z-U24626 |
| Volume que voltava ao padrão, caixas de vídeo duplicadas ou que não apareciam, login Google intermitente (bugs corrigidos em 2024) | Z-U2426 |
| Áudio chiando ("feche outras abas do ZEP"), tela preta ao compartilhar (desligar a aceleração de hardware), Bluetooth não garantido | Z-FUNC, Z-RTC, Z-AVG |
| Histórico de chat **não migrado** na grande atualização de 2024 | Z-U2464 |
| Motivos de cancelamento previstos pela própria empresa: "difícil configurar mapas", "difícil criar e editar mapas", "difícil no mobile", "serviço complicado", "falta o recurso que quero" | B1 (formulário de cancelamento) |
| Estudo acadêmico com ZEP em aulas cita o incômodo de ter de mover o avatar o tempo todo (trecho visto em busca; o PDF não abriu) | busca (KoreaScience, 2023) |
| Reviews em G2 e Capterra: as páginas bloquearam acesso automatizado (403). Reclamações detalhadas em inglês: não encontrado | — |

### 5.2 Minha análise crítica (o que falta)

1. **Vídeo desacoplado do espaço.** As caixas ficam num painel, então o mundo vira só um "seletor de chamada". Perde-se o efeito de "ver a roda de conversa".
2. **Zero camada de trabalho:** sem status (ocupado, foco, ausente), sem mesa própria, sem "bater na porta", sem calendário, sem Slack/Teams. Para escritório diário, é fraco.
3. **Estética infantil e de jogo:** ótima para escola e eventos, mas pode afastar adultos em contexto corporativo. Não há 3D nem modo "planta limpa".
4. **Plataforma instável no tempo.** Recursos e apps aparecem e somem, e criadores de terceiros sofrem com quebras de UI e com migrações de servidor que reiniciam scripts.
5. **DX de scripts primitiva:**
   - Sem simulador ou debug local; erros vão para o chat.
   - Storage como string única.
   - Concorrência entre mapas resolvida por um `getStorage` assíncrono.
   - Apps publicados ficam imutáveis.
6. **Moderação frágil para empresas.** Ban de convidado por IP derruba o escritório inteiro atrás do NAT. A aba "privada" é legível de fora.
7. **Privacidade da gravação:** o indicador REC é invisível para participantes comuns.
8. **Dependência de monetização** (banner Free, gating agressivo, ZEM, NFT): o foco vai para a receita, não para a experiência.
9. **Sem acessibilidade documentada** e mobile sem paridade.
10. **"Save and Play" recarrega todo mundo**: editar o escritório em horário comercial é disruptivo.

---

## 6. Para a Infinity

> Contexto: escritório virtual **interno**, com **2D e 3D no mesmo mundo**. Não há guests pagantes nem marketplace. O foco é adoção diária, rituais de time e custo de operação.

### 6.1 O que copiar

1. **O modelo de apps em 3 escopos:**
   - **efêmero** (Mini-Game: nasce no lugar de quem abriu e acaba ao "pular");
   - **por sala/mapa** (Normal App);
   - **global** (Sidebar App).
2. **O ciclo de vida do script** (`onInit / onJoinPlayer / onStart / onUpdate / onLeavePlayer / onDestroy`), com eventos de colisão, zona, tecla e chat, e **widgets HTML com troca de mensagens**. É simples o bastante para devs internos.
3. **Hooks de migração** (`onMigrationStart`, `isMigrationJoin`) desde o dia 1, para permitir deploy sem derrubar jogos e rituais.
4. **Zonas semânticas no editor** (Private Area com ID, Spotlight, Portal, Map Location, Spawn). Na Infinity, a mesma camada de zonas vale para o 2D e o 3D.
5. **Mini-games de massa** que funcionam com 50 a 500 pessoas (OX Quiz, Bombers, Paintman, Zombie) para all-hands e festas, com **quiz por arquivo** e **export de vencedores**.
6. **Seguir através de portais**, summon com delay de 5 s, menu "Move" com destinos do host e câmera espectador.
7. **Título sobre o nome** (time, squad), PIP automático ao trocar de aba e alerta sonoro de desconexão.
8. **Group Photo, Random Picker, Live Q&A anônimo, Stamp** (caça ao tesouro para onboarding).

### 6.2 O que melhorar

1. **Vídeo dentro do mundo:** bolhas sobre o avatar no 3D e "tokens" no 2D, com o painel de grade como opção, não como padrão.
2. **DX de verdade:**
   - CLI com **simulador local** (vários jogadores fake) e hot reload.
   - Logs estruturados.
   - Storage tipado chave/valor com transações.
   - Versionamento de apps.
   - Revisão por **pull request** num repositório interno, em vez de revisão opaca.
3. **API agnóstica de dimensão:** scripts falam em **posições de mundo e zonas**, não em tiles. O mesmo app roda no modo 2D e no 3D.
4. **Moderação por identidade (SSO)**, nunca por IP. Abas privadas realmente privadas.
5. **Edição ao vivo sem recarregar todos** (diffs incrementais do mapa) e **staging de layout**.
6. **Gravação com consentimento visível para todos** (LGPD), retenção definida e transcrição opcional.
7. **Presença de trabalho:** status, foco ligado ao calendário (Google/Microsoft), mesa própria e "bater na porta". É o que falta ao ZEP para uso diário.

### 6.3 O que evitar

1. **Churn de recursos** (lançar AI NPC e depois matar). Melhor poucos blocos estáveis e uma plataforma de apps para o resto.
2. **Moeda virtual, NFT ou carteira:** não fazem sentido internamente e trazem risco jurídico.
3. **Moderação "IRC" como única UI** (`!destroyspace` para aplicar um filtro).
4. **Embeds que somem sozinhos** (imagem em 24 h, portal em 10 s) sem deixar claro para o usuário.
5. **Apps imutáveis depois de publicados.**
6. **Exigir aceite de todos os cookies** e indicadores de gravação invisíveis.
7. **Proximidade só por tiles** sem atenuação contínua: no 3D, a transição em degraus fica artificial.

### 6.4 Ideias inovadoras inspiradas pelo ZEP

1. **"Infinity Apps", um SDK de mundo dual (2D/3D).** Um único `main.ts` declara zonas, objetos e regras. O runtime renderiza sprites no 2D e modelos no 3D a partir do mesmo estado autoritativo. Inclui um "simulador de sala" no CLI para testar com 30 bots antes de publicar no catálogo interno.
2. **Blocos de ritual.** Pela paleta de comandos, qualquer pessoa "solta" no chão um bloco de **Daily**, **Retro**, **Quiz de sexta** ou **Kudos**. Ele nasce onde ela está, convida quem está por perto e termina quando o dono pula nele, publicando um resumo (com IA) no canal do time.
3. **Quiz da empresa gerado por IA** a partir da wiki, dos changelogs e do onboarding interno, no formato OX/Golden Bell para 200+ pessoas. Os vencedores ganham "pontos Infinity" trocáveis por benefícios do RH, sem dinheiro.
4. **Onboarding como "escape room" do escritório:** carimbos espalhados pelos andares (TI, RH, Financeiro), com objetos "pessoais" que mudam só para o novato e um checker que libera acesso a salas de times.
5. **Zonas com regras programáveis:** uma zona de "Foco" que liga o "Não perturbe" sozinha e uma "Sala de reunião" ligada ao recurso de sala do Google/Microsoft Calendar. A Private Area por ID permite unir duas salas físicas (por exemplo, SP e Recife) num mesmo canal de áudio.

---

## 7. Fontes

**Site oficial e preços**
- Z-HOME: https://zep.us/en (home, acessada em 15/11/2026)
- Z-PRICE: https://zep.us/pricing e https://zep.us/en/pricing (strings de planos no HTML público)
- Z-PRICE-FAQ-KR: https://docs.channel.io/zep-support/ko/articles/요금-및-결제-4eab7a23 e https://docs.channel.io/zep-support/ko/articles/ZEP-서비스-과금-구조-및-결제-방식-개편-안내-ccd9d8a2 (via busca)
- Também consultadas: https://zep.us/home/landing e https://zep.us/play (HTML e chunks públicos)

**Guia oficial (docs.channel.io/zep-guide/en/articles/...)**
- Z-PLAN: Premium-Plan-Overview-4c9fbbad
- Z-CTRL: How-to-Control Move-Interact-Chatting-Reaction-cd74f1f4
- Z-RTC: RTCVideoAudioScreen-share-e20ebe35
- Z-AVG: VideoAudio-guide-5b855392
- Z-SIDEBAR: Sidebar-Guide-0d98fbcf
- Z-HOSTSPACE: Host-SettingsSpace-7a62e639
- Z-HOSTMAP: Map-SettingsHost-90a5c7da
- Z-ADMIN: Administrator-ZEP-Admin-Features-b9dc675b
- Z-USER: User-Settings-2ffc23c7
- Z-PROFILE: My-Profile-3a91be25
- Z-REC: Screen-Recording-Feature-23621e5a
- Z-NOTIF: Receive-New-Notifications-Instantly-32936cce
- Z-MENTION: Chat-Mentions-21a1027e
- Z-FW: Firewall-and-Network-Settings-940a4519
- Z-SPEC: Recommended-and-Minimum-Specifications-07090649
- Z-TILE: Tile-Effect-Guide-0e64e720
- Z-TOOLS: Use-Tools-6474aa88
- Z-EDITOR: Basic-Guide-for-Editor-c9e20c51
- Z-SHORT: Editor-Shortcut-Guide-3da216be
- Z-OBJ: Object-Basic-Guide-e33f3520
- Z-OBJAI: Object-Settings-AI-NPC--Website-Functions-f3555af1
- Z-OBJDEV: Object-Settings-Developer-Funtions-1b901741
- Z-OBJDISP: Object-Settings-Display-Functions-2c461d2c
- Z-OBJPOP: Object-Settings-Pop-up-Settings-4db7d976
- Z-EMBED: Add-Mediaembed-e8b65b5f
- Z-PERF: Map-Performance-Optimization-Guide-7229acdb
- Z-SIGN: Sign-inCreating-a-Space-41112acb
- Z-HOSTCHK: Host-Checklist-6f15f045
- Z-DATA: Space-Data-Verification-Guide-8a640c15
- Z-CUST: Space-Customization-Guide-504f91a6
- Z-MAPUP: Map-Upload-Guide-eebda161
- Z-APP: Common-App-Guide-4a7827f3
- Z-APPUP: App-Upload-Guide-221fac5c
- Z-TPL: ZEP-Official-Template-16926c92
- Z-MG: Common-Mini-Game-Guide-1dbebcaf
- Mini-games: Z-MG-POOP Avoid-Poop-02a1d302; Z-MG-BOMB Bombers-a005e957; Z-MG-BOX Boxing-Match-de1670be; Z-MG-ZOMB Zombie-Game-40e57f0b; Z-MG-PAINT Paintman-124b90dd; Z-MG-RACE Race-8cfecf9a; Z-MG-OX OX-Quiz-b71e001e; Z-MG-QS Quiz-Show-0dcca785; Z-MG-MCQ Multiple-Choice-Quiz-0b50f8da; Z-MG-RPS Rock-Paper-Scissors-f03cf86c; Z-MG-ESC Escape-Room-257907dd
- Apps: Z-APP-ATT Attendance-Check-58862248; Z-APP-CAT ChatGPT-Cat-48fb8bd1; Z-APP-DSTAMP Daily-Stamp-68cf7109; Z-APP-PHOTO Group-Photo-3a59a62c; Z-APP-GB Guest-Book-5f92c53e; Z-APP-QA Live-QA-bed73d87; Z-APP-POLL Poll-efd81dbb; Z-APP-PRIZE Prize-Event-App-07dae283; Z-APP-RAND Random-Picker-03088ed9; Z-APP-SCHED Schedule-1a343047; Z-APP-SPEC Spectator-Camera-0f971556; Z-APP-STAMP Stamp-cf6f9875; Z-APP-STUDY Study-c6958225; Z-APP-PTS My-Points-a9d2641d

**Central de suporte, notas de atualização e avisos (docs.channel.io/zep-support/en/articles/...)**
- Z-SUPPORT (índice): https://docs.channel.io/zep-support/en
- Z-ASSET: Asset-Store-bf1ec94a
- Z-FUNC: ZEP-Function-2bf2570d
- Z-PSC: Problem-Solving-Checklist-802345a1
- Z-PLAN26: Notice-ZEP-ProBasicFree-Plan-Update-a226a582
- Z-PRO24: ZEP-Pro-Plan-Major-Feature-Change-Announcement-c4149f65
- Z-N-PRICE24: ZEP-Premium-Plans-Adjustments-Announcement-0e9f71c6
- Z-N-APP: Discontinuation-of-ZEP-Official-App-Download-and-Support-0aca6716
- Z-N-AUDIO: Notice-Discontinuation-of-Audio-Only-Settings-2c9e3297
- Z-N-SIDEBAR: Notice-Discontinuation-of-Some-Official-Sidebar-Apps-and-ZEM-Door-Service-03f0e1e5
- Z-N-OBJ: Notice-Discontinuation-of-Some-Object-Settings-in-the-Editor-7031fc4d
- Z-N-MIGR (KR): https://docs.channel.io/zep-support/ko/articles/공지-서버-업데이트-방식-변경-대응을-위한-스크립트-앱-가이드-cd05a1af
- Atualizações:
  - 2024: Z-U2426 (2426-Traffic-Distribution-Criteria-Changes-2394e349); Z-U2464 (2464-ZEP-Major-Update-505039fa); Z-U24626 (24626-A-spotlight-status-check-feature-has-been-added--5c5bad81); Z-U24723 (24723-Audio--Video-Settings-Change-45d850bc); Z-U240926 (24926-Payment-update-Introduction-of-lump-sum-payment-4e1087dd, via busca); Z-U241024 (24-10-24-Free-banner-update-32217669); Z-U241114 (24-11-14-Added-features-such-as-changing-map-order-5f1ebca2, título); Z-U241217 (24-12-17-Respawn-Function-and-Avatar-Update, título)
  - 2025: Z-U250103 (25-01-03-WebRTC-VideoAudioScreen-Sharing-Update-88a8591c); Z-U250218 (25-02-18-Grid-View-Improvement-and-Avatar-Update-588e70ee); Z-U250328 (25-03-28-Profile-Improvements--RTC-Default-Volume-Adjustment, título); Z-U250613 (25-06-13-User-List-Position-...-2a34d029); Z-U250710 (25-07-10-AI-Chat-Update-Low-Power-Mode-...-820135a8); Z-U250901 (25-09-01-WebRTC-...-Server-Status-Guide-04285b36); Z-U251031 (251031-Camera-and-Microphone-Controls-Added-to-PIP-Mode, título); Z-U251218 (251218-Disconnection-Alert-b1737926)
  - 2026: Z-U260107 (260107-New-Feature-Zoom-InOut-for-Screen-Sharing-123cafcb); Z-U260206 (260206-Global-Avatar-Update-531bc62a); Z-U260630 (260630-Screen-Recording-and-ImageFile-Sharing-...-ca017d1e); Z-U260728 (260728-Avatar-Customization-Update-and-ZEM-Gifting-ca024dff); Z-U260804 (260804-Updated-ZEP-Plans-and-Improved-Joystick-Controls-e9d90a51); Z-U260814 (260814-Notification-Feature-Presentation--NPC-Dialogue-Objects-update-ce234553); Z-U260828 (260828-Chat-Mention-Feature-Launch-Private-Area-Graphics-Improvements-8b3fe4ed); Z-U261008 (261008-Avatar-Customization-Update-Motion-410ac316); Z-U261110 (261110-Map-Editor-V2-and-avatar-customization-updates-3cd030cf)
- Z-U230914 (AI NPC, set/2023): https://zep-support-en.super.site/230914-updates (via busca; site hoje inativo)

**ZEP Script (docs.zep.us)**
- Z-S-HELLO: https://docs.zep.us/hello-zep-script
- Z-S-DEV: https://docs.zep.us/zep-script/zep-script-guide/zep-script-development-guide
- Z-S-DEPLOY: https://docs.zep.us/zep-script/zep-script-guide/zep-script-development-guide/zep-script-deployment-guide
- Z-S-FAQ: https://docs.zep.us/zep-script/zep-script-guide/zep-script-faq
- Z-S-API: https://docs.zep.us/zep-script/zep-script-api/api-summary
- Z-S-STORAGE: https://docs.zep.us/zep-script/zep-script-api/scriptapp/storage
- Z-S-EXTAPI: https://docs.zep.us/zep-script/zep-script-guide/appendix/communicating-with-an-external-api
- Z-S-OBJ: https://docs.zep.us/zep-script/zep-script-guide/appendix/object-interaction-with-zep-script
- Z-S-SIDEBAR: https://docs.zep.us/zep-script/zep-script-guide/explore-zep-script/zep-script-example-code/sidebar-app
- Z-S-USE: https://docs.zep.us/zep-script/zep-script-guide/appendix/zep-script-use-cases
- Z-S-SPACES: https://docs.zep.us/zep-script/zep-script-guide/appendix/understanding-spaces-and-maps
- Índices: https://docs.zep.us/sitemap.md, https://docs.zep.us/llms.txt, https://docs-kr.zep.us/llms.txt
- npm/SDK (via busca): https://www.npmjs.org/package/zep-script ; repositório citado: github.com/zep-us/zep-script-sdk

**Imprensa e terceiros**
- E1: https://economist.co.kr/article/view/ecn202306190019 (entrevista com o CEO, jun/2023)
- KoreaScience (estudo acadêmico, trecho via busca): https://koreascience.kr/article/JAKO202334872077576.pdf
- Tentativas sem sucesso (403): https://www.g2.com/products/zep-2026-04-08/reviews , https://www.capterra.co.uk/software/1095214/ZEP

**B1 (análise de bundle)**
- HTML e JS públicos de https://zep.us/en, https://zep.us/home/landing, https://zep.us/en/pricing e https://zep.us/play/_next/static/chunks/ (`_app`, `[mapHashId]`, `_buildManifest`), salvos em scratchpad e analisados só com grep.
