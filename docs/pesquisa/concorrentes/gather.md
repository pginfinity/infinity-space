# Gather (gather.town): engenharia reversa de produto

> **Alvo:** Gather (https://www.gather.town/pt/), com foco no **Gather 2.0** (lançado em set/2025) e citando o Gather 1.0 "Classic" quando ajuda a comparar.
> **Data da pesquisa:** 15/11/2026. Só usei informação pública: site, central de ajuda, changelog, roadmap, GitHub público, reviews e os bundles JS/locale públicos do app web. Analisei os bundles apenas com grep, sem executar nada. Não criei conta nem fiz login.
> **Legenda:** **[confirmado]** = está em fonte citada (códigos na seção 7). **[inferido]** = dedução minha a partir de indícios. "não encontrado" = procurei e não achei.
> Os códigos **B1/B2** são as evidências que extraí dos bundles públicos do app 2.0 (`app.v2.gather.town`: HTML, `main.js`, 105 chunks e as tabelas de strings `locales/en-US` e `pt-BR`) e do app 1.0 (`app.gather.town`).

---

## Resumo executivo

- O Gather é um **escritório virtual 2D visto de cima** (top-down, em tiles), para equipes remotas. Funciona por **proximidade**: você anda até alguém e conversa. Hoje é **só 2D**. O 2.0 tem duas visualizações do mesmo mundo: **Immersive** (arte detalhada) e **Simplified** (planta abstrata). Elas alternam sozinhas conforme o zoom.
- O 2.0 foi **reescrito do zero** e lançado em set/2025, com cobrança por membro (US$12/membro/mês no anual). A reescrita deixou uma **lacuna de funcionalidades** em relação ao 1.0 que a empresa ainda está fechando em 2026: multi-andar, SSO, app iOS, whiteboards e jogos voltaram ao longo de 2026.
- **Momento da empresa:** em out/2025 um cofundador disse que o Gather entraria em "maintenance mode". Em fev/2026 a empresa virou um **negócio independente sem venture capital**, e o time de IA foi para a Figma. Em abr/2026 assumiu um novo CEO (Sam Smith). Desde então o ritmo é constante, mas focado em paridade com o 1.0 e em "diversão".
- **Pontos técnicos fortes:** SFU próprio sobre **mediasoup**, **Krisp** nativo dentro de um **Electron customizado** com pipeline de áudio em C++, **Phaser 3** para o mundo 2D, transcrição em streaming com **AssemblyAI/Deepgram** e **Smart Objects** via webhooks.
- **Fraquezas principais:** consumo de recursos (recomenda **16 GB de RAM**), confiabilidade de áudio no lançamento do 2.0, lacuna de recursos na migração 1.0 para 2.0, ausência de Linux e de Android, risco de continuidade da empresa e preocupações de "vigilância" (Insights com horas no espaço e status do app em uso).

---

## 1. Visão geral

### 1.1 Empresa e linha do tempo

| Data | Evento | Status |
|---|---|---|
| 2019–2020 | Protótipos de telepresença; YC S19 | [confirmado] (E1) |
| 2020–2022 | O Gather "explode" na pandemia, depois "começa a encolher" | [confirmado] (E1, comentário de cofundador) |
| nov/2021 | Série B de US$50M (Sequoia/Index), avaliação ~US$700M | [confirmado em fonte secundária de concorrente] (R3) |
| jun/2022 | Layoff de cerca de 1/3 da equipe; foco passa a ser trabalho remoto | [confirmado em fonte secundária] (R3) |
| meados de 2025 | Gather 2.0 em beta, gratuito até 15/09/2025 | [confirmado] (busca sobre FAQ 2.0; F7) |
| 15/09/2025 | O 2.0 passa a ser pago por **membro**; o 1.0 segue cobrando por **usuário simultâneo** | [confirmado] (F7, F8) |
| out/2025 | Launch HN do **Grapevine** (IA de conhecimento da empresa). Cofundador: *"The Gather work product is unfortunately going into maintenance mode"*; *"didn't reach the growth trajectory we needed"* | [confirmado] (E1) |
| 09/02/2026 | "A new chapter": Gather vira **empresa independente, sem VC** (*"focused, profitable SMB"*) e o **time de IA vai para a Figma** | [confirmado] (F13) |
| 02/04/2026 | **Sam Smith** assume como CEO (ex-Head of Data). Prioridade: restaurar no 2.0 o que existia no 1.0. *"Experimentamos com IA, mas escolhemos focar no core"* | [confirmado] (F14) |
| mar–abr/2026 | Voltam whiteboards, jogos, dança, go-kart pessoal e reações animadas | [confirmado] (R6, F14) |
| jun/2026 | Pipeline de áudio refeito do zero | [confirmado] (F15) |
| ago/2026 | Smart Objects (Inbox, Bot Status Monitor) | [confirmado] (R6, H11) |
| set–nov/2026 | Volume individual, anúncios do admin, multi-andar, SSO, fantasias de Halloween, **app iOS (11/11/2026)** | [confirmado] (F4) |

Outros números públicos: "5.000+ equipes distribuídas" (F1); usado por "100k+ pessoas no trabalho diário", segundo um cofundador em out/2025 (E1); ~91 funcionários em fev/2026, segundo um concorrente (R3, não verificado).

### 1.2 Posicionamento e público

- **Posicionamento:** "Virtual HQ for Remote Teams". Promete conversar "como se estivessem no mesmo lugar", **sem agendar e sem link de reunião**. Compara-se diretamente com Zoom, Slack e Discord e oferece 33% de desconto no 1º ano para quem vem do Discord (F1).
- **Público:** times remotos e distribuídos de qualquer tamanho: startups, agências e empresas estabelecidas (F1). Casos de uso: conexão do time, reuniões, onboarding de contratados, cultura (F1). A página de pilot recomenda falar com vendas acima de 50 membros (F9).
- **Proposta central do 2.0:** presença ("veja quem está disponível, focado, em reunião"), **aceno** (wave), **ouvir conversas próximas** e entrar com 1 clique, Visualização Simplificada, Modo Mini, mudo por padrão (F1, F3).

### 1.3 Dimensão gráfica

- **2D top-down em tiles.** Renderizado com Phaser 3 em WebGL, com fallback para canvas **[confirmado]** (B1: flags `phaser-fallback-to-canvas`, `TILE_SIZE`, `pathfinding`).
- O 1.0 tem estética pixel art (estilo "Final Fantasy antigo"). O 2.0 tem uma "nova direção de arte" com novos objetos, paredes, pisos e cores **[confirmado]** (F7).
- **Três modos de visualização no 2.0:** **Immersive** (objetos detalhados), **Simplified** (planta minimalista focada em pessoas e conversas; as áreas de coworking aparecem como "salas rosas") e **Auto** (Immersive ao aproximar o zoom, Simplified ao afastar) **[confirmado]** (H1, H14).
- **Não há 3D nem 2.5D isométrico** **[confirmado por ausência]**: não encontrei Three.js, Babylon ou Unity em uso no 2.0. A única ocorrência de "THREE" no bundle é incidental.

### 1.4 Plataformas

| Plataforma | Situação | Fonte |
|---|---|---|
| App desktop (macOS e Windows) | **Recomendado**. É um Electron customizado; versão 1.41.3 em 06/11/2026 | [confirmado] (F11, F15, G3) |
| Navegador | Chrome recomendado; Edge e outros Chromium suportados; navegadores até 5 versões atrás | [confirmado] (B1 string "use Google Chrome, Microsoft Edge, or download the desktop app"; política de navegadores via busca, H24) |
| Linux | **Não suportado.** Sugerem usar o Chrome; o app desktop e o Firefox têm problemas conhecidos | [confirmado] (H10) |
| iOS | App "Gather Remote Work 2.0" lançado em 11/11/2026: reuniões, chat e agenda. **Não dá para andar pelo escritório** (string: "To visit this office, open the link on a Mac or PC") | [confirmado] (F4, F11, B1) |
| Android | "Coming soon" no 2.0 (o 1.0 tinha) | [confirmado] (F7, F5) |
| Extensão Chrome | "Gather Meetings v2": cria reuniões Gather a partir do Google Calendar | [confirmado] (F11, H3) |
| Barra de menus do SO | Preview do escritório e da agenda no menu bar/tray | [confirmado] (F7) |
| Add-in do Microsoft Office/Outlook | Há código de add-in no HTML do app ("Gather add-in won't run in your version of Office"). A integração Outlook do 2.0 está "em andamento" | [confirmado código] (B1) / [inferido: add-in Outlook em desenvolvimento] (F5) |

### 1.5 Modelo de preço e limites (2.0)

| Item | Valor | Fonte |
|---|---|---|
| Plano Essential | **US$12/membro/mês no anual** (−20%); ~US$15 no mensal | [confirmado] (F2; busca na FAQ 2.0) |
| Plano Custom | Sob cotação: SSO, escritórios maiores e customizados, soluções híbridas, trial estendido, **preço regional** | [confirmado] (F2) |
| Trial | 30 dias com todos os recursos, sem cartão | [confirmado] (F2) |
| Plano grátis permanente | **Não existe** no 2.0 | [confirmado] (F2) |
| Convidados | Grátis, mas consomem **Guest Hours**: 3 h/membro/mês (mínimo 30); no trial, 20 h | [confirmado] (H17) |
| Gravação de vídeo | 2 h/membro/mês (mínimo 20); trial 3 h; hora extra "em breve" a **US$2** | [confirmado] (H13) |
| Transcrição/notas de IA | 3 h/membro/mês (mínimo 30); trial 5 h; hora extra "em breve" a **US$0,50** | [confirmado] (H13) |
| Membros simultâneos | "Up to 250" (página de comparação) / "recomendado até 200" (central de ajuda). O 1.0 vai até 500 | [confirmado] (F6, F7) |
| Andares | 5 por espaço (padrão). No código há override de até 100 | [confirmado] (F7; B1 `DEFAULT_MAX_FLOORS_PER_SPACE:5`, `MAX_FLOORS_OVERRIDE:100`) |
| Objetos por andar | 1.500 | [confirmado] (B1 `MAP_OBJECT_LIMIT_PER_FLOOR:1500`) |
| Pessoas na Meeting View | 25 (9 no modo "Efficient") | [confirmado] (H9) |
| Anexos por mensagem | 10 | [inferido] (B1 `maxAttachments:10`) |
| Gather 1.0 | Cobrado por usuários simultâneos; espaços de evento por reserva avulsa ou assinatura | [confirmado] (F2, F1) |

---

## 2. Inventário completo de features

> Salvo indicação, cada linha descreve o **Gather 2.0**. Funcionalidades só do 1.0 aparecem marcadas como "(1.0)".

### 2.1 Mundo, mapa e movimentação

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Mundo em tiles 2D | Mapa top-down em grade (`TILE_SIZE`). Andares, áreas de time, mesas, salas de reunião, áreas de coworking, áreas públicas e lobby **[confirmado]** (B1, H12) | Os tipos de área carregam regras de áudio. A arquitetura do espaço é a regra de privacidade |
| Visualizações Immersive / Simplified / Auto | Duas renderizações do mesmo estado. Auto alterna conforme o zoom **[confirmado]** (H1) | **Zoom semântico**: ao afastar, vira uma planta "limpa" focada em pessoas. Transição com fade (desligável por performance) (H9) |
| Câmera | Clicar e arrastar faz pan; controles de zoom no canto inferior direito; "Reset zoom"; tweening de zoom/pan **[confirmado]** (H1, B1) | Opção "Enable Camera Zoom and Pan Tweening" para máquinas fracas (B1) |
| Movimento por teclado | WASD/setas **[confirmado]** (H2). Para andar pelo teclado, a view precisa estar em Auto (B1) | |
| Clique duplo para andar | Clique duplo no destino. **Pathfinding** automático **[confirmado]** (H1; B1 "pathfinding", "The path is blocked") | Mensagem quando o caminho está bloqueado |
| Go-kart pessoal | Segurar **Shift** enquanto anda: o avatar vira kart e anda mais rápido **[confirmado]** (H2, R6) | Diversão que também acelera o deslocamento em mapas grandes |
| "Walk over" / "Go to" | No cartão de uma pessoa, o avatar anda sozinho até ela **[confirmado]** (H1, H8) | Substitui o teleporte: o trajeto mantém a metáfora espacial |
| Voltar à mesa | **Cmd/Ctrl+D** ou "Walk to my desk" **[confirmado]** (H2, H4) | A mesa é a "casa" do usuário |
| "Take me there" | A partir de lembrete de reunião ou resultado de busca, anda até a sala **[confirmado]** (B1) | Lembrete de reunião com botão "Join" que caminha sozinho (H1) |
| Teleporte livre | Não encontrado no 2.0; o deslocamento é sempre por caminhada automática **[inferido]**. O admin pode "mandar alguém para a mesa" ("{adminName} sent you to your desk") **[confirmado]** (B1) | |
| Seguir alguém (Follow) | "Follow" de outra pessoa, mais **pedido de liderança** ("{name} is asking you to follow them at {área}") e contador "{n} are following you" **[confirmado]** (B1) | Convite contextual com o nome do local (mesa, sala, área de time) |
| Localizar | Tecla **L** ("Show your location"), "Locate on map" para outros **[confirmado]** (H2, B1) | |
| Busca global | **Cmd/Ctrl+K**: pessoas, áreas, salas, eventos ("Find people, areas, and more…") **[confirmado]** (H2, B1) | "Find a meeting room" encontra uma sala livre |
| Mini mapa ambiente | Canto inferior esquerdo: usuários, áreas e **clusters de conversa**, com atividade de microfone **[confirmado]** (B1, H1) | Mostra **quem te ouviria se você ligasse o microfone** (H1). Ótimo contra ansiedade de privacidade |
| Andares | Até 5. Adicionar, duplicar, renomear, excluir; andar de chegada padrão **[confirmado]** (F4, F7, B1) | Som de elevador e chime ao chegar; "Moving to floor…" (B1) |
| Lobby | "Go to lobby" **[confirmado]** (B1) | |
| Plaquinhas de nome | Nameplates acima dos avatares, com auto-ocultação **[confirmado]** (H9, B1) | Desligar melhora a performance |
| Vídeo acima do avatar | Tiles de vídeo pequenos sobre o avatar quando a câmera está ligada **[confirmado]** (B1) | |
| Sons de passos | Footsteps locais **[confirmado]** (H9, B1) | Desligados no modo Balanced e no Efficient |
| Partículas de mídia | Partículas no mapa quando o usuário está ouvindo música (Spotify) ou abre/mergeia um PR (GitHub) **[confirmado]** (B1) | Presença "passiva" do que a pessoa está fazendo |
| Sentar | Avatares ficam nas mesas/cadeiras; sofás iniciam coworking (H14). Não encontrei uma ação explícita de "sentar" | |
| Interação com objetos | É preciso estar perto ("Walk closer to interact with this object"); depois clicar e "Open website" **[confirmado]** (B1, H15). No 1.0: tecla **X** e "activation distance" configurável em tiles (H22, H26) | |
| (1.0) Portais, tiles de spawn e impassable, private areas por tile | Configurados no Mapmaker **[confirmado]** (H22, busca H26) | |

### 2.2 Áudio e vídeo por proximidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Mudo por padrão | Mic e câmera desligados ao entrar; **Cmd/Ctrl+Shift+D** liga os dois **[confirmado]** (H1, H5) | |
| Conversas em cluster | Pessoas que conversam perto formam um **cluster de conversa**. A telemetria separa usuários "strongly connected" (na conversa) e "ambiently connected" (ouvindo de longe) **[confirmado]** (B1 `conversation.strongly_connected_user_count`, `ambiently_connected_user_count`, `cluster_locked`) | O "grupo" se forma por proximidade e fala, sem precisar de sala **[inferido]** |
| Áudio ambiente (ouvir de longe) | Conversas próximas e **destrancadas** são ouvidas em **volume reduzido** **[confirmado]** (B1, H5) | "When a conversation begins nearby you'll be able to hear it at a reduced volume" (B1) |
| Raio da conversa | Configurado pelo admin: **Long = 12 tiles (padrão)** ou **Short = 5 tiles** **[confirmado]** (B1 `{Long:12,Short:5}`, `ambientAudioRange default "Long"`) | A UI usa imagens ilustrativas ("short-range.png", "long-range.png") |
| Decaimento espacial | "Quanto mais perto, mais alto"; o som esmaece ao se afastar **[confirmado]** (F15) | |
| Filtro "abafado" do ambiente | O pipeline ambiente aplica **passa-alta e passa-baixa**, volume e pan, mais **reverb** **[confirmado]** (B1 "AudioFilterPlugin Vol/Pan/Cut", "Ambient reverb audio effect" em H9) | Conversa de longe soa como "do outro lado do escritório" |
| (1.0) Raio e decaimento | Começa a conectar a **5 tiles**, conexão plena a **2 tiles**. Quiet Mode = 1 tile; Ghost Mode = não conecta; DND = ninguém conecta **[confirmado]** (H23) | |
| Auto-listen | Ligado: ouve conversas próximas sozinho, mesmo em segundo plano. Desligado: toca um chime com "Listen in" **[confirmado]** (H4, H5) | Notificações configuráveis de "conversa começou perto" quando você está em outra aba |
| Silenciar ao trocar de aba | Volume ambiente reduzido quando a janela não está em foco; volume separado durante conversa direta **[confirmado]** (B1: "Adjust ambient volume when the window is not in focus", "…when in a direct conversation", "Unfocused Window Volume") | |
| Silenciar uma conversa | Hover na conversa: Listen / Join / Mute **[confirmado]** (H5, B1) | "You can hover on a conversation to mute it in one click" |
| Status Busy silencia tudo | Busy corta todas as conversas próximas **[confirmado]** (H5, H1) | Uma ação para dois efeitos (sinal social + silêncio) |
| Trancar conversa (Lock) | Botão de cadeado no topo e sob os vídeos. Vale **em qualquer lugar**: mesa, corredor, sala **[confirmado]** (H1, H4) | Indicador "Locked - this desk is now private" (B1) |
| Pedir para entrar ("batida na porta") | Área ou reunião trancada: "Would you like to request access/to join?". Quem está dentro aceita ("{responder} let you into the room") **[confirmado]** (B1) | No 2.0 a "porta" é o próprio cadeado da conversa |
| Auto-lock de mesa | Conversas na mesa já começam trancadas (padrão do espaço **ligado**); o admin pode forçar para todos **[confirmado]** (H4; B1 `autoLockDesksDefault: true`) | |
| Mesas abertas × privadas | Mesa aberta: conversas abertas. Mesa privada: só quem está na área da mesa ouve; quem está fora **vê** a conversa mas não ouve **[confirmado]** (H4, H5) | Templates Open / Private / Hybrid (F9) |
| Salas de reunião | Toda conversa ali é privada e pode ser trancada **[confirmado]** (B1) | "Need privacy? Just head over to a meeting room." |
| Áreas de coworking | Sem paredes: qualquer um perto ouve e entra **[confirmado]** (B1) | |
| Toggle global do ambiente | O admin pode desligar o "Allow nearby conversations"; aí só se ouve quem está na mesma área **[confirmado]** (B1) | |
| Anúncio do admin (megafone) | O admin transmite mic e câmera para **todo o andar**, inclusive por cima de reuniões. Quem recebe pode responder ligando o próprio mic **[confirmado]** (F4, H18) | Banner "{nome} is making an announcement. They cannot see/hear you" (B1) |
| (1.0) Spotlight / Broadcast | Tiles de spotlight transmitem para a sala; o admin pode fazer spotlight de alguém pela lista de participantes **[confirmado]** (H22, busca) | |
| Wave (aceno) | Clicar na pessoa e "Wave"; se ela estiver livre, **anda até você**. "Wave back" **[confirmado]** (H1, B1) | Três verbos no cartão da pessoa: **Wave / Meet / Go To** (H8) |
| Meet (pedido de reunião instantânea) | Envia um "meeting request" **[confirmado]** (H1) | |
| "Invite to join me" | Convida a pessoa para onde você está; se aceitar, ela caminha até lá **[confirmado]** (H3) | Avisa "{name} is currently busy/away. Invite anyway?" (B1) |
| Levantar a mão | Raise hand, com **abaixar sozinho depois de falar** (configurável) **[confirmado]** (B1) | "It sounds like you've said something, so your hand has been lowered." |
| Volume por pessoa | Hover no vídeo, ícone de alto-falante, baixar o volume **só para você**. Vale também para screenshares e é **lembrado** **[confirmado]** (F4, B1) | |
| Mutar para todos | Membros podem mutar outra pessoa para todos na reunião **[confirmado]** (H5, H20) | |
| Meeting View × Office View | A primeira foca nas pessoas; a segunda mantém o escritório visível. Pode trocar sozinha ao entrar numa sala com gente **[confirmado]** (H3, B1) | Máximo de 25 pessoas exibidas (H9) |
| Indicadores de rede | "Video paused because your network is slow"; "Others might have trouble seeing or hearing you" **[confirmado]** (B1) | |

### 2.3 Compartilhamento de tela

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Vários compartilhamentos simultâneos | Várias pessoas compartilham ao mesmo tempo **[confirmado]** (H3, F2) | Clicar para ampliar; zoom com +/− (H3) |
| HD | "Use HD screenshare" (com o HD desligado o limite é 1080p) **[confirmado]** (H9, B1) | |
| Otimizar para vídeo | "Optimize for video sharing" **[confirmado]** (B1) | |
| Seletor | Seletor nativo do macOS ou o seletor próprio do Gather **[confirmado]** (B1) | |
| Amarrado à área | O compartilhamento para sozinho quando você sai da área onde começou **[confirmado]** (B1) | Evita vazar a tela pelo escritório |
| Telas no mundo | Não encontrado no 2.0: a tela aparece no layout de vídeo, não num objeto do mapa | |
| Áudio do sistema | Não encontrado | |
| Anotação na tela | Só no 1.0 ("Screen annotations" ✅ 1.0, ❌ 2.0) **[confirmado]** (F7) | |
| Screenshot | "Take screenshot" de tela ou janela; aparece no fluxo de "Report an issue" **[confirmado]** (B1) / [inferido: uso em feedback] | |

### 2.4 Qualidade de áudio

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Supressão de ruído | **Krisp**. No navegador roda em WASM; no desktop roda **nativo, em processo próprio** **[confirmado]** (F15; B1 `krisp_wasm_only`, "Krisp Native") | Níveis de modelo médio e alto (B1) |
| Rebaixamento automático | Com a máquina sobrecarregada: "Noise reduction is temporarily off… turns back on automatically" **[confirmado]** (B1) | Degradação comunicada ao usuário, não silenciosa |
| Cancelamento de eco | "Reduce echo" **[confirmado]** (H5) | |
| AGC | "Adjust mic volume automatically", rodando depois do Krisp **[confirmado]** (H5, F15) | |
| Pipeline nativo | Pós-processamento migrado de JS para **C++ dentro de um Electron/Chromium customizado**, num utility process via IPC. Threads registradas no **MMCSS** do Windows **[confirmado]** (F15) | Corrigiu estalos e congelamentos causados pelo **EcoQoS do Windows 11 25H2** (F15) |
| Codecs | Opus com DTX; VP8/VP9/H.264/AV1 e SVC (`scalabilityMode L3T3`); simulcast **[confirmado: referências no código]** (B1) / [inferido: codecs efetivamente negociados] | |
| Métrica de qualidade | Nota de 1 a 5 estrelas no fim da chamada; notas baixas caíram 50% desde o lançamento **[confirmado]** (F15) | |
| Teste de rede | UDP direto e TURN UDP/TCP via **Cloudflare**; diagnóstico de firewall com instruções para TI **[confirmado]** (B1) | "Your VPN or firewall may cause issues" |

### 2.5 Chat e comunicação assíncrona

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Chat principal | Aba Chat com canais públicos e privados, DMs, grupos, threads **[confirmado]** (H6, F2) | Lançado no 2.0 como "Gather Chat" |
| Threads | Respostas em thread com "Also send to channel" e "Also send as direct message" **[confirmado]** (B1) | |
| Formatação e menções | Markdown, blocos de código, citação, listas; `@pessoa` e `#canal` **[confirmado]** (H6) | |
| Reações e anexos | Reações com emoji; anexos (cerca de 10 por mensagem) **[confirmado]** (H6) / [inferido: limite] | |
| Busca | Busca em todas as mensagens com filtro por canal e remetente; quick actions **[confirmado]** (H6, B1) | |
| Edição e exclusão | Editar; "Delete message for everyone"; "Copy link to message" **[confirmado]** (B1) | |
| Notificações | Por canal: todas / menções / nada; silenciar sons durante reuniões **[confirmado]** (B1) | |
| Nota pessoal | "Chat with yourself": "your space to write, plan, and collect… to-dos, links, files" **[confirmado]** (B1) | |
| Webhooks de entrada | Endpoint `/spaces/:spaceId/chat/hooks/:token`; UI "Create Webhook / Copy Webhook URL" **[confirmado]** (B1) | |
| Chat de reunião | Efêmero: apagado no fim da reunião, mas fica nos "artefatos" da reunião **[confirmado]** (H6, B1) | |
| Chat de proximidade | Digitar **/** abre uma mensagem transitória: balão sobre o avatar mais uma janelinha com as 5 últimas. Some depois de pouco tempo **[confirmado]** (H6, H2) | "{name} mentioned you nearby" (B1) |
| Retenção | Mensagens indefinidas (até excluir o canal); "retention limits and export" estão no roadmap **[confirmado]** (H6, F5) | |
| Feed de atividade | "Recent activity" **[confirmado]** (F3, F7) | |
| Quadros brancos | Objeto embutido do **Eraser** (eraser.io), de parede ou de pé; persiste até ser apagado; vale trocar a URL por outro app **[confirmado]** (H16, F10) | "Always-on whiteboards": é só chegar e usar, sem agendar (R6) |
| (1.0) Bilhetes na mesa | Deixar um "presente com bilhete" na mesa de alguém **[confirmado]** (H22) | O 2.0 planeja "bilhetes em aviões de papel" (F14) |

### 2.6 Presença e status

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Status Active / Busy / Away | Clicar na foto e escolher. Atalhos **Cmd/Ctrl+O / I / U** **[confirmado]** (H1, H2) | **Away remove o avatar do escritório** (H1) |
| Status personalizado | Emoji + texto (com limite de caracteres) + "Clear status after…" **[confirmado]** (H7, B1) | |
| Smart Status | Pelo Google Calendar, sugere "Lunch", "Focus time" e "Personal appointment" a partir do título do evento **[confirmado]** (H7) | |
| Auto-busy em reunião externa | Detecta link de Zoom/Meet no calendário, marca Busy e **move o avatar para uma sala vazia**. Quem está na mesma chamada externa vai para a mesma sala **[confirmado]** (H7) | Notificações "Join next meeting", "Return to Gather" (B1) |
| App Status | Ícone do app em uso ao lado do nome: Cursor, Figma, Notion, Slack, Spotify, Zoom, VS Code, GitHub, **ChatGPT, Claude**… Opt-in por app, só no desktop **[confirmado]** (H7; B1 lista de apps) | |
| Mesa como base | "Your desk is your home base"; "At their desk"; estar ou não na mesa sinaliza disponibilidade **[confirmado]** (H4, B1) | |
| Mic/câmera desligam ao trocar de app | "Automatically turn off mic and camera when switching apps", exceto em reunião ou coworking **[confirmado]** (H5) | |
| Presença no mobile | "Active on mobile" / "Busy on mobile" **[confirmado]** (B1) | |
| Estado no título da aba | "Camera and Mic On - {spaceName}" / "Muted - …" **[confirmado]** (B1) | Feedback de privacidade fora do app |
| Fuso horário | "Select a time zone" no perfil **[confirmado]** (B1). Horário de trabalho: não encontrado | |
| (1.0) Availability | Active / In Focus / Do Not Disturb, alterando o áudio recebido **[confirmado]** (H22) | |
| Insights (admin) | Horas no espaço, horas em conversa, mediana de duração das conversas, membros ativos por semana, pico simultâneo, marcos de onboarding, exportação CSV **[confirmado]** (B1). No roadmap, "Conheça melhor a sua equipe" está "em andamento" (F5) | Métricas por membro, como "hours in conversation each member had": ponto sensível de privacidade |

### 2.7 Avatares e customização

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Editor de avatar | Categorias Skin, Hair, Facial hair, Top, Jacket, Bottom, Shoes, Hat, Glasses, Other, Costume, com cores por peça **[confirmado]** (B1) | Aviso de alterações não salvas ao fechar |
| Fantasias de corpo inteiro | O avatar vira bruxa, lobisomem, vampiro, múmia ou fantasma (out/2026) **[confirmado]** (F4) | Sazonalidade como motivo de retorno |
| Reações animadas | Emotes disparam movimento do corpo (aceno, comemoração, risada) **[confirmado]** (R6) | |
| Emotes | Teclas 1–8: 👋 ❤️ 🎉 👍 🤣 👏 💯 🔥 **[confirmado]** (H2) | |
| Dança | Segurar **Z** **[confirmado]** (R6) | |
| Aplauso emergente | "Quando gente suficiente bate palma, dança ou joga confete ao mesmo tempo, rola aplauso audível" **[confirmado]** (B1) | Feedback coletivo, não individual |
| Foto de perfil | Opcional; o admin pode desativar **[confirmado]** (B1) | |
| Personalização de mesa | Decorator: trocar mesa e cadeira, adicionar objetos e cores **[confirmado]** (H4) | |
| Sprites | Servidor dedicado `sprite.v2.gather.town` **[confirmado]** (B1) / [inferido: composição de spritesheet no servidor] | |
| Pets | Existiam no 1.0; "voltam aprimorados" (roadmap "em breve") **[confirmado]** (F5, F6) | |

### 2.8 Editor de mapa, builder, objetos interativos e embeds

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Gather Studio | Editor de planta, **só para admin**: arrastar e soltar salas, mesas e áreas; redimensionar empurrando vizinhos; copiar, colar, desfazer; catálogo de salas e áreas; carpete e paredes **[confirmado]** (H12, F8) | "Nothing goes live until you Publish" (B1) |
| Publicação | Rascunho e "Publish" sobrescreve a versão ativa **[confirmado]** (H12, B1) | Fluxo seguro para experimentar |
| Edição exclusiva | **Só um admin no Studio por vez**; quem abre depois pode "tomar" a sessão e expulsar o anterior **[confirmado]** (H12, B1) | Ponto fraco: sem colaboração simultânea |
| Templates | Layout (Open/Private/Hybrid), tema, tamanho, número de mesas **[confirmado]** (F9, B1) | |
| Cores de piso | 22 cores por padrão de piso (mai/2026) **[confirmado]** (R6) | |
| Grade e carimbo | "Snap object to grid", "Stamp multiple objects", seleção múltipla **[confirmado]** (B1) | |
| Andares | Adicionar, duplicar, excluir; andar de chegada padrão **[confirmado]** (B1, F4) | |
| Limite de objetos | 1.500 por andar, com medidor "objects used" e aviso "Too many objects can slow down Gather" **[confirmado]** (B1) | |
| Decorator | Para membros: "400+ objetos"; coleções sazonais (Diwali, Día de los Muertos, Halloween, outono, Passover, industrial, pedidos da comunidade como coxinha e campfire) **[confirmado]** (F3, F4, R6) | Lançamentos frequentes de objetos mantêm o engajamento |
| Desk Manager | O admin atribui mesas por e-mail ("Invite with desk"). A mesa fica reservada até o convite ser aceito. "Publish desk assignments" notifica as pessoas **[confirmado]** (B1, H4) | |
| Upload de objetos e logos | **Ainda não** no 2.0 (roadmap "objetos personalizados"); o 1.0 permite **[confirmado]** (H12, F5, F7) | |
| Mapa customizado (imagem) | Só no 1.0 **[confirmado]** (F7) | |
| Objetos interativos | Site embutido (URL em iframe), whiteboard, jogos, GitHub Dock, Gong **[confirmado]** (H21) | Menu do "globo" na barra da reunião lista os objetos da sala e permite "Remove for all" (H21) |
| Smart Objects (webhooks) | Objetos com estado vindo de **webhooks HTTP assinados** (SDK `@gathertown/webhook-object-sdk`). Presets: **Lightbulb** (3 cores), **Inbox** (12 níveis de pilha de papel), **Bot Status Monitor** (5 estados) **[confirmado]** (H11, G4) | Botão "Copy prompt" gera um **prompt pronto para IA** montar a integração (H11) |
| API keys e assinatura | Gerar e revogar API keys; signing secret por objeto; rate limit por espaço **[confirmado]** (H11, B1) | |
| (1.0) Mapmaker | Tiles de efeito (impassable, spawn, portal, private area, spotlight), imagens de fundo e frente, 900+ objetos, upload de objetos, interações (site, imagem, vídeo, nota, external call), "activation distance" **[confirmado]** (H22, H26, F6) | |
| (1.0) API HTTP e mods | Gather HTTP API e "mods" (exemplos no GitHub) **[confirmado]** (G1) | |

### 2.9 Jogos e social

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| 9 jogos embutidos | Codenames/Codewords, Dominion, Draw Battle, Golf Royale, GuessMe!, One Night Ultimate Werewolf, Set With Friends, Tetris, Top Four. São objetos com iframe de terceiros **[confirmado]** (H15, H21) | Você joga e conversa por voz ao mesmo tempo |
| Gong | Chegar perto e bater. Toca som e notificação para quem está na área "e ao redor" **[confirmado]** (H21, B1) | "You have to be near the gong to strike it" |
| Go-kart | Shift + mover **[confirmado]** (H2) | |
| Confete, dança, aplauso | Ver 2.7 **[confirmado]** | |
| Música na sala de reunião | Playlists Soft Ambience / Lofi Chill / Simple Energy; todos na sala ouvem **[confirmado]** (H3) | |
| Spotify | Mostrar o que está tocando; **Spotify Jam** em sessões de coworking **[confirmado]** (F10, H14) | |
| Minijogo de espera | Strings "Game over with {score} points. Press Space to play again" e flags `mini_game_guest_check_in` / `mini_game_meeting_view` **[confirmado no código]** (B1) | [inferido] Minijogo enquanto o convidado espera ser admitido ou enquanto a reunião não começa |
| Planejado | Pets, "paper airplanes", "playing catch" **[confirmado]** (F14, F5) | |
| (1.0) | Pets, go-karts, xadrez e outros jogos, eventos e conferências **[confirmado parcialmente]** (F6, H22) | |

### 2.10 Reuniões

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Agendamento | Extensão Chrome: no Google Calendar, "Make it a Gather Meeting" gera o link para uma sala livre (ou escolhida) **[confirmado]** (H3, H1) | A sala precisa de nome e capacidade definidos no Studio (H12) |
| Realocação automática | Se a sala estiver ocupada, outra é escolhida e o usuário é avisado **[confirmado]** (B1) | |
| Calendário embutido | Visão da agenda; próximos eventos no cartão da pessoa **[confirmado]** (F7) | Microcopy: "No meetings today. Suspiciously peaceful." (B1) |
| Lembrete e chegada | Notificação antes da reunião; "Join" faz o avatar andar até a sala **[confirmado]** (H1) | "Let them know you're running late" (B1) |
| Reserva de sala | Contagem "Meeting reservation ending in {time}"; "Start next meeting early in the same room"; ao esvaziar a sala, "End meeting so the room becomes available" **[confirmado]** (B1) | Gestão de salas como num escritório físico |
| Link para convidados | "Meeting Link" na People List. O convidado entra sem conta e cai direto na Meeting View **[confirmado]** (H3, H17) | Funciona em Calendly e HubSpot (H17) |
| Trancar a reunião | Quem está no convite do calendário entra sozinho; os demais pedem para entrar **[confirmado]** (H3) | |
| Gravação de vídeo | Membros e admins. Acesso só para **quem estava presente no início**. Download **[confirmado]** (H13) | Banner "{user} is recording video and AI notes" (B1) |
| Transcrição ao vivo | Painel "Transcript will appear as people speak" **[confirmado]** (B1) | Funciona como legenda ao vivo |
| Notas de IA | Resumo, notas, **action items**; "Meeting Memo" enviado por e-mail aos convidados do evento ou a quem estava presente; feedback "Was this summary accurate?" **[confirmado]** (H13, B1) | "Replay and edit a meeting memo" (B1) |
| Extração de tarefas | "Meeting ended. N tasks were extracted", via callback do Grapevine **[confirmado]** (B1) | |
| Idiomas de transcrição | 19, **incluindo pt-BR** **[confirmado]** (B1) | |
| Webhooks de reunião | "Fires when a meeting ends" / "when transcript processing is complete" **[confirmado]** (B1) | |
| Coworking sessions | **Focused** (mic bloqueado, timer), **Pomodoro** (mic desligado no foco e ligado nas pausas), **Freeform**. Iniciadas nos sofás; notificam ninguém / todos os Active / a área do time **[confirmado]** (H14) | "Unmuting is not allowed while in focused coworking" (B1) |
| Outlook | Em andamento no 2.0 (o 1.0 tinha) **[confirmado]** (F5, F7) | |

### 2.11 IA

| Feature | Como funciona | Situação |
|---|---|---|
| Notas, resumo e action items de reunião | Ver 2.10. Cota de horas de transcrição | **[confirmado]** (F2, H13) |
| Transcrição em streaming | AssemblyAI (Universal streaming) e Deepgram (Nova-3) via WebSocket direto do cliente | **[confirmado]** (B1) |
| LLM do resumo | Prompt interno ("Generate Meeting Memo Prompt"). **Provedor não encontrado** | não encontrado |
| Gather AI / Grapevine | "Ask Gather AI anything…": respostas **com citações** a partir de Slack, GitHub, Notion, Google Drive e reuniões do Gather. Também funciona como bot no Slack. Usa créditos | **[confirmado no código]** (B1, E1) / [inferido: provavelmente descontinuado ou legado, porque o time de IA foi para a Figma (F13), o CEO disse que vão "focar no core" (F14) e a página de preços atual não cita o recurso (F2)] |
| Grapevine open source | Repositório público "self-hostable realtime unified context system" (Python, MIT) | **[confirmado]** (G1) |
| Smart Objects para agentes de IA | Bot Status Monitor mostra o estado de agentes (ChatGPT/Claude): ok, precisa de input, erro | **[confirmado]** (H11) |
| Prompt de integração | "Copy prompt" do Smart Object gera um prompt para uma IA escrever a integração | **[confirmado]** (H11) |
| "Touch up my appearance (beta)" | Suaviza a aparência no vídeo | **[confirmado]** (H9, B1) |
| Fundo de vídeo | Blur e efeitos de fundo com segmentação **MediaPipe** (selfie segmentation) | **[confirmado: referências]** (B1) |
| Gather MCP | Expor o contexto do escritório para ferramentas de IA via servidor MCP | **[confirmado: roadmap "em andamento"]** (F5) |

### 2.12 Integrações

| Integração | O que faz | Fonte |
|---|---|---|
| Google Calendar | Lembretes, próximo evento no perfil, Smart Status, auto-busy, agendamento | [confirmado] (F10, H7) |
| Extensão Chrome (Gather Meetings v2) | "Make it a Gather Meeting" no Google Calendar | [confirmado] (F11) |
| GitHub | App da organização + OAuth pessoal; **GitHub Dock** com PRs recentes; partículas no mapa quando abre ou mergeia PR; PRs no perfil | [confirmado] (F10, B1) |
| Spotify | Status "ouvindo agora" e Spotify Jam em coworking | [confirmado] (F10) |
| Eraser | Whiteboard embutido | [confirmado] (F10, H16) |
| Live App Status | Ver 2.6 | [confirmado] (F10) |
| Jogos online | 9 jogos | [confirmado] (F10) |
| Smart Objects | Webhooks e API keys para "quase qualquer ferramenta" (Linear, PagerDuty, Datadog, CI/CD…) | [confirmado] (H11) |
| Webhooks de chat e de reunião | Entrada no chat; eventos de fim de reunião e de transcrição | [confirmado] (B1) |
| Outlook | Em andamento | [confirmado] (F5) |
| Slack | Só no 1.0; no 2.0 apenas o bot do Grapevine | [confirmado] (F7, B1) |
| Agendadores (Calendly, HubSpot) | Colando a URL de convite no campo de local | [confirmado] (H17) |
| Gather MCP | Planejado | [confirmado] (F5) |

### 2.13 Admin, segurança e privacidade

| Feature | Como funciona | Fonte |
|---|---|---|
| Papéis | **Admin / Member / Guest**, com matriz de permissões (Studio e Desk Manager só para admin; convidado não tem chat permanente, gravação nem mesa) | [confirmado] (H20) |
| Convites | Por e-mail ou link (membro/convidado); "reset invite links"; membro convidando membro (desligado por padrão); limite diário de convites | [confirmado] (B1) |
| Associação por domínio | Quem se cadastra com o e-mail da empresa vira membro automaticamente | [confirmado] (B1) |
| Acesso de convidados | Allowed / Meeting invites only / Disabled; check-in obrigatório com um membro online; acesso dura **até 12 h** | [confirmado] (B1, H17) |
| SSO | SAML 2.0 / OIDC (Okta, Azure, Google, OneLogin) via **WorkOS**; verificação de domínio por TXT; força o uso de SSO (admins isentos em caso de erro de configuração). **Só no plano Custom** | [confirmado] (H19, F4) |
| SCIM | **Não suportado** | [confirmado] (H19) |
| Login | Google, Apple, e-mail com código (Firebase Auth) | [confirmado] (B1) |
| Acesso do suporte | "Let support team access your space for troubleshooting" (opt-in) | [confirmado] (B1) |
| Auditoria | Contrato de API `admin.auditEvents` | [confirmado no código] (B1) / UI não encontrada |
| Toggles do espaço | Áudio ambiente, raio, canais, DMs, chat em reunião, chat de proximidade, Smart Objects, anúncios, transcrição, resumos de IA, auto-lock de mesas | [confirmado] (B1, schema `SpaceSettings`) |
| SOC 2 Type II | Relatório no Trust Center | [confirmado] (F12) |
| GDPR | Empresa americana; GDPR "indireto" como processadora via DPA com SCCs; diz que está "implementando medidas" para os cookies do site | [confirmado] (F12) |
| LGPD | **Não mencionada** | não encontrado |
| Criptografia | Em trânsito e em repouso. **Sem E2EE no 2.0** (o 1.0 tem código de E2EE do LiveKit) | [confirmado] (F12) / [inferido: sem E2EE no 2.0] (B1/B2) |
| Localização de dados | EUA, **Brasil (São Paulo)**, Japão, Alemanha, Singapura, Índia | [confirmado] (F12) |
| Retenção de chat | Indefinida; exclusão por canal; exportação e limites no roadmap | [confirmado] (H6, F5) |
| Plano expirado | O espaço é trancado para quem não é admin, com período de carência | [confirmado] (B1) |

### 2.14 Performance e requisitos

| Item | Detalhe | Fonte |
|---|---|---|
| Hardware recomendado | **16+ GB de RAM**; Apple Silicon ou Intel i5/i7 de 11ª geração em diante (ou i9/Xeon), AMD de 16+ núcleos; GPU com 4+ GB de VRAM (ou Iris Plus) | [confirmado] (H10) |
| SO | macOS 13+, Windows 10+ | [confirmado] (H10) |
| Modos de performance | **Quality** (60 fps), **Balanced** (30 fps), **Efficient** (25 fps, 9 vídeos, sem reverb, sem animações, sem HD). Também existe a string "Power Saver" | [confirmado] (H9, B1) |
| Ajuste automático | Muda de modo sozinho com CPU alta, calor ou bateria baixa; avisa ("We have temporarily switched you to a lower Performance Mode") e restaura | [confirmado] (H9, B1) |
| GPU | Toggle "Use your computer's graphics card" | [confirmado] (B1) |
| Otimizações de render | Culling de objetos fora da tela, cache de render list, repack de atlas, pathfinder compartilhado, Phaser desmontável em background | [confirmado: flags] (B1) |
| Telemetria de performance | Long tasks, memória por processo no desktop, "content trace" para o suporte | [confirmado] (B1) |
| Reconexão | Banners "Some features may not work temporarily. Resolving now…"; reconexão ao game server | [confirmado] (B1) |
| Concorrência | Até 250 (ou 200 recomendados) por espaço | [confirmado] (F6, F7) |

### 2.15 Mobile e acessibilidade

| Item | Detalhe | Fonte |
|---|---|---|
| App iOS (2.0) | Reuniões, chat e agenda; push; **não permite andar pelo escritório** | [confirmado] (F4, B1) |
| (1.0) App móvel | iOS e Android; o avatar entra sozinho na área da conversa; sem movimento livre | [confirmado] (H25) |
| Configuração mobile separada | "Use different settings for mobile" | [confirmado] (B1) |
| Idiomas da UI | Inglês, **Português (pt-BR)**, Japonês, Alemão, Francês | [confirmado] (B1) |
| Teclado | Movimento, status, busca, emotes e mic/câmera por atalho | [confirmado] (H2) |
| Tema | Claro, escuro e sistema | [confirmado] (B1, F3) |
| Movimento reduzido | Indireto: desligar animações de UI e transições no modo Efficient | [confirmado] (H9) |
| Transcrição ao vivo | Serve como legenda | [confirmado] (B1) |
| Leitor de tela e WCAG | Não encontrado | não encontrado |

### 2.16 Onboarding (primeira experiência)

| Etapa | Como funciona | Fonte |
|---|---|---|
| Criação do espaço | Pesquisa inicial (tamanho do time); escolha de layout, tema e tamanho; **nome do escritório definitivo**; até 5 admins colaboradores | [confirmado] (F9, B1) |
| White glove | Oferta de onboarding assistido: "Our LaunchOps team will design your office… in a single 30-minute call"; existe flag específica para a América Latina | [confirmado] (B1) |
| Tour do escritório demo | "Welcome to Gather — Take a tour of the demo office". Roteiro com personagem: "Looks like he's available. Wave at him" → "Great! He waved back. Walk over" → "Click Join" | [confirmado] (B1) |
| Onboarding do membro | Baixar o desktop → link de convite → conectar o calendário → instalar a extensão → achar a área do time e **clamar uma mesa** ("Your desk is ready!") | [confirmado] (F9, B1) |
| Dicas contextuais | "Contextual POI" e checklists; slides de "What's new" no app | [confirmado] (B1) |
| Guia de piloto | Plano de 30 dias com pesquisa de avaliação (4 perguntas de 1 a 5); tours mensais gratuitos | [confirmado] (F9, F1) |
| Métrica de sucesso | Insights acompanha "onboarding milestones" | [confirmado] (B1) |

---

## 3. Stack técnica

| Camada | Tecnologia | Evidência | Status |
|---|---|---|---|
| Linguagem | TypeScript no front e no back | Vaga Staff Infra & Security (2023): "Gather's Application is currently written in Typescript (frontend/backend)" (R7) | [confirmado] |
| UI | **React 19.2** | String "19.2.0" no bundle (B1); README do plaza exige `react ^19` (G2) | [confirmado] |
| Estado | **MobX** + mobx-react-lite; biblioteca própria **plaza** (Presenters, decorators `@ga`, Models/Repos/Services em estilo DDD), compartilhada entre **web e mobile** | B1; G2 | [confirmado] |
| Componentes | Primitivos **Radix UI** | `radix.slottable`, `data-radix-menu-content` (B1) | [confirmado] |
| Validação e contratos | **Zod** (contratos de API tipados no cliente) | B1 | [confirmado]; padrão parecido com ts-rest [inferido] |
| Engine 2D | **Phaser 3** (VERSION "3.80.1"), WebGL com fallback canvas, atlas, culling, pathfinding | B1 | [confirmado] |
| Áudio de efeitos | **Howler.js** (painel espacial para sons de passos, gong e similares) | `Howler.ctx.createPanner` (B1) | [confirmado] |
| Mídia (cliente) | Módulo próprio `gather-video-client` (SFUClient, RouterClient, métricas) sobre **mediasoup-client** | B1 | [confirmado] |
| SFU | **mediasoup** (fork C++ no GitHub da empresa), pods de SFU em **Kubernetes** (`k8s-sfu-podlabel`); endpoints `wss://router.v2.gather.town` e `wss://sfu.*` | G1, B1 | [confirmado] |
| Gravação | **LiveKit Egress** (webhook `/hooks/livekit/recording/:id/status`, evento "Livekit Limit Reached") | B1 | [confirmado] |
| TURN | **Cloudflare** (UDP/TCP). No 1.0 também Twilio TURN | B1, B2 | [confirmado] |
| A/V no 1.0 (histórico) | Estratégias Gather, GatherV2, **LiveKit Cloud**, **LiveKit self-host**; campos legados de **Agora**; E2EE do LiveKit | B2 | [confirmado] |
| Ruído e eco | **Krisp** (WASM no browser, nativo no desktop), AEC e AGC do WebRTC mais AGC pós-Krisp | F15, B1 | [confirmado] |
| Desktop | **Electron com Chromium modificado**: pipeline de áudio C++ em utility process, MMCSS no Windows; auto-update via electron-builder | F15; arquivos `.blockmap` nos releases (G3) | [confirmado] / [inferido: electron-builder] |
| Mobile | iOS nativo empacotado; provavelmente **React Native** | mediasoup-client com handler react-native-webrtc (B1), fork de `react-native-callkeep` (G1), plaza para "web and mobile" (G2) | [inferido] |
| Tempo real do mundo | **Game server** via WebSocket (`wss://game-router.v2.gather.town`) com *gateway* + *logic server* (atribuição por espaço), estado completo em chunks e depois deltas/patches | B1 (eventos `assignment.*`, `game_state.*`) | [confirmado] |
| API | REST em `api.v2.gather.town/api/v2` com **MessagePack** (`application/x.gather.msgpack`); fork de `msgpack-javascript` | B1, G1 | [confirmado] |
| Transcrição | **AssemblyAI** (universal-3-5-pro / u3-rt-pro streaming) e **Deepgram** (nova-3) por WebSocket direto do cliente; AssemblyAI é o padrão em en, pt e es | B1 | [confirmado] |
| LLM de resumo | Não encontrado. Hooks `/hooks/meeting-summaries/s3`; extração de tarefas via Grapevine | B1 | [confirmado parcial] |
| Segmentação de vídeo | MediaPipe selfie segmentation (TFLite) | B1 | [confirmado: referências] |
| Autenticação | **Firebase Auth** (identitytoolkit), Google Identity Services, Apple; SSO via **WorkOS** | B1, H19 | [confirmado] |
| Infra | **AWS** (`sourcemaps.us-east-1-a.prod.aws.gather.town`, hooks S3); **GCP/Firebase Storage** para assets legados; **Cloudflare** (CDN, TURN, Turnstile no 1.0); Kubernetes | B1, B2, G1 | [confirmado] (AWS como provedor principal: [inferido]) |
| Regiões | EUA, São Paulo, Tóquio, Frankfurt, Singapura, Mumbai | F12 | [confirmado]; servirem também de região de SFU: [inferido] |
| Observabilidade | **Grafana Faro** (web-sdk, react), **New Relic Browser** com session replay (rrweb), **OpenTelemetry**, Prometheus exporters | B1, G1 | [confirmado] |
| Feature flags e analytics | **Statsig**, **Amplitude**, HubSpot; dados vão para **Snowflake** "via Amplitude/OTEL" | B1; comentário no HTML do site (F4) | [confirmado] |
| Pagamentos | **Stripe** | B1 | [confirmado] |
| Site de marketing | **Framer**; CookieYes, GTM | HTML do site (F4, F13) | [confirmado] |
| Engenharia | CircleCI, PRs empilhados (Graphite), Socket.dev, skills de **Claude Code** publicadas ("eng-workflow") | G1 | [confirmado] |

**Arquitetura resumida [inferido a partir das evidências acima]:**

```
Cliente (React 19 + MobX/plaza + Phaser 3)  ── Electron customizado (Krisp nativo, áudio C++)
   │  WebSocket msgpack: game-router → gateway → logic server (estado do espaço, deltas)
   │  REST msgpack + Zod: api.v2.gather.town
   │  WebRTC: router.v2 → SFU mediasoup (K8s) ← TURN Cloudflare
   │  WebSocket direto: AssemblyAI / Deepgram (transcrição)
   └─ Gravação: LiveKit Egress → S3 → resumo (LLM não identificado) → e-mail/artefato
```

---

## 4. Padrões de UX e design que valem estudar

1. **Mudo por padrão com "zumbido de escritório".** O usuário entra mudo, mas ouve conversas próximas abafadas (passa-baixa, reverb, volume reduzido). Isso recria a serendipidade sem expor ninguém. O raio é uma configuração de admin simples, com imagens (curto ou longo), em vez de um número.
2. **O mini mapa mostra quem te ouviria.** Antes de ligar o microfone, você vê no canto inferior esquerdo quem está no seu raio. É o padrão mais importante para a confiança do usuário.
3. **Cadeado universal.** Um único controle (Lock) vale para mesa, corredor e sala, e aparece em dois lugares: topo e sob os vídeos. Quem está fora vê que existe uma conversa trancada e pode pedir para entrar. A "batida na porta" vira um pedido de acesso com resposta.
4. **Três verbos no cartão da pessoa: Wave / Meet / Go To.** Cobrem os graus de intrusão (chamar atenção, convidar formalmente, ir até lá). A pessoa chamada **caminha até você**, o que mantém a metáfora espacial em vez de teleportar.
5. **Zoom semântico (Simplified ↔ Immersive).** O mesmo mundo em dois níveis de detalhe, trocados pelo zoom. **É o modelo mais próximo do 2D↔3D da Infinity.**
6. **Presença automatizada.** O calendário define o status (Smart Status). Reunião externa detectada marca Busy e move o avatar para uma sala. O app em uso vira ícone. Mic e câmera desligam ao trocar de app. Reduz o trabalho de "manter o status em dia".
7. **A mesa como casa.** Cmd+D volta para ela, ao sair de reunião você retorna a ela, e o Desk Manager atribui mesas. Isso dá identidade e localização previsível.
8. **Mini Mode com regras de abertura automática.** A janelinha aparece quando você troca de app estando em conversa ou na mesa. Só dispara se o outro app estiver na mesma tela, para não abrir à toa num segundo monitor.
9. **Degradação de performance transparente.** O app baixa a qualidade sozinho e avisa ("temporarily switched you to a lower Performance Mode", "Noise reduction temporarily off") e depois restaura ("Restored Gather to full performance").
10. **Microinterações coletivas.** O aplauso surge quando várias pessoas reagem juntas. A mão levantada abaixa sozinha depois que você fala. O gong exige proximidade.
11. **Lembrete de reunião que caminha.** O "Join" anda com o avatar até a sala. Há também "Let them know you're running late" e um aviso para encerrar e liberar a sala quando todos saem.
12. **Estado da mídia no título da aba** ("Camera and Mic On - Espaço"). É um feedback de privacidade fora do app.
13. **Microcopy temática no carregamento** ("Watering the plants…", "Refilling coffee cups…", "Sliding the chairs back…"). Reforça a metáfora do escritório.
14. **Smart Objects como "calm technology".** O status de ferramentas aparece como objeto físico: lâmpada vermelha para incidente, pilha de papel para fila de PRs. É informação ambiente que não exige abrir dashboard.
15. **Coworking com modos.** Focused trava o microfone; Pomodoro alterna microfone e foco. A regra social é aplicada pelo sistema.
16. **Notificação de conversa próxima quando você está fora do app,** com auto-listen opcional e mute de um clique ao passar o mouse.

---

## 5. Críticas e pontos fracos

### 5.1 Reclamações reais de usuários

| Tema | Evidência | Fonte |
|---|---|---|
| **Performance e consumo de recursos** | O resumo do G2 aponta "slow performance… lag, crashes, and resource-heavy issues on older devices" em ~20 reviews; relatos de ventoinha alta e vídeo travando em laptops antigos; queda de performance com muitas pessoas conectadas | R1 (resumos do G2 via busca) |
| Requisito de hardware alto | 16 GB de RAM e CPU de geração recente **recomendados** | H10 |
| CPU (alegação de concorrente) | Cosmos afirma 25% de CPU numa sessão com 10 pessoas | R5 (marketing de concorrente) |
| **Áudio quebrado no lançamento do 2.0** | O próprio Gather admite estalos, áudio que congela e acelera e chamadas caindo. Causa raiz: EcoQoS do Windows e GC do JavaScript | F15 |
| Voz sumindo em sala de reunião | "sometimes voice chat is missing… inside meeting room" | R2 (Product Hunt) |
| **Funcionalidades perdidas no 2.0** | Resumo do G2: "missing features in V2, such as interactive tools and limited support for Linux". O Gather recomendava ficar no 1.0 para escritórios grandes, Outlook ou SSO. Eventos e conferências continuam só no 1.0 | R1, F7 |
| Curva de aprendizado | ~16 reviews do G2: "steep learning curve… new to virtual spaces" | R1 |
| Limite para times grandes | Review do G2: "user limits hold back larger teams"; máximo de 250 no 2.0 | R1, F6 |
| Problemas técnicos acumulados | HN: "the technical issues stacked up" (time que abandonou o Gather) | E1 |
| Bugs de edição | "sometimes it has bugs in the edition, so the changes are not saved" (antigo) | R2 |
| Linux | Não suportado | H10 |
| "Always-on" e vigilância | Review: exige "adopt an always-online persona"; risco de virar ferramenta de vigilância; presença constante atrapalha o trabalho profundo | Vulcan Post (busca), R4 |
| Jogos mal integrados (1.0) | HN 2021: "The implementation was buggy and the interaction between the virtual world and games was unintuitive" | E2 |
| Serendipidade forçada | HN 2021: ir à "cozinha virtual" vira um ato deliberado e constrangedor | E2 |
| Continuidade da empresa | "Maintenance mode" (out/2025), spin-out sem VC (fev/2026); concorrentes exploram isso | E1, F13, R3 |

### 5.2 Minha análise crítica (o que falta)

- **Reescrever do zero gerou uma dívida de paridade.** Mais de um ano depois do lançamento, o 2.0 ainda não tem Android, Outlook, upload de objetos e logos, pets, eventos nem Slack. É a lição mais cara do caso.
- **Desktop-cêntrico e pesado.** A melhor experiência exige um Electron customizado com Chromium patchado, o que é caro de manter. No navegador o Krisp roda em WASM, com menos qualidade e mais CPU.
- **Mobile é de segunda classe.** O app só faz reunião e chat: não dá para andar nem ter presença espacial no telefone.
- **Privacidade de dados com pontas soltas.** Não há E2EE nem SCIM, o SSO fica só no plano Custom e a LGPD não é citada (embora existam dados em São Paulo). O Insights mede horas por pessoa.
- **Chat raso perto do Slack** (sem retenção configurável nem exportação até agora), mas com a ambição de substituí-lo.
- **IA recuou.** O Grapevine e o time de IA saíram. Ficaram as notas de reunião com cota, e o "Gather AI" está em limbo.
- **Edição sem colaboração.** Só um admin por vez no Studio, com "takeover".
- **Escala limitada:** 200 a 250 pessoas por espaço.
- **Sem 3D e sem planta realista.** Funciona como metáfora, mas não serve a quem quer imersão ou espelhar o escritório físico.
- **Dependência de muitos terceiros pagos** (Krisp, AssemblyAI, Deepgram, LiveKit, WorkOS, Eraser, jogos). Isso pesa em custo e em governança de dados.

---

## 6. Para a Infinity

> Contexto: escritório virtual **interno**, com **2D e 3D no mesmo mundo**. Não há necessidade de monetizar convidados ou assentos. O foco é adoção, confiança e custo de operação.

### 6.1 O que copiar

1. **Áudio ambiente abafado com raio configurável** (curto/longo em tiles), mudo por padrão, auto-listen opcional e mute de conversa com um clique.
2. **Mini mapa "quem te ouve"** antes de ligar o microfone. No 3D, mostrar o mesmo raio como anel no chão.
3. **Cadeado universal e pedido para entrar** em qualquer lugar (mesa, corredor, sala), com auto-lock opcional das mesas.
4. **Verbos Wave / Meet / Go To** e a pessoa chamada **caminhando** até você.
5. **Presença automatizada:** calendário para status, reunião externa para Busy, mic e câmera desligando ao trocar de app.
6. **Mesa como casa** (Cmd+D), **Desk Manager** por e-mail e **áreas de time**.
7. **Mini Mode/PiP** com as regras de abertura automática.
8. **Presets de performance com degradação automática transparente** (fps, HD, animações, reverb, nameplates).
9. **Coworking Focused/Pomodoro** com regras de microfone aplicadas pelo sistema.
10. **Smart Objects por webhook** (lâmpada de incidente, pilha de PRs, monitor de agente) e um "copiar prompt" para gerar a integração.
11. **Workflow de edição em rascunho e publicação** e limite de objetos com medidor.
12. **Teste de rede e de firewall com instruções para a TI** (essencial em rede corporativa).

### 6.2 O que melhorar

1. **2D e 3D como duas renderizações do mesmo estado.** O Simplified/Immersive do Gather prova o conceito. A Infinity deve ter **uma grade lógica única** (tiles e áreas) servindo os dois renderizadores, com as **mesmas regras de proximidade**: o raio em tiles vale igual no 2D e no 3D. Assim um usuário em 2D e outro em 3D conversam normalmente.
2. **Orçamento de performance mais baixo.** Mirar notebooks de 8 GB com o 2D como "modo leve" padrão e o 3D opcional, com degradação automática para 2D.
3. **Privacidade de verdade (LGPD-first).** Analytics só agregados e anônimos, nada de "horas em conversa por pessoa". App status desligado por padrão. Consentimento explícito e indicador claro de gravação. Retenção configurável.
4. **Integração com o ecossistema interno desde o dia 1:** SSO (Google/Microsoft) e SCIM sem cobrar a mais, Outlook/Teams e/ou Slack, diretório de RH para criar áreas de time e mesas automaticamente.
5. **Transcrição e resumo em pt-BR com governança.** Escolher provedor com dados no Brasil ou self-host (por exemplo, Whisper/faster-whisper interno) e LLM com contrato corporativo.
6. **Edição colaborativa** do mapa (vários editores com CRDT) em vez de lock exclusivo.
7. **Mobile com presença real:** pelo menos uma lista ou mapa simplificado com Wave e Join e a possibilidade de "estar" numa área.
8. **Linux e navegador como cidadãos de primeira classe.** Evitar depender de um Chromium patchado. Preferir AudioWorklet/WASM bem otimizado e um provedor de supressão de ruído com licença viável (ou RNNoise ou DeepFilterNet como fallback).

### 6.3 O que evitar

1. **Reescrever do zero e lançar sem paridade.** O Gather 2.0 passou mais de um ano recuperando o que o 1.0 já tinha. Para a Infinity: evoluir em incrementos e manter os dois modos sempre funcionais.
2. **Investir em "diversão" enquanto o áudio está instável.** O áudio quebrado no lançamento corroeu a confiança. **A/V confiável é o produto**; o resto é enfeite.
3. **Métricas de vigilância por indivíduo** (horas no espaço, horas em conversa). Matam a adoção interna.
4. **Status manual como única fonte de verdade.** Gera status desatualizado. Automatizar com calendário e atividade.
5. **Lock exclusivo de editor** e limites rígidos sem explicação.
6. **Excesso de dependências pagas de terceiros** sem plano de saída (Krisp, ASR, gravação, SSO).
7. **Jogos em iframe "soltos" no mundo.** Integrar com espectadores visíveis ou nem colocar (crítica do HN).
8. **Presença "sempre ligada" obrigatória.** Oferecer um modo foco real que esconda ou desfoque a localização.

### 6.4 Ideias inovadoras inspiradas pelo Gather

1. **"Zoom de dimensão" (2D ↔ 3D contínuo).** Evolução do zoom semântico do Gather: ao afastar a câmera no 3D, o mundo vira planta 2D; ao aproximar no 2D, entra no 3D. Os dois modos são o mesmo mundo, a mesma posição e as mesmas regras de áudio. Cada pessoa escolhe seu modo, e o anel do raio de audição aparece igual nos dois.
2. **Salas com memória.** Cada sala guarda seus artefatos como objetos físicos: whiteboard, última ata com action items, tarefas abertas (Jira/GitHub interno via Smart Objects) e gravações. Entrar na sala é como "reabrir o projeto". As tarefas extraídas da reunião viram um Smart Object "pilha de papel" que esvazia conforme são concluídas.
3. **Agentes de IA como colegas no mapa.** O Gather tem o Bot Status Monitor; a Infinity pode ir além e dar avatar a agentes internos (bot de deploy, assistente de RH) numa "bancada de agentes", com estado visível (ok, precisa de input, erro) e Wave para pedir ajuda. Via MCP, um agente pode responder "quem está disponível do time X?".
4. **Plantão e "porta aberta" agendados.** Status de "porta aberta" por janela de tempo (por exemplo, o gestor das 14h às 15h, ou o especialista do time de dados), visível no mapa como luz na mesa. O pedido para entrar já leva uma mensagem curta ("dúvida rápida sobre X, 2 min"), como uma batida na porta com assunto.
5. **Pulso do escritório, agregado e anônimo.** Em vez do Insights individual do Gather, um mapa de calor agregado por área e horário (sem identificar ninguém) para planejar rituais, salas e eventos híbridos. Fica alinhado à LGPD e não gera sensação de vigilância.

---

## 7. Fontes

**Site oficial e páginas de produto**
- F1: https://www.gather.town/pt/ (home PT, acessada em 15/11/2026)
- F2: https://www.gather.town/pricing
- F3: https://www.gather.town/features
- F4: https://www.gather.town/whats-new-2-0 (changelog; o HTML baixado inclui comentários sobre Snowflake/Amplitude)
- F5: https://www.gather.town/pt/roadmap
- F6: https://www.gather.town/compare
- F7: https://support.gather.town/hc/en-us/articles/40236526012948 (Gather 1.0 vs 2.0)
- F8: https://www.gather.town/migration-guide
- F9: https://www.gather.town/guides/2-0-pilot-guide
- F10: https://www.gather.town/integrations
- F11: https://www.gather.town/download
- F12: https://www.gather.town/security
- F13: https://www.gather.town/blog/new-chapter (09/02/2026)
- F14: https://www.gather.town/blog/meet-ceo-sam (02/04/2026)
- F15: https://www.gather.town/blog/behind-the-fix-audio-2026 (10/06/2026)
- Também consultadas: https://www.gather.town/v2

**Central de ajuda (2.0: support.help.gather.town; 1.0: support.gather.town)**
- H1: https://support.help.gather.town/articles/1982412443-getting-started-guide
- H2: https://support.help.gather.town/articles/6603964827-keyboard-shortcuts
- H3: https://support.help.gather.town/articles/4462418552-meeting-overview
- H4: https://support.help.gather.town/articles/5621269913-desk-overview
- H5: https://support.help.gather.town/articles/7105169617-audio-settings
- H6: https://support.help.gather.town/articles/6847600389-chat-overview
- H7: https://support.help.gather.town/articles/9785009882 (Status & Availability)
- H8: https://support.help.gather.town/articles/7080664654 (Mini Mode)
- H9: https://support.help.gather.town/articles/2155923390-performance-settings
- H10: https://support.help.gather.town/articles/5276834572-system-requirements
- H11: https://support.help.gather.town/articles/1914828565-smart-objects
- H12: https://support.help.gather.town/articles/1963307749-studio-overview
- H13: https://support.help.gather.town/articles/4822083973-meeting-recording-notes
- H14: https://support.help.gather.town/articles/2613002568-coworking
- H15: https://support.help.gather.town/articles/3885883749-embedded-games
- H16: https://support.help.gather.town/articles/9576297537-whiteboards
- H17: https://support.help.gather.town/articles/4769581716-managing-guests
- H18: https://support.help.gather.town/articles/2329068284-announcements
- H19: https://support.help.gather.town/articles/5381966259-sso
- H20: https://support.help.gather.town/articles/3935502038-user-roles-permissions
- H21: https://support.help.gather.town/articles/5512361772-interactive-objects
- H22: https://support.gather.town/articles/3950877146 (Overview of Gather 1.0 Features)
- H23: https://support.gather.town/hc/en-us/articles/15909782743444 (Spatial Audio & Video, 1.0)
- H24: https://support.gather.town/hc/en-us/articles/23924440456852 (Browser Support Policy; conteúdo obtido via resumo de busca)
- H25: https://support.gather.town/hc/en-us/articles/17580563233684 (Gather 1.0 Mobile App; via resumo de busca)
- H26: https://support.gather.town/hc/en-us/articles/15910417713940 e https://support.gather.town/articles/5841805275-activation-distance (1.0 embeds e activation distance; via resumo de busca)
- Também: https://support.help.gather.town/ (índice), https://support.help.gather.town/collections/7097648399-features, https://support.help.gather.town/collections/8203074107-account_management_billing

**Análise de bundles públicos (só leitura, grep; nada executado)**
- B1: https://app.v2.gather.town/ (HTML), `main.6a96afcd47a4155d.js`, 105 chunks `bundle.*.js`, `locales/en-US.1a85b8d5f.json`, `locales/pt-BR.1a85b8d5f.json` (git hash 1a85b8d5f, baixados em 15/11/2026)
- B2: https://app.gather.town/ (HTML) e `main.27098a2769626cb8be39.js` (Gather 1.0)

**GitHub**
- G1: https://github.com/gathertown (lista de repositórios via API pública: mediasoup, k8s-sfu-podlabel, grapevine, plaza, msgpack-javascript, eng-workflow, webhook-objects, react-native-callkeep, sendbird-uikit-react etc.)
- G2: https://github.com/gathertown/plaza
- G3: https://github.com/gathertown/gather-town-desktop-releases (v1.41.3, 06/11/2026)
- G4: https://github.com/gathertown/webhook-objects

**Comunidade, reviews e terceiros**
- E1: https://news.ycombinator.com/item?id=45492564 (Launch HN: Grapevine; lido via https://hn.svelte.dev/item/45492564)
- E2: https://news.ycombinator.com/item?id=25847871 (discussão de 2021 sobre proximity chat)
- R1: https://www.g2.com/products/gather-town-gather/reviews (acesso direto bloqueado com 403; dados obtidos dos resumos de busca)
- R2: https://www.producthunt.com/products/gather-town/reviews
- R3: https://www.sowork.com/blog/gather-vs-sowork-active-development-2026 (**concorrente**, viés)
- R4: https://aiindigo.com/blog/gather-review-does-the-virtual-office-actually-work-in-2026
- R5: https://cosmos.video/virtual-office-comparison (**concorrente**, alegação de CPU)
- R6: https://www.createwith.com/tool/gather-town (agregador de updates)
- R7: vagas: https://app.joinrise.co/jobs/staff-software-engineer-(infrastructure-and-security)-remote-epaj, https://builtin.com/job/engineer/staff-backend-engineer-platform/2096536, https://workatastartup.com/jobs/69428
- Outras consultadas via busca: https://vulcanpost.com/750578/gather-town-review-virtual-meeting-tools-workplace-collaboration, https://www.capterra.com/p/10026880/Gather/ (403), https://spatial.chat/spatialchat-vs-competitors/spatialchat-vs-gather (concorrente)
