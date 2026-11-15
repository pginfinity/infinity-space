# VirtualStation (virtualstation.io): engenharia reversa de produto

> Pesquisa competitiva para o escritório virtual interno da Infinity (modos 2D e 3D no mesmo mundo).
> Data da coleta: 15/11/2026. Usei só informação pública: site, preços, release notes, política de privacidade, status page e análise estática (só leitura, com grep) do HTML e dos bundles JavaScript públicos de `app.virtualstation.io`. Não criei conta, não fiz login e não executei nenhum arquivo baixado.
>
> **Legenda:** **[confirmado — Vx]** = afirmação com fonte (lista na seção 7). **[inferido]** = dedução minha a partir de evidências indiretas. "Não encontrado" = procurei e não achei.

---

## 1. Visão geral

| Item | Resumo |
|---|---|
| **Empresa** | **Webkalakaar Software Private Limited**, Jaipur, Rajasthan, Índia **[confirmado — V14]**. Lançamento público em **nov/2025** **[confirmado — V8]**. Diz ter "100+" usuários ativos e presença em "10+" países **[confirmado — V8]**, mas outra página fala em "thousands of teams" **[V25]**. As vagas abertas são só de marketing e vendas em Jaipur. Não há vaga de engenharia **[confirmado — V9]**. O path da CDN de downloads é `SmFpIFNocmkgU2h5YW0=`, base64 de "Jai Shri Shyam" **[confirmado — V7]**, o que reforça a origem indiana. |
| **Posicionamento** | "Run your team without chasing updates" **[confirmado — V1]**. É um **all-in-one de gestão de time remoto**: escritório virtual, chat, reuniões, projetos, time tracking, ponto e IA. Promete substituir Slack, Zoom, Jira, Notion, Hubstaff e Calendly **[confirmado — V1, V25]**. |
| **Público** | Founders e gestores de PMEs remotas. Os depoimentos são de CEOs, CTOs e VPs com nomes indianos. As empresas citadas não são verificáveis **[confirmado — V1; inferido quanto à verificabilidade]**. |
| **Dimensão visual** | **2D top-down em pixel art**, no estilo Gather **[confirmado — V35 (screenshot)]**, com tiles de 32 px **[confirmado — V32]**. Não há 3D nem 2.5D (não encontrado no site nem no código). |
| **Plataformas** | **Web** (SPA React instalável como **PWA**, com web push) **[confirmado — V31, V33]**. **Desktop**: Windows 10+, macOS 10.15+, Ubuntu 18.04+ (`.exe`, `.dmg`, `.AppImage` na CloudFront) **[confirmado — V7]**. O desktop é **Electron** **[inferido: o trio exe/dmg/AppImage é o padrão do electron-builder e o bundle detecta `process.versions.electron` — V32]**. **Mobile**: "Calls, chat and your office on iPhone and Android" **[confirmado — V32]** e "Desktop and mobile apps are included on every plan" **[V2]**. **Não encontrei listagem nas lojas** e a página de download só mostra desktop **[V7]**. |
| **Modelo de preço** | Por **pessoa cadastrada**: Pro a **US$15/pessoa/mês** no mensal ou **US$12** no anual (US$144/ano) **[confirmado — V2]**. Free para até 5 pessoas. Trial de 14 dias de Pro **sem cartão** **[confirmado — V2]**. Clientes na Índia pagam GST **[V2]**. |

### Planos e limites [confirmado — V2]

| Limite | Free | Pro | Enterprise |
|---|---|---|---|
| Preço | US$0 | US$15/pessoa/mês (US$12 no anual) | Sob consulta |
| Pessoas | até 5 | sem limite (cobra por pessoa) | custom |
| Salas | 3 | 10 (+US$1 por sala/mês) | ilimitadas |
| Convidados | "Not included" (mas o FAQ diz "guests are always free"). A página se contradiz | Entram sem conta | Incluídos, com "visitor door" |
| Duração da reunião | **45 min** | sem limite | sem limite |
| Video messages | até 5 min, só para o time | qualquer duração, por link | igual ao Pro |
| Storage | 5 GB para o time todo | 5 GB por pessoa, em pool | custom |
| Créditos de IA | saldo inicial pequeno | mensal por pessoa, em pool | mensal por pessoa, em pool |
| Projetos | 3 | ilimitados | ilimitados |
| Histórico de chat | 90 dias | ilimitado | ilimitado |
| Workspaces | 1 | 1 | múltiplos |
| Activity logs | — | 30 dias | 1 ano, com export |
| **Screenshots do time tracker** | — | exibidos por 90 dias (mantidos por 1 ano) | 1 ano ou mais, com frequência custom |
| Políticas de folga | — | 1 | múltiplas, com feriados |
| Papéis | básicos | completos | avançados |
| Mapa | templates e edições básicas | **builder completo com imagens próprias** | **master maps** compartilhados entre workspaces |

- Add-ons (só Pro e Enterprise): assento extra a US$15, storage a US$9 por 100 GB, sala extra a US$1, pacotes de crédito de IA "price coming soon" **[confirmado — V2]**.
- Quando os créditos de IA acabam, as features de IA pausam, mas a reunião continua. Notas de IA em andamento terminam mesmo assim **[confirmado — V2]**.
- Recursos do Pro em diante: live captions, AI Assistant, AI Manager, Company Context, time tracker, app tracker, Team Pulse, ponto e folgas, broadcast, PiP, remote control, avatar custom **[confirmado — V2]**.

---

## 2. Inventário completo de features

### 2.1 Mundo, mapa e movimentação

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Mapa por andares | Andares ilimitados com abas (Office Floor, Meeting Room, Conference). Salas por departamento, projeto, foco ou social, além de Lounge e Focus Pod **[confirmado — V3, V5]** | Contador "32 online" e ocupação por sala ("Design Team: 6 online") **[V3]** |
| Engine de tiles | **Phaser** com grade de colisão, tiles de 32 px e pathfinding até um ponto livre **[confirmado — V32]** | — |
| Clique para andar | O avatar anda até o destino (houve bug de "avatar moving twice on double-click") **[confirmado — V4]** | Teclas `SPACE, LEFT, RIGHT, UP, DOWN` mapeadas no código **[confirmado — V32]** |
| Correr | "Running across the office" (out/2026) **[confirmado — V4]** | — |
| **Veículos** | "Riding vehicles around the office". "Your selected ride appears automatically on longer journeys" **[confirmado — V4, V32]** | O veículo aparece sozinho em trajetos longos, sem botão |
| **Seguir alguém** | Pedido de follow que o outro aceita ou recusa ("Follow request accepted. Moving to leader…"). Tem limite de seguidores **[confirmado — V4, V32]** | Consentimento explícito para ser seguido |
| Sentar / mesa atribuída | Workstations atribuídas, "Walk avatar to seat", "Move your avatar back to your assigned seat" **[confirmado — V32]** | **Decorações da mesa acompanham você** quando troca de mesa **[confirmado — V4]** |
| Localizar avatar | "Locate my avatar" e "Center the map view on your avatar" **[confirmado — V32]** | — |
| **Ponteiros para colegas fora da tela** | Setas na borda indicam onde estão colegas fora do viewport **[confirmado — V4]** | — |
| Name plates | Mantêm tamanho constante em qualquer zoom e ficam acima do avatar **[confirmado — V4]** | — |
| **Avatares se viram para quem fala** | "Avatars turn toward the people they're talking to" **[confirmado — V4]** | Linguagem corporal barata e eficaz |
| Animações | Dançar e piscar. Ausentes aparecem como **avatar esmaecido** **[confirmado — V4]** | — |
| **Pets** | Pets da casa andam pelo escritório, cumprimentam e recebem carinho. Pets pessoais. **"Play as your pet"** (desativável pelo admin) **[confirmado — V4, V32]** | Bilhetes rápidos do pet ("Coffee?", "Lunch?") com respostas Yes, No ou texto **[V4]** |
| TV no escritório | Cole um link do YouTube e a TV toca **para quem está perto**, com fila, playlists, shuffle e loop **[confirmado — V4, V12]** | Mídia como objeto espacial |
| Modos sem mapa | **Grid view**, **Focus view** e chat em tela cheia, sem recarregar o mapa ao alternar **[confirmado — V4, V32]** | O mapa é opcional: "Can I use it without the virtual office map? Yes" **[V11]** |
| Lobby | Ocupação das salas e estatísticas do dia **[confirmado — V4]** | — |
| Fixar pessoas e salas | Pin na sidebar, com contagem de participantes por sala **[confirmado — V4]** | — |
| Transições | Loading que mostra o contorno da página. "Rooms open on their latest map immediately" **[confirmado — V4]** | — |

### 2.2 Áudio e vídeo por proximidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Walk up and talk | Chegue perto e fale, sem link de reunião **[confirmado — V1, V20]** | Raio e decaimento não documentados publicamente |
| **Atenuação por usuário** | Estado `spatialFade` com fator de volume por participante (`setUserFade(id, factor)`) **[confirmado — V32]** | Indica volume gradual por distância, não só liga/desliga **[inferido]** |
| Proximidade autoritativa no servidor | Flag `serverAuthoritativeProximity` e eventos `SPATIAL_RECONCILE_RECEIVED` e `SPATIAL_BASELINE_RESET` **[confirmado — V32]** | A migração de proximidade calculada no cliente para o servidor parece estar em andamento **[inferido]** |
| Grupos | "Group members hear each other" **[confirmado — V4]** | Proximidade mais confiável, inclusive com o app minimizado (mai/2026) **[V4]** |
| **Detectar conversa próxima** | "Detect nearby conversations and join with one click" **[confirmado — V4]** | — |
| **Chat casual por proximidade** | "Casual talk chat with people nearby" **[confirmado — V4]** | Texto efêmero ligado ao espaço |
| Salas privadas e batida | "Set as Private Room". "You're not allowed to join this private call. Knock for access." "The people on the call can hear you knocking." **[confirmado — V32]** | **A batida é sonora para quem está dentro** |
| Pedir para entrar numa reunião em andamento | Com aprovação do host (nov/2026) **[confirmado — V4]** | — |
| Zonas de reunião | Eventos `MEETING_ZONE_INVITE_PENDING`, `JOIN_CONFIRMED`, `DECLINE`, `STAY`, `EXIT` **[confirmado — V32]** | Entrar numa zona pede confirmação **[inferido]** |
| **Broadcast** | "Start Broadcast" e "Live Broadcasts" para o workspace inteiro, um por vez ("A Broadcast is Already in Progress") **[confirmado — V32]**. Também há "Broadcast messages" em texto **[V4]** | É o megafone. Recurso do Pro **[V2]** |
| Layouts | "Stage": um orador ou tela no palco e os outros numa faixa. Grade de tiles iguais **[confirmado — V32]** | — |
| PiP | Picture-in-picture com fixar o card de uma pessoa, legendas no PiP, compartilhar tela e sair pelo PiP **[confirmado — V4]** | Tile flutuante abre sozinho com chamada tocando ou alguém perto (desktop) **[V4]** |
| Chamada direta | Ligar a partir da grade, do Focus e do chat. Ligar para o mobile **mesmo com o app fechado** **[confirmado — V4]** | — |
| Spotlight / palco dedicado | Não encontrado como nome. "Stage" é um layout **[V32]** | — |

### 2.3 Compartilhamento de tela

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Fontes | Tela inteira, janela ou aba **[confirmado — V18]** | Trocar a fonte, pausar e gerenciar quem assiste **[V18]** |
| Áudio do sistema | No desktop (set/2026) **[confirmado — V4]** | — |
| Anotação | Ponteiro, caneta, forma, texto, desfazer **[confirmado — V18, V4]** | "Alex annotated this step" **[V18]** |
| Zoom e arrastar | Na tela compartilhada (abr/2026). Tela cheia (mar/2026) **[confirmado — V4]** | — |
| **Controle remoto** | O espectador pede, quem compartilha aprova (Decline / Allow control). Qualquer um encerra na hora. **Copiar e colar entre computadores** **[confirmado — V22, V4]** | Precisa estar "na mesma reunião ou perto" para controlar **[V32]**. O admin habilita ("Let people request control of a screen shared from the desktop app") **[V32]** |
| Múltiplos simultâneos | Não encontrado | — |
| Telas no mundo | A TV do YouTube é um objeto no mapa **[V4]**. Para compartilhamento de tela, não encontrado | — |
| Qualidade | Sem números ("Crisp sharing") **[V18]** | — |

### 2.4 Qualidade de áudio

| Feature | Como funciona |
|---|---|
| **Krisp (via LiveKit)** | `KrispNoiseFilter` e `enhancedNoiseCancellation` no bundle **[confirmado — V32]**. O Krisp do LiveKit é recurso do **LiveKit Cloud** **[inferido]** |
| "Smart video and audio" | Brilho inteligente e melhoria de ruído **[confirmado — V6]** |
| Fundo virtual | Web worker dedicado (`virtualBackgroundWorker`) **[confirmado — V32]** |
| Cancelamento de eco | Não documentado. Usa o padrão do WebRTC **[inferido]** |
| Histórico de bugs | Microfone voltando sozinho para o padrão do sistema, quedas de áudio e vídeo em sessões longas, vídeo preto intermitente, sons de entrada fantasmas **[confirmado — V4]** |

### 2.5 Chat e comunicação assíncrona

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Canais e grupos | Públicos e privados. Sair do grupo pelo cabeçalho **[confirmado — V21, V4]** | — |
| DMs | Sim **[confirmado — V21]** | — |
| Threads | Com "Sent" e "Seen" nas respostas **[confirmado — V21, V4]** | — |
| Recursos de mensagem | Editar, apagar, encaminhar. Seen, delivered e typing. Info da mensagem em grupos. Link previews. **Editar imagem antes de enviar** (desenho, formas, texto, crop) **[confirmado — V4]** | — |
| **Mensagens agendadas e rascunhos** | Sim **[confirmado — V4]** | — |
| **Voice notes** | Sim **[confirmado — V4, V21]** | — |
| **Video messages** | Gravador flutuante com câmera. Compartilha por link no Pro **[confirmado — V4, V2]** | Estilo Loom nativo |
| Salvos e com estrela | Sincronizados entre dispositivos **[confirmado — V4]** | — |
| Chat Files | Todos os arquivos numa lista com filtro por tipo, nome e remetente **[confirmado — V4]** | — |
| Docs no chat | Documentos compartilhados abrem em janela própria para coedição **[confirmado — V4]**. Usa Yjs **[confirmado — V32]** | Docs Markdown com preview **[V4]** |
| Cards de reunião ao vivo | Cards no chat com respostas em thread **[confirmado — V4]** | — |
| Importar histórico | De outras ferramentas **[confirmado — V4]** | — |
| Reações animadas, GIFs, pins | Sim **[confirmado — V4, V21]** | — |
| Chat em PiP | Redimensionável, fica aberto sobre outros apps (desktop) **[confirmado — V4]** | — |
| **Quadro branco (SketchBoard)** | Canvas infinito com formas, conectores, desenho livre, notas, checklists, comentários inline e autosave **[confirmado — V23]**. Usa fabric.js **[inferido — V32]** | Tem componente próprio na status page **[V29]** |
| Drive | Arquivos da equipe e itens de sala (docs, quadros) com renomear, copiar link e estrela **[confirmado — V4]** | — |

### 2.6 Presença e status

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Estados | Available, Working, Focus (com prazo, ex.: "until 3:30 PM"), Meeting (com tempo restante, ex.: "22 min left"), Away, Online, Offline, Busy **[confirmado — V13, V3]** | **O status mostra até quando dura** |
| Mensagem de status | Ex.: "Protecting focused time; send a message for later instead" **[confirmado — V13]** | Orienta como abordar a pessoa |
| Tarefa atual no card | Papel e tarefa atual ("API integration") **[confirmado — V13, V3]** | A presença fica ligada ao trabalho |
| Fusos e horário de trabalho | Horário de cada um no seu fuso, com widget de horários locais **[confirmado — V13]** | "Know when someone has finished their day" |
| Away por inatividade | O admin configura quantos minutos sem input marcam Away (e contam como idle no tracker) **[confirmado — V32]** | A configuração vale para o workspace inteiro |
| Profile cards | Capa, fuso e info do GitHub **[confirmado — V4]** | — |
| Indicador de plataforma | "On desktop app" / "On web browser" / mobile **[confirmado — V32]** | — |
| Mesa própria | Workstation atribuída com decoração pessoal **[confirmado — V4, V32]** | — |
| Batida na porta | Ver 2.2 | — |
| Ícone de controle | Ícone de controle de game sobre o avatar quando a pessoa está jogando **[confirmado — V12]** | Torna a pausa visível |

### 2.7 Avatares e customização

| Feature | Como funciona |
|---|---|
| Avatar custom (Pro) | "Create an avatar that looks like you". "Choose your style, your ride and your pet" **[confirmado — V32, V2]** |
| Pixel art em spritesheets | `new-stripe-sheets/...` na CloudFront, incluindo um sprite de **avatar de IA** (`AIAvatarSpriteSheet`) **[confirmado — V32]** |
| Veículos e pets | Ver 2.1 |
| Fundos virtuais | Desde jan/2026 **[confirmado — V4]** |
| Logo do workspace | Sim **[confirmado — V4]** |

### 2.8 Editor de mapa, builder, objetos interativos e embeds

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Map editor (out/2026) | Paredes, mesas, salas de reunião, móveis, plantas. Salas a partir de layouts prontos **[confirmado — V4]** | Abas Rooms / Desks / Decor / Branding **[V5]** |
| Imagens próprias | Builder completo com upload no Pro **[confirmado — V2]** | — |
| Regras de navegação | "Blocked tiles", "walk-through tiles" (que precisam tocar a "approach zone") e "interact point" fora de tiles bloqueados **[confirmado — V32]** | Objetos têm zona de aproximação e ponto de interação. É um modelo sólido |
| Draft e publish colaborativo | Publicar um rascunho antigo preserva o que colegas publicaram. O editor abre em nova aba. Duplicar com Cmd/Ctrl+D **[confirmado — V4]** | "This room's floors changed. Reload the editor." **[V32]** |
| **Master maps** | Mapas compartilhados que atualizam o escritório de todos os times, com Undo (Enterprise) **[confirmado — V4, V2]** | — |
| Itens de sala | Google Docs, Sheets, Slides, quadros, documentos e PDFs (Office viewer embed) **[confirmado — V4, V32]** | — |
| TV do YouTube | Ver 2.1 | — |
| Mesas de jogo | Cadeiras e mesas com assentos. "Game chair refused" e "Game table stand up" **[confirmado — V32]** | — |

### 2.9 Jogos e social

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Game Room | Sala no mapa, sem agendar. Mic e câmera funcionam como no resto do escritório **[confirmado — V12]** | "Novo jogo toda semana" (nov/2026) **[V4]** |
| Jogos | Tic-tac-toe, **Chess**, **Ludo** (2–4), **Snakes and Ladders** (especial de Diwali, com 3 tabuleiros) **[confirmado — V12]** | O código já tem jogos de dedução social ("Tap a player to put the hat on the bluff", "With 3 players, one wrong vote ends the game") **[confirmado — V32; inferido: próximos lançamentos]** |
| **Oponentes de IA** | Três níveis. A IA ocupa cadeiras vazias em Ludo e Snakes **[confirmado — V12]** | Dá para jogar sozinho ou completar a mesa |
| Gamificação | Skill Points, rankings semanal e mensal por jogo, "Champion" no perfil, compartilhar o resultado no chat **[confirmado — V12]** | — |
| Temas e som | 5 temas de tabuleiro e liga/desliga do som **[confirmado — V12]** | — |
| Torneios | "Coming soon" **[confirmado — V12]** | — |
| Pets, veículos, dança, YouTube juntos | Ver 2.1 | — |
| Lembretes de postura | Dez/2025 **[confirmado — V4]** | — |

### 2.10 Reuniões

| Feature | Como funciona |
|---|---|
| Áudio e vídeo | Sem números de resolução **[V6]** |
| Gravação | Áudio, vídeo ou tela. **Links protegidos por senha** **[confirmado — V6]** |
| Transcrição | Ao vivo, com identificação de quem fala e timestamps. Inglês, hindi, espanhol, francês e outros 12 idiomas **[confirmado — V1, V6, V30]** |
| Live captions | Inclusive no PiP **[confirmado — V4]** |
| Notas e resumo de IA | Recap, decisões, próximos passos, **dono e prazo sugeridos** **[confirmado — V30]**. Notas de IA vêm em todos os planos (créditos iniciais) **[V2]** |
| Notetaker automático | "AI notetaker that joins automatically" (home) **[confirmado — V1]**. A página de resumos diz que a transcrição precisa ser ligada durante a reunião **[V30]**. Há inconsistência |
| Histórico | Histórico de reuniões, logs de chamadas, notas **[confirmado — V4]** |
| Agendamento | Por cards de reunião no chat e calendários compartilhados (Team, Product, Design) **[confirmado — V4, V1]** |
| Convidados | Link de convite para reunião. Convidado entra sem conta (Pro) **[confirmado — V4, V2]** |
| Limite no Free | 45 min **[confirmado — V2]** |
| Breakouts | Não encontrado |

### 2.11 IA

| Feature | Como funciona |
|---|---|
| **Orca (agente de IA com corpo no mundo)** | Agente com **avatar no escritório** (`AIAvatarSpriteSheet`). "Dispatch Orca to your current room in standup mode", "Orca is joining your room", "Orca is here, added by …" **[confirmado — V32]**. O nome Orca não aparece no marketing, onde vira "AI Coordinator" ou "AI Manager" **[V16]** |
| **Standup por voz** | "Orca will call you for your standup". A Orca **liga para o colega**. Dá para mandar o update por texto no chat. Há tempo máximo de espera numa tentativa de voz **[confirmado — V32]** |
| Vozes e personalidade | Vozes "crisp IN", "neutral US" e "warm UK". "Set the personality Orca uses across calls, summaries, and DMs" **[confirmado — V32]** |
| **Digest para gestores** | "Each manager receives a daily Orca digest of their direct reports' standup updates. Set who reports to whom below." **[confirmado — V32]** |
| Etiqueta configurável | "If a teammate already posted within this many hours, Orca stays quiet." "When off, Orca only says 'someone on your team' asked for an update." **[confirmado — V32]** |
| AI Standups (texto) | Três perguntas fixas (feito, próximo, bloqueios). Resumo em Progress / Up Next / Needs Attention **[confirmado — V24]** |
| AI Coordinator | Briefing diário ("what changed, what matters, what needs a hand") a partir de standups, reuniões e bloqueios **[confirmado — V16]** |
| Blockers e Team Insights | Mostra trabalho travado e carga e entrega **[confirmado — V1]** |
| **Company Context** | `@Context` em qualquer chat. Faz RAG sobre projetos, tarefas, horas, ponto, folgas, reuniões e documentos. **Respeita permissões** ("No one, Admins included, can ask it to read a chat they aren't part of"). **Ações só depois de confirmação** (criar tarefa, marcar reunião, agendar post). Gera gráficos sob demanda. Gmail e Calendar "coming soon" **[confirmado — V17]** |
| **Escolha de modelo por workspace** | Tela "ai-configuration" para admin ou manager com Claude Opus 5.5, Sonnet 5.5, Haiku 5.5 e GPT-5.6 / GPT-6 / GPT-6.1 (variantes Luna, Sol, Terra, Astra), por tier (best, balanced, fast). **Padrão: `claude-opus-5-5`** para `facilitator`, `standup`, `summarize` e `digest` **[confirmado — V32]** |
| Créditos de IA | Saldo em pool. "Out of AI credits · Orca and Context can't answer until more are added" **[confirmado — V2, V32]** |
| IA nos jogos | Oponentes de IA **[V12]** |
| Backend de IA | `wss://ai.virtualstation.io/ws` (tempo real) **[confirmado — V32]**. Status page com componente "AI Agent" **[V29]** |

### 2.12 Integrações [confirmado — V10, V4]

| Integração | Detalhe |
|---|---|
| Google (conta), Google Calendar, Google Docs, Drive, Sheets, Slides | Docs dentro das salas e seletor do Drive |
| Slack | "Connect team communication" (sem detalhes) |
| Jira, Linear | Issues "em contexto" (sem detalhes) |
| GitHub | Info do GitHub no profile card (ago/2026) |
| Login | LinkedIn, GitHub, Google **[V4]** |
| Calendly | Usado para demos, não como integração **[V11]** |
| Gmail | "Coming soon" **[V17]** |
| Status (live ou beta) | Não informado **[V10]** |

### 2.13 Admin, segurança e privacidade

| Feature | Detalhe |
|---|---|
| Papéis | Básicos, completos e avançados conforme o plano **[V2]**. O código tem `ADMIN` e `MANAGER` **[confirmado — V32]** |
| Bloquear e remover usuários | Sim **[confirmado — V4]** |
| Proteção de login | Bloqueio após tentativas falhas, com desbloqueio na página Security **[confirmado — V4]** |
| Login no desktop e celular por código | Pareamento com código de confirmação ("Check that this code matches…") **[confirmado — V32]** |
| Visitor door | Visitante bate e a equipe libera (Enterprise) **[confirmado — V4, V2]** |
| Activity logs | 30 dias (Pro), 1 ano com export (Enterprise) **[V2]** |
| Criptografia | "Traffic is encrypted in transit, including audio and video". Workspaces isolados **[confirmado — V11]** |
| **Certificações** | **Nenhuma.** Não encontrei SOC 2, ISO 27001 nem GDPR. Diz ter "99.9% Platform uptime SLA" e "24/7 support" **[V25]** |
| **Política de privacidade** | Não menciona GDPR, a DPDP indiana, screenshots ou biometria. Diz que os dados ficam "on servers located in India or other countries where we operate". Cita terceiros que podem "record your mouse movements, scrolling, clicks, and keystroke activity". Só o Google Analytics é nomeado **[confirmado — V14]** |
| **Vigilância embutida** | **Screenshots** de sessões de trabalho, rastreamento de **apps e URLs**, **"productivity score"**, **% de carga por pessoa**, ponto derivado de presença **[confirmado — V15, V19, V28]**. **Verificação de identidade por reconhecimento facial** (dez/2025) **[confirmado — V4]**, feita **no cliente** com modelos `ssdMobilenetv1` e limiares (`distanceThreshold:.47`, `minSimilarityPercent:22`) e um "SilentFaceVerificationService" **[confirmado — V32]** |
| Postura declarada | "Tracking never starts on its own." "Monitoring they discover by accident is surveillance" **[confirmado — V26]**. A página de produtividade diz "Track time automatically with zero effort" **[V28]**. Há contradição |
| Site de marketing | Microsoft Clarity (gravação de sessão), Tawk.to, widgets Zoho, GTM **[confirmado — V34]** |

### 2.14 Performance e requisitos

| Item | Detalhe |
|---|---|
| Desktop | 4 GB de RAM mínimo (8 GB recomendado), dual-core de 1,5 GHz, 500–600 MB de disco, **2 Mbps** **[confirmado — V7]** |
| Bundle web | O entry chunk tem **megabytes**. O próprio HTML comenta: "there used to be seconds of empty dark window". O `main.js` tem ~6,5 MB e o chunk do mapa (Phaser) mais ~0,5 MB **[confirmado — V31, V32]** |
| Mitigações | Skeleton de boot que se funde com o loader do React (um "relógio" compartilhado para a animação não reiniciar), lazy loading, "lower CPU usage on web and desktop" (jun/2026) **[confirmado — V31, V4]** |
| Estabilidade (release notes) | Muitos fixes de presença (colegas "offline" por engano, sessões velhas), lag em sessões longas, A/V parando em sessões muito longas, avatar travando, posição dessincronizada **[confirmado — V4]** |
| Modo leve | Grid/Focus view sem mapa **[V4]**. Não encontrei modo de baixo recurso automático |
| Status page | Componentes: Login/SignUp, Audio/Video/ScreenShare, Broadcast, SketchBoard, AI Agent, API Server, Chat Server, Web App, Landing. Sem incidentes em nov/2026 **[confirmado — V29]** |

### 2.15 Mobile e acessibilidade

| Feature | Detalhe |
|---|---|
| Mobile | Chamadas de áudio e vídeo (fev/2026). Salas e grupos, rich text, status, troca de workspace, app tracking (abr/2026). Mentions, salvos, agendadas, threads, lembretes, mídia offline (mai/2026). Busca, downloads, push (jun/2026). Team Pulse (set/2026). Chamadas com o app fechado **[confirmado — V4]** |
| PWA | Instalável, com web push (no iOS só com PWA na tela inicial) **[confirmado — V31]** |
| Listagem nas lojas | Não encontrada |
| Acessibilidade | Live captions (Pro) **[V25]**. Nenhuma declaração WCAG encontrada |

### 2.16 Onboarding

| Feature | Detalhe |
|---|---|
| Product tour | `app.virtualstation.io/tour`, com chunk dedicado `ProductTourPage` **[confirmado — V31, V32]** |
| Onboarding do usuário | Chunk `UserOnboarding`. Mensagens lúdicas de loading ("Dusting off your desk", "Syncing the wall clocks") **[confirmado — V32]** |
| Templates | Layouts e mapas prontos (ago e out/2026) **[confirmado — V4]** |
| Trial | 14 dias de Pro sem cartão. Depois cai para Free sem perder conteúdo **[confirmado — V2]** |
| Suporte | Support desk embutido (set/2026), WhatsApp, Calendly para demos **[confirmado — V4, V11]** |
| Enterprise | Setup do escritório e treinamento do time **[V2]** |

---

## 3. Stack técnica

| Camada | Tecnologia | Status |
|---|---|---|
| Frontend | **React 18.3.1**, **Vite**, SCSS | **[confirmado — V31, V32]** (versão no bundle, Vite e SCSS em comentários do HTML) |
| UI | **MUI** e Emotion | **[confirmado — V32]** |
| Estado | **Redux Toolkit**. Slices: `virtualRoom`, `virtualRoomObject`, `mediaserver`, `goSocket`, `socket`, `chat`, `scene`, `workstation`, `timeTracker`, `follow`, `petNote`, `orcaSession`, `spatialFade`, `roomPlayer`, `games`, `screenControl`, `mapEditor`, `roomTransition`, `commandCenter`, `attentionItems` etc. | **[confirmado — V32]** |
| **Engine do mapa** | **Phaser** (`Phaser.Core.Events`, cenas, WebGL e Canvas), tiles de 32 px, grade de colisão, pathfinding | **[confirmado — V32]** |
| **Mídia** | **LiveKit** (livekit-client, `*.livekit.cloud`), WebRTC, simulcast e SVC | **[confirmado — V32]** |
| Ruído | Krisp via LiveKit (`KrispNoiseFilter`) | **[confirmado — V32]** |
| Tempo real | **Socket.IO** v3+ (`socket`) e um segundo canal `goSocket` em `go.api.virtualstation.io` | **[confirmado — V32]**. Backend em **Go** para o tempo real **[inferido pelo nome]** |
| APIs | `api.virtualstation.io`, `chat.virtualstation.io` (servidor de chat separado), `connect.virtualstation.io`, `ai.virtualstation.io/ws` | **[confirmado — V32, V29]** |
| IA | Claude (Opus, Sonnet, Haiku 5.5) e GPT (5.6 a 6.1), selecionáveis por workspace | **[confirmado — V32]** |
| Editor de texto | Quill / react-quill. `marked` para Markdown | **[confirmado — V32]** |
| Coedição | Yjs | **[confirmado — V32]** |
| Quadro branco | fabric.js | **[confirmado presença — V32]**. Uso no SketchBoard **[inferido]** |
| Reconhecimento facial | Modelos `ssdMobilenetv1` carregados de `/models` (padrão do face-api.js) | **[confirmado — V32]**. Biblioteca exata **[inferido: face-api.js ou um fork]** |
| Push | Firebase Cloud Messaging | **[confirmado — V32]** |
| Pagamento | **Razorpay** (checkout.js) e menção a Stripe | **[confirmado — V32]** |
| CDN | AWS CloudFront (`d25b3o90o3oed9.cloudfront.net`) | **[confirmado — V7, V32]** |
| Desktop | Electron | **[inferido — V7, V32]** |
| Mobile | Não determinado (há PWA. O app nativo é declarado, mas não achei nas lojas) | — |
| Marketing | **WordPress** com tema próprio (`wp-content/themes/virtualstation`), GTM/GA, Microsoft Clarity, Tawk.to, Zoho | **[confirmado — V34]** |
| Status | Atlassian Statuspage | **[confirmado — V29]** |

---

## 4. Padrões de UX e design que valem estudar

1. **Objetos com "approach zone" e "interact point".** No editor, cada objeto interativo declara de onde se aproxima e onde se interage, e há validação ("Every walk-through tile must touch the approach zone") **[V32]**. É um modelo limpo para cadeiras, TVs, mesas de jogo e portas, que se traduz direto para 3D.
2. **Mesa atribuída e "walk to seat".** O avatar caminha sozinho até a mesa e a decoração pessoal segue a pessoa **[V4, V32]**.
3. **Follow com consentimento** e limite de seguidores **[V32]**.
4. **Indicadores fora da tela** e **name plates de tamanho fixo** **[V4]**.
5. **Avatares se viram para quem fala.** Dá ar de conversa com custo mínimo **[V4]**.
6. **Detectar conversa e entrar com um clique**, mais **chat de texto por proximidade** **[V4]**.
7. **Batida audível** para quem está dentro **[V32]**.
8. **Mídia espacial**: uma TV que só quem está perto ouve, com fila **[V4]**.
9. **O mapa é opcional.** Grid, Focus e chat em tela cheia sem recarregar o mapa **[V4, V11]**. É bom para máquinas fracas e acessibilidade.
10. **Status com prazo e instrução de abordagem** ("Focus until 3:30", "send a message for later") **[V13]**.
11. **Veículo automático em trajetos longos.** Resolve a lentidão de andar em mapas grandes de um jeito lúdico **[V32]**.
12. **Agente de IA com corpo** que entra na sala e conduz o standup **[V32]**. O conceito é forte e é o diferencial mais original do produto.
13. **IA com confirmação antes de agir** e **respeito a permissões** no Company Context **[V17]**.
14. **Remote control com dupla saída** (qualquer lado encerra) e clipboard **[V22, V4]**.
15. **Boot skeleton contínuo**, sem "pulo" entre o HTML e o React **[V31]**.
16. **Draft e publish do mapa com merge** que não sobrescreve o trabalho de colegas **[V4]**.

---

## 5. Críticas e pontos fracos

### 5.1 Reclamações reais (com fonte)

**Não encontrei reviews independentes.** Procurei G2, Capterra, Product Hunt (só achei produtos homônimos como "VirtualSpace"), App Store e Google Play (sem listagem), Trustpilot, Reddit e HN. Os únicos depoimentos estão no próprio site, com nomes e empresas não verificáveis **[V1]**. Para um produto lançado em nov/2025 com "100+" usuários **[V8]**, isso é esperado, mas significa **zero prova social independente**.

O que dá para tirar de fontes do próprio fornecedor:

| Problema evidenciado | Fonte |
|---|---|
| Muitos fixes de **presença** ("teammates wrongly shown as offline", "stale sessions", "showing Away while working in another app", "users disappearing from the map") | Release notes **[V4]** |
| **Áudio e vídeo** instáveis em sessões longas, vídeo preto intermitente, mic trocando sozinho, sons fantasmas de entrada | **[V4]** |
| **Time tracker** perdendo segundos, sessões duplicadas, screenshots pretos | **[V4]** |
| Problemas de cobrança e renovação, cupons, restrições de pagamento | **[V4]** |
| Carregamento lento ("seconds of empty dark window") | Comentário no HTML **[V31]** |

### 5.2 Análise crítica (o que falta ou preocupa) [inferido salvo quando indicado]

- **É um produto de vigilância disfarçado de escritório virtual.** Screenshots, apps e URLs, "productivity score", carga por pessoa, ponto por presença e **reconhecimento facial** **[V4, V15, V19, V28, V32]**. A política de privacidade **não cita** screenshots nem biometria **[V14]**. Para empresas com LGPD ou GDPR, isso é um passivo.
- **Escopo amplo demais para um time pequeno.** São 125 features novas em 12 meses **[V4]**: projetos, sprints, ponto, folgas, drive, docs, quadro, jogos, pets, veículos, IA. A profundidade de cada módulo tende a ser rasa e a estabilidade sofre (ver 5.1).
- **Sem 3D e sem 2.5D.** Pixel art estilo Gather **[V35]**. Não há diferencial visual frente ao Gather.
- **Proximidade autoritativa ainda atrás de flag** (`serverAuthoritativeProximity`) **[V32]**. A base de áudio espacial ainda está amadurecendo.
- **Sem certificações de segurança** e com dados "na Índia ou outros países" **[V14]**.
- **Contradições no marketing**: convidados no Free, "100+" vs "thousands", "nada a instalar" vs a página de download, notetaker automático vs transcrição manual, "tracking never starts on its own" vs "automatically with zero effort".
- **Sem breakouts, sem spotlight dedicado, sem múltiplas telas simultâneas** documentados.
- **Mobile declarado mas não localizado** nas lojas.
- **Integrações rasas** (só nomes, sem descrição de comportamento) **[V10]**.

---

## 6. Para a Infinity

### 6.1 Copiar

1. **Phaser + grade de colisão + pathfinding** para o modo 2D **[V32]**, com o **mesmo grid** servindo de navmesh simplificado no 3D.
2. **Modelo de objeto com approach zone e interact point** no editor **[V32]**: cadeira, TV, quadro, mesa de jogo, porta.
3. **Mesa atribuída**, "walk to seat" e decoração que segue a pessoa **[V4, V32]**.
4. **Follow com consentimento** **[V32]**.
5. **Indicadores de colegas fora da tela**, name plates fixos e avatar virando para quem fala **[V4]**.
6. **"Conversas por perto, entrar com 1 clique"** e **chat de texto por proximidade** **[V4]**.
7. **TV/mídia espacial** com fila, audível só por perto **[V4]**.
8. **Mapa opcional** (grid, foco, chat) sem perder o estado **[V4]**.
9. **Status com prazo e instrução de abordagem** **[V13]**.
10. **Remote control com consentimento duplo** e clipboard **[V22]**.
11. **Company Context com permissões e confirmação antes de agir** **[V17]**.
12. **Draft e publish do mapa com merge** e master maps para padronizar andares **[V4]**.
13. **Pareamento desktop e celular por código** **[V32]**.

### 6.2 Melhorar

1. **3D de verdade no mesmo mundo.** O VirtualStation é só 2D. A Infinity diferencia com 2D e 3D sobre o mesmo estado e o mesmo mapa (os tiles do editor 2D viram geometria extrudada no 3D).
2. **Proximidade autoritativa no servidor desde o dia 1**, com fator de atenuação contínuo (o `spatialFade` deles **[V32]**) e oclusão por paredes.
3. **Orca melhorada: agente que é convidado, não que cobra.** Pode facilitar a daily na sala, fazer a ata em PT-BR e responder `@contexto`. **Nunca liga para ninguém sem opt-in** e não manda "digest de subordinados" para o gestor.
4. **Escopo focado.** Para uso interno, **integrar** com as ferramentas que a Infinity já usa (tarefas, docs, calendário) em vez de reconstruir PM, drive e ponto.
5. **Estabilidade de presença**: heartbeats, reconciliação, testes de sessão longa. É exatamente onde o VirtualStation mais tropeça **[V4]**.
6. **Performance de boot**: code-split real do engine e dos módulos. Evitar um entry chunk de vários MB **[V31]**.

### 6.3 Evitar

1. **Vigilância: screenshots, app e URL tracking, "productivity score", carga individual exposta e reconhecimento facial.** Pela LGPD, dado biométrico é **dado pessoal sensível** (art. 5º, II e art. 11). Exige base legal específica, transparência e minimização. Também destrói a confiança, que é o que faz um escritório virtual ser usado.
2. **Transformar presença em ponto.** No Brasil, o controle eletrônico de jornada tem regulamentação própria (Portaria MTP nº 671/2021). Presença no escritório virtual **não deve** virar registro de jornada informal. Validar com o jurídico.
3. **Inflar o escopo** com dezenas de módulos rasos e muitos fixes recorrentes.
4. **Contradições entre o que se diz e o que o produto faz** (ex.: "tracking manual" vs "automático"). Internamente, a política de privacidade do escritório deve ser **curta, pública e fiel ao código**.
5. **Depender de um único modelo de IA sem controle de custo.** Copiar a ideia de créditos e tiers por função (fast, balanced, best), com orçamento.

### 6.4 Ideias inovadoras inspiradas no VirtualStation

1. **Facilitador de IA com corpo, nos dois modos.** No 2D é um sprite. No 3D é um avatar com lip-sync. Ele "senta" na sala de reunião quando convidado, cronometra a pauta, registra as decisões e as publica no canal da sala. Sem avaliação individual.
2. **Bilhete de pet / post-it de voz.** Em vez do pet que leva "Coffee?", deixar **notas de voz ou texto ancoradas na mesa** de um colega, que ele ouve ao voltar. É assíncrono e espacial.
3. **"Carona" (follow + veículo).** Seguir alguém vira entrar na carona da pessoa: os dois se movem juntos, com a conversa aberta. Ótimo para tours de onboarding ("vem comigo que eu te mostro o andar").
4. **Objetos de mídia que existem nos dois modos.** TV, quadro e telão: no 3D aparecem como superfícies no ambiente. No 2D, como ícones que expandem em painel. O estado (o que toca, quem controla) é único.
5. **Mapa como índice do trabalho, sem vigilância.** A sala do projeto X mostra, num totem, o último resumo, as decisões e os links do projeto. O contexto mora no lugar, não numa métrica sobre pessoas.

---

## 7. Fontes

**Site e produto (www.virtualstation.io)**
- V1. https://www.virtualstation.io/
- V2. https://www.virtualstation.io/pricing/
- V3. https://www.virtualstation.io/virtual-office/
- V4. https://www.virtualstation.io/release/ (release notes de nov/2025 a nov/2026)
- V5. https://www.virtualstation.io/office-spaces/
- V6. https://www.virtualstation.io/virtual-meeting/
- V7. https://www.virtualstation.io/download-app/
- V8. https://www.virtualstation.io/about/
- V9. https://www.virtualstation.io/careers/
- V10. https://www.virtualstation.io/integrations/
- V11. https://www.virtualstation.io/contact-us/ (FAQ)
- V12. https://www.virtualstation.io/game-room/
- V13. https://www.virtualstation.io/team-presence/
- V15. https://www.virtualstation.io/time-tracker/
- V16. https://www.virtualstation.io/ai-coordinator/
- V17. https://www.virtualstation.io/company-context/
- V18. https://www.virtualstation.io/screen-share/
- V19. https://www.virtualstation.io/attendance/
- V20. https://www.virtualstation.io/compare/virtualstation-vs-gather/
- V21. https://www.virtualstation.io/team-chat/
- V22. https://www.virtualstation.io/remote-control/
- V23. https://www.virtualstation.io/sketchboard/
- V24. https://www.virtualstation.io/ai-standups/
- V25. https://www.virtualstation.io/why-virtualstation/
- V26. https://www.virtualstation.io/blog/remote-team-visibility-without-micromanaging/
- V27. https://www.virtualstation.io/project-management/
- V28. https://www.virtualstation.io/productivity/
- V30. https://www.virtualstation.io/meeting-summaries/

**Legal e operação**
- V14. https://www.virtualstation.io/privacy-policy/ (atualizada em 20/10/2026)
- V29. https://virtualstation.statuspage.io/

**Análise estática (só leitura, nada executado)**
- V31. HTML do app: https://app.virtualstation.io/tour
- V32. Bundles: https://app.virtualstation.io/assets/main-BDXM5bz2.js (≈6,5 MB), `JoinVirtualRoom-BTa8S38Z.js` (Phaser), `SilentFaceVerificationService-D8nnPb21.js`, `FaceCapture-DiTqnM85.js`
- V33. https://app.virtualstation.io/manifest.webmanifest
- V34. HTML do site de marketing (WordPress): https://www.virtualstation.io/
- V35. Screenshot do produto: https://www.virtualstation.io/wp-content/themes/virtualstation/assets/images/home/VS-LP-Product-image.webp

**Buscas sem resultado relevante** (para registro): G2, Capterra, Product Hunt, App Store e Google Play ("VirtualStation"), Trustpilot e Reddit. Também não encontrei menção à razão social "Webkalakaar" fora da política de privacidade.
