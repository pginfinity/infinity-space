# SoWork (sowork.com): engenharia reversa de produto

> Pesquisa competitiva para o escritório virtual interno da Infinity (modos 2D e 3D no mesmo mundo).
> Data da coleta: 15/11/2026. Usei só informação pública: site de marketing, preços, central de ajuda (Notion público), changelog "What's New", glossário, páginas de comparação, reviews (Product Hunt, G2 via trechos de busca) e análise estática, só leitura com grep, do HTML e dos bundles JavaScript públicos de `app.sowork.com`. Não criei conta, não fiz login, não preenchi formulário e não executei nenhum arquivo baixado.
>
> **Legenda:** **[confirmado — Fx]** = afirmação com fonte (lista na seção 7). **[inferido]** = dedução minha a partir de evidência indireta. **[inferido — flag `feat_x`, F45]** = existe uma feature flag com esse nome no bundle de produção. Isso prova que o código existe, mas não que esteja liberado para todos. "Não encontrado" = procurei e não achei.

---

## 1. Visão geral

| Item | Resumo |
|---|---|
| **Empresa** | Sophya, Inc. (nome comercial SoWork), incorporada em Delaware em 2018, sede em Boston (867 Boylston St.) **[confirmado — F3]**. Fundadores: Vishal Punwani (CEO), Emma Giles (COO) e Mark Liu (CTO). Eles se conheceram em Harvard em 2018, começaram com um produto de machine learning e montaram o protótipo do escritório virtual na pandemia **[confirmado — F3]**. O nome antigo era "Sophya": o HTML do app ainda declara `twitter:domain = sophya.world` e os pacotes internos usam o escopo `@sophya` / `@sophya-mono` **[confirmado — F43, F44]**. |
| **Posicionamento** | "The Virtual Office for Teams and AI Agents". Promete trocar ferramentas espalhadas por um lugar só: "No scheduling, no links, no fuss" **[confirmado — F1]**. Na página de fatos se descreve como "AI-powered Smart Virtual Office" **[confirmado — F3]**. Em 2026 o marketing puxou forte para IA: memória de reuniões, MCP, API e agentes de IA como "colegas" dentro do escritório **[confirmado — F1, F2, F5]**. |
| **Público** | Times remotos e híbridos, startups, empresas de tecnologia e serviços profissionais **[confirmado — F3]**. Os depoimentos vêm de agências e startups pequenas (Hite Digital, CTO Labs, Rocket Takeoffs) **[confirmado — F1]**. Os cases citam Pencil, um time da Microsoft, NetEase e BY Venture Partners **[confirmado — F3]**. O app tem 4 idiomas: inglês, espanhol, francês e **português do Brasil** **[confirmado — F3]**. Também há sitemap pt-BR do site **[confirmado — F47]**. |
| **Dimensão visual** | **2.5D isométrico**: assets 2D desenhados em perspectiva isométrica, com estética de "life-sim" no estilo The Sims **[confirmado — F30, F4]**. Há três níveis de visualização: **World View** (cenário completo), **Simplified/Schematic View** (planta esquemática focada em pessoas e reuniões) e **Lite Mode** (sem avatares, só "bolhas" com nome) **[confirmado — F8, F12, F31]**. Há também a opção "No Graphics 2.0", que desliga o motor gráfico **[confirmado — F5]**. **Não existe modo 3D navegável.** |
| **Plataformas** | **Web:** só Chrome é suportado oficialmente **[confirmado — F6, F26]**. **Desktop:** Windows 10/11 e macOS (Apple Silicon e Intel), feito em **Electron** (`isElectron`, `downloadElectron` no bundle) **[confirmado — F6, F45]**. **Mobile:** apps iOS 15+ e Android 7.1+, otimizados para tablet **[confirmado — F6, F18]**, e web mobile para entrar em reuniões e no Simple Mode **[confirmado — F5, set/2025]**. **Extensão Chrome** para agendar no Google Calendar e no Outlook **[confirmado — F25]**. **Linux:** não há app (a FAQ pergunta e não responde) **[confirmado — F6]**. |
| **Modelo de preço** | Freemium por membro, com cobrança por assento (seat-based) desde mar/2026 **[confirmado — F2, F5]**. Trial de 7 dias nos planos pagos, sem cartão **[confirmado — F1, F2]**. O plano anual economiza US$2/mês por pessoa **[confirmado — F27]**. Também há receita com itens cosméticos (DLC de roupas e pets) **[confirmado — F23]**. |

### Planos e limites [confirmado — F2, salvo indicação]

| | Free | Basic | Premium | Enterprise |
|---|---|---|---|---|
| Preço | US$0 | US$5,40/membro/mês | US$12/membro/mês ("Most Popular") | Sob consulta |
| Membros | até 10 | sem limite citado | sem limite citado | ilimitado |
| Reuniões | **limite de 30 min por reunião** | vídeo e áudio ilimitados | ilimitado | ilimitado |
| Gravação/IA | não | 2 usos de gravação | gravações, resumos, transcrições e action items ilimitados | IA com "secure and sandboxed models" |
| Chat | limitado | completo, histórico ilimitado | + integrações de chat (GitHub etc.) | — |
| Outros | — | calendário Google/Outlook, móveis "Deluxe" | analytics de time, desenho na tela, múltiplos compartilhamentos, cancelamento de ruído, "office visits" do time SoWork | SSO + SCIM, mapa custom, rollout assistido, 99,99% de uptime |

- A própria página de preços se contradiz. Uma tabela comparativa lista "2/user/month" e "5/user/month", e há rótulos soltos como "Up to 5", "50", "1,000" **[confirmado — F2]**. A Katmai cita US$5,40 e US$12 **no anual** **[confirmado — F41, F42]**.
- **Yoga Mode:** usuários do Free entram nesse status depois de estourar o limite de reunião **[confirmado — F19]**.
- **Guest passes:** o limite do Premium subiu de 3 para 5 por assento (abr/2026) **[confirmado — F5]**.
- **Cancelamento de ruído no Basic:** liberado para quem deixa um review no G2 (jun/2026) **[confirmado — F5]**. Ver crítica na seção 5.
- **Desconto em DLC:** 15% no Basic e 30% no Premium **[confirmado — F23]**.
- **Pausa de assinatura:** pausar a cobrança pelas configurações (mar/2026) **[confirmado — F5]**.
- Um review de terceiros lista um plano "Pro US$19/mês". O valor não bate com a página oficial e parece desatualizado **[confirmado — F40]**.

---

## 2. Inventário completo de features

### 2.1 Mundo, mapa e movimentação

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Movimento por teclado | Setas ou WASD **[confirmado — F8]** | Há dois estilos de movimento nas configurações: **Diagonal (isométrico)**, que segue o ângulo do mapa, e **Cima/Baixo/Esquerda/Direita** tradicional **[confirmado — F8]** |
| Clique para andar | Clique direito ou duplo clique esquerdo; o personagem anda até o ponto com pathfinding **[confirmado — F8; evento `event:pathfinding` em F46]** | Corrigido em nov/2025 o "smart pathfinding" (os personagens sentavam atrás da mesa) **[confirmado — F5]** |
| Zoom | Roda do mouse ou trackpad **[confirmado — F8]** | **Afastando o zoom até o fim, a tela troca sozinha para a Simplified View; aproximando, volta para a World View** **[confirmado — F8]**. É um "LOD semântico" que vale copiar |
| World View x Simplified View | Toggle no menu de navegação inferior direito **[confirmado — F8]** | A Simplified View mostra "quem está onde e o que está acontecendo" **[confirmado — F8]**. Desde o SoWork 2.0 dá para andar nela **[confirmado — F5, ago/2025]** |
| Barra de navegação | Focus Me (centraliza a câmera em você), Go to My Desk, Change View, Zoom +/−, Change Floor **[confirmado — F8]** | Fica no canto inferior direito, em pilha vertical, para liberar área do mapa **[confirmado — F37]** |
| Atalhos | `Shift+D` ou `Ctrl+D`: ir à mesa. `Shift+F`: andares. `Shift+C`: chat. `B`: Mapmaker. `R`: girar objeto. `E`: interatividade. `Ctrl/Cmd+K`: menu de comandos global. `Cmd+Shift+U`/`Cmd+Shift+V`: mic/câmera mesmo com o app em segundo plano **[confirmado — F8, F10, F11, F5]** | Há uma página "Keybinds" com todos os atalhos e controles de mouse **[confirmado — F5, abr/2026]**. A ajuda se contradiz sobre `Shift+D` e `Ctrl+D` **[confirmado — F8, F10]** |
| Andares (Floors) | Cada mapa é um "Floor". Teleporte instantâneo pela lista de andares; criar a partir de template; renomear, **proteger com senha**, definir andar padrão, excluir **[confirmado — F11]** | O andar padrão define onde novatos e convidados nascem (ex.: um "Lobby Floor") **[confirmado — F11]**. Também dá para duplicar andares para testar layouts **[confirmado — F5, dez/2025]** |
| Teleporte | Pela lista de andares, por objetos "Travel Menu" **[confirmado — F10]** e por "Leave and Return to Desk", que te devolve à mesa depois de uma call **[confirmado — F5, set/2025]** | Convidados são teleportados na entrada (houve bug corrigido) **[confirmado — F5]** |
| Seguir alguém | Não documentado publicamente | **[inferido — flag `feat_follow_person`, F45]** |
| Sentar | Sentar automaticamente em cadeiras e mesas por proximidade (`dispatchSit(..., "proximity")`) **[inferido — flag `feat_auto_sit` e código, F45, F46]** | Também existe "sentar no chão" **[inferido — flag `feat_sit_ground`, F45]** |
| Pular e projéteis | Pulo com projétil, projétil de coração, bola de neve **[inferido — flags `feat_projectile_on_jump`, `feat_heart_projectile`, `feat_snowball`, F45]** | Microinterações lúdicas |
| Gamepad | — | **[inferido — flag `feat_gamepad`, F45]**. A FAQ de jogos pergunta sobre controle Bluetooth e não responde **[F34]** |
| Panorâmica do mapa | Arrastar o mapa, inclusive com o cursor em cima de objetos **[confirmado — F5, dez/2025]** | Flags `feat_pan_with_left_click`, `feat_gesture_panning`, `feat_scroll_zoom` **[F45]** |
| Minimapa e Dashboard Mode | O Dashboard Mode, na aba Home, mostra reuniões em andamento e onde estão os colegas **[confirmado — F5, jul/2026]** | Minimapa **[inferido — flag `feat_minimap`, F45]** |
| "Destravar" personagem | — | **[inferido — flag `feat_unstuck`, F45]** |
| Ponto de spawn | Smart object "Spawn Point" (só um por mapa). A mesa pode ser o spawn se o usuário ativar **[confirmado — F10]** | — |
| Interação com objetos | Selecionar o objeto e apertar `E` ou o ícone de caneta. Desde dez/2025 há interação por hover **[confirmado — F10, F5]** | Os prompts dos objetos abrem na hora, com indicador de carregamento **[confirmado — F5]** |
| Vizinhança (Neighborhood) | Vários mapas e times interagindo num mundo compartilhado, inclusive com organizações parceiras **[confirmado — F32]** | **[inferido — flag `feat_neighborhood` e chunk `NeighborhoodHomePage`, F45, F46]** |
| Escritório público do SoWork | Qualquer pessoa pode visitar o escritório da própria SoWork e falar com o time quando estão online **[confirmado — F1, F26]** | Suporte e vendas acontecem dentro do produto |

### 2.2 Áudio e vídeo por proximidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Quick Chats (proximidade) | Chegou perto de alguém, áudio e vídeo conectam. Você fala enquanto estiver perto e sai andando para longe **[confirmado — F8, F9, F48]** | Exige status "Available". Com "Unavailable" ninguém consegue chegar em você **[confirmado — F19]** |
| Círculo de proximidade | Configuração opcional que desenha o raio de conversa ao redor do avatar (`proximityCircleEnabled`, desligado por padrão) **[inferido — código F46; flags `feat_proximity_circle`, `feat_proximity_circle_default_enabled`, F45]** | O raio em unidades **não foi encontrado** |
| Decaimento por distância / áudio espacial | **Não encontrado.** Não há `PannerNode`, `HRTF` nem `distanceModel` no código do escritório que analisei **[inferido — F46]** | O modelo parece "bolha liga/desliga", não volume por distância **[inferido]**. Um review cita "spatial audio" de forma genérica **[F38]** |
| Meeting Zones | Áreas desenhadas no Mapmaker (categoria Zones). Quem entra conecta áudio e vídeo com todos ali dentro, mesmo longe, e sai andando para fora **[confirmado — F10]** | A zona "brilha" quando você entra **[confirmado — trecho de blog em busca, ver F49]** |
| Zonas trancáveis | "Lockable zones" **[confirmado — F2; flag `feat_mz_lock`, F45]** | — |
| Zonas com gravação automática | "Auto-recording zones" **[confirmado — F2; flag `feat_mz_auto_record`, F45]** | Útil para salas de daily |
| Portas | Smart object "Doors" fecha espaços e os torna privados **[confirmado — F10]** | **"Bater na porta"**, com notificações para vários cenários: 1 pessoa batendo 1 vez, várias vezes, multidão na porta, resposta à batida **[inferido — IDs de notificação em F46; flag `feat_door_knock`, F45]** |
| Meetings (formais) | Botão "+ Meeting": nova reunião focada, ou converter o grupo atual de Quick Chat em reunião. Abre o Focus View com tiles no centro e um card com tópico, convite a colegas e link externo **[confirmado — F9]** | Dá para minimizar os tiles e continuar andando pelo escritório durante a reunião **[confirmado — F9]** |
| Meeting Mode | Layout dedicado a participantes, chat da reunião e conteúdo compartilhado **[confirmado — F5, ago/2025]** | Tile de vídeo novo e ordenação de tiles **[inferido — flags `feat_meeting_new_video_tile`, `feat_meeting_tile_sorting`, F45]** |
| Broadcast | Fala para o escritório inteiro ou para um andar: áudio/vídeo, áudio do navegador e tela. Contagem de 5 s antes de começar; durante, controla volume e vê pedidos para falar **[confirmado — F17]** | Objeto "Broadcast Podium" no mapa (Premium) **[confirmado — F10]**. Possível streaming via Amazon IVS **[inferido — flag `feat_ivs_broadcasts`, F45]** |
| Wave / chamar / tocar | "The Wave" sinaliza um check-in sem urgência ou convida para uma reunião **[confirmado — F5, set/2025]**. "Wave someone over or summon a team" **[confirmado — F1]** | Flags `feat_summon_users`, `feat_ring_user` **[F45]** |
| Moderação | Botão "Mute All" para o host. Opção de desligar mic e câmera ao sair de uma reunião **[confirmado — F5, dez/2025]** | "Ask to mute" e "End for all só para admin" **[inferido — flags, F45]** |
| Capacidade | Infra de vídeo refeita em mar/2026: "50+ participantes", melhor em banda baixa **[confirmado — F5]** | — |
| Vídeo adaptativo | Câmera cai de 540p para 360p sob CPU alta **[confirmado — F5, abr/2026]** | — |
| Fundos de vídeo | Blur e imagem de fundo própria 16:9 (pagos e trial) **[confirmado — F5, F12]** | Feito com `@mediapipe/tasks-vision` **[inferido — F44]** |
| Privacidade automática | Câmera e mic desligam quando o app vai para segundo plano, exceto em reunião **[confirmado — F5, set/2025]** | Mic e câmera desligados no primeiro login do dia **[inferido — flag `feat_turn_off_mic_camera_first_login_of_day`, F45]** |
| Soundboard e sons | Palmas audíveis para o emoji 👏 em reuniões **[confirmado — F5]** | Soundboard de reunião e "speech sounds" **[inferido — flags, F45]** |
| Conexões perdidas | Notificação de "Missed Connection" quando alguém tentou falar com você **[inferido — ID de notificação em F46; flag `feat_missed_connection_notifications`, F45]** | — |

### 2.3 Compartilhamento de tela

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Compartilhar | Em Quick Chat ou Meeting: tela inteira, janela ou aba **[confirmado — F29]** | Clicar de novo no ícone encerra **[confirmado — F29]** |
| Onde aparece | Na área de vídeo da chamada. **Não há telas no mundo**, como TVs em que alguém projeta **[inferido — F29, F9]** | O conteúdo web no mundo vem por objetos com "Embedded Page" **[confirmado — F10]** |
| Múltiplas telas | Várias telas ao mesmo tempo (Premium) **[confirmado — F2, F4]** | — |
| Anotação / desenho na tela | "Screen drawing" (Premium) **[confirmado — F2]** | Zoom e "enhance" na tela compartilhada **[inferido — flags `feat_screenshare_annotations`, `feat_screenshare_zoom`, `feat_screenshare_enhance`, F45]** |
| Áudio do sistema | No Broadcast dá para compartilhar o áudio do navegador **[confirmado — F17]**. Seletor de sistema no desktop **[inferido — flag `feat_screenshare_system_picker`, F45]** | — |
| Codec | VP9 por padrão para telas mais nítidas, com fallback para VP8 em conexão fraca **[confirmado — F5, abr/2026]** | — |
| Mobile | Compartilhar tela pelo app iOS/Android **[confirmado — F5, jul/2026]** | — |

### 2.4 Qualidade de áudio

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Background Noise Cancellation | Inclui cancelamento de eco, redução de ruído e controle automático de ganho. Premium (ou Basic via review no G2) **[confirmado — F20, F5]** | Avisa que "pode impactar a performance" e sugere desligar em máquina fraca **[confirmado — F20, F12]** |
| Provedor de supressão | **Krisp**, via `@livekit/krisp-noise-filter` **[confirmado — F44]**. Se o Krisp falhar, cai para a supressão do navegador **[confirmado — F5, abr/2026]** | — |
| Provedor de mídia | **LiveKit Cloud** (WebSocket para sinalização, WebRTC para mídia, TLS/DTLS) **[confirmado — F13]** | Lista de firewall: `*.livekit.cloud`, `*.turn.livekit.cloud`, `*.host.livekit.cloud`, mais **`*.chime.aws.com`** (Amazon Chime, provavelmente legado) **[confirmado — F13]** |
| Testes de dispositivo | Pré-check de áudio/vídeo redesenhado **[confirmado — F5]**. Teste de microfone e analisador **[inferido — flags `feat_test_microphone`, `feat_microphone_analyzer`, F45]** | Detector de fala com `hark` **[confirmado — F44]** |
| Teste de conexão | Ferramenta "Test Connection" **[confirmado — F26, F5]** usando `@cloudflare/speedtest` / `speed.cloudflare.com` **[confirmado — F44, F46]** | — |

### 2.5 Chat e comunicação assíncrona

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Chat estilo Slack | DMs, grupos, canais, threads, reações, mensagens agendadas, tradução, arquivamento de canal, mensagens de voz, mensagens fixadas, histórico, emoji custom e animado, favoritos **[confirmado — F2]** | A meta declarada é "paridade com Slack/Teams" **[confirmado — F7, página "What's New & Roadmap"]** |
| Salvar e fixar | Mensagens salvas, canais/DMs fixados no topo, abas de itens fixados **[confirmado — F5, fev e jun/2026]** | Recibo de leitura, slash commands, busca v2, popout do chat **[inferido — flags, F45]** |
| Anexos | Cards com tamanho, nome limpo e preview inline de PDF **[confirmado — F5, abr/2026]** | — |
| Chat na reunião | Toolbar "Quick Chat" para ler e mandar mensagem do chat da reunião sem abrir painel **[confirmado — F5, jun/2026]** | O chat da reunião fica salvo junto com a gravação e a transcrição **[confirmado — F5, jul/2026]** |
| Balões sobre o avatar | Status custom e até 2 mensagens empilhadas sobre o personagem, cada uma com seu timer de fade **[confirmado — F5, mai/2026]** | Chat "in-world" leve |
| Quadro de mensagens | "Message board" **[confirmado — F2]** | — |
| User memo | Recados com tipos Urgente, Pergunta, Bloqueado e Olá **[inferido — IDs de notificação em F46; flag `feat_user_memo`, F45]** | — |
| Whiteboards | Quadro nativo (**Excalidraw**) dentro das chamadas e como objeto do mapa **[confirmado — F43, F44, F10]**. Desde nov/2025 ocupa a tela toda fora de reuniões; desenho simultâneo corrigido em jul/2026 **[confirmado — F5]** | — |
| Anúncios | Broadcast em texto, vídeo ou áudio **[confirmado — F4]**. Anúncio de grupo com variantes "gong", "incidente urgente" e "celebração via Zapier" **[inferido — IDs de notificação em F46]** | — |
| Notas | Cores de notas **[inferido — chunk `noteColors`, F45]** | — |
| Tarefas | — | **[inferido — flag `feat_tasks` e chunk `TasksShell`, F45, F46]** |
| Inbox de atividade | — | **[inferido — flag `feat_chat_activity_inbox`, F45]** |

### 2.6 Presença e status

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Status manual | Toggle Available/Unavailable mais mensagem custom. A mensagem persiste ao trocar o toggle **[confirmado — F19]** | Os presets explicam o efeito no hardware: **Online** = "vídeo e mic ligados"; **Busy** = "vídeo e mic inalterados, ainda podem falar com você"; **Unavailable** = "vídeo e mic desligados, ninguém conecta" **[confirmado — F50]** |
| Status automáticos | Idle, Disconnected, Logging In e Yoga Mode (Free) **[confirmado — F19]** | — |
| Idle automático | Timers de inatividade mudam para Away, mutam o mic e desligam a câmera **[confirmado — F5, jun/2026]** | Também reage a ociosidade do sistema e a tela bloqueada **[inferido — flags `feat_away_on_system_idle`, `feat_idle_on_screen_lock`, F45]** |
| "Em reunião" pelo calendário | Eventos do calendário mudam o status para "In a meeting" automaticamente **[confirmado — F1]** | — |
| Atividade de app | Ícone opt-in do app de desktop em foco, com analytics pessoal de foco. O usuário escolhe quais apps aparecem **[confirmado — F1, F5, jul/2026]** | Requer o app desktop **[inferido]** |
| Horários de trabalho | Fuso, dias, horários por dia, vários blocos ("Collaboration Hours") por dia; férias; vários períodos de OOO com "volta em X dias" **[confirmado — F21, F5]** | O perfil mostra hora local, horário do dia e horas restantes online **[confirmado — F21]** |
| Mesa própria | Reivindicar ou receber uma mesa (pin "Ready to Assign"), decorar, voltar com um atalho **[confirmado — F8]**. Permissão "Desk Management"; admin pode desligar a atribuição aleatória **[confirmado — F5]** | A mesa vira convite: "Assign desk" junto com o convite por e-mail **[confirmado — F8]** |
| Work spots | — | **[inferido — flags `feat_work_spots`, `feat_workspot_management`, F45]** |
| Batida na porta | Ver 2.2 | — |
| Mini Mode e Simple Mode | Mini Mode é uma janela compacta para ficar conectado enquanto usa outros apps. Simple Mode é uma interface sem mundo **[confirmado — F1, F5]** | — |
| Indicadores | Ícone de câmera dentro do ponto verde **[confirmado — F5, mar/2026]** | — |
| Home sidebar | Seções reordenáveis: Collaboration Hours, Meetings, Online, Offline **[confirmado — F5]** | — |

### 2.7 Avatares e customização

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Editor de avatar | Cabelo, roupas, acessórios, preview em tempo real, itens DLC **[confirmado — F8]** | O avatar mostra os sinais de presença (ex.: em foco aparece ocupado), e a posição dele indica a atividade: na mesa, na sala da daily, no café **[confirmado — F33]** |
| Wardrobe e DLC | Roupas completas pagas, filtros "DLC" e "My Stuff", trocar a cor de roupas compradas **[confirmado — F23]** | Coleções sazonais: Gundam Mech Suit, Ghostbusters, alien hunter, marinheiro, "girl from the well" **[confirmado — F5]**. Agendador semanal de roupas **[inferido — flag `feat_weekly_outfit_scheduler`, F45]** |
| Pets | Pets que seguem você no escritório; comprar, trocar, presentear **[confirmado — F8]** | Hamster na roda, macaco etc. **[confirmado — F5]** |
| Foto real | Upload de headshot desde fev/2026 **[confirmado — F5]** | Nas gravações, quem está sem câmera aparece com avatar ou foto **[confirmado — F5]** |
| Badges e presentes | Badges grátis no perfil; presentear skins pagas **[confirmado — F22]** | — |
| Rótulos | Visibilidade dos nomes sobre avatares configurável **[inferido — chave `avatarLabels.visibility`, F46]** | — |

### 2.8 Editor de mapa, builder, objetos interativos e embeds

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Mapmaker | Abre com `B` ou pelo ícone de cadeira. 4 categorias: Furniture, Zones, Floors, Walls **[confirmado — F10]** | **Cada categoria tem suas próprias ferramentas**: para apagar parede, é preciso estar na aba Walls **[confirmado — F10]**. Isso é fonte de confusão. Tem música de fundo própria, que dá para mutar **[confirmado — F10]** |
| Catálogo | Desks, Seating, Office Tools, Surfaces, Dividers, Nature, Rugs, Lighting, Seasonal; busca; "milhares de objetos" **[confirmado — F10, F4]** | Itens "Deluxe" ficam pretos quando o trial acaba **[confirmado — F10]** |
| Edição de objeto | Mover, girar (`R`), cor, **imagem (logos)**, texto, duplicar, undo/redo, apagar, apagar rápido (`Alt+clique`), **Protect Asset** (admin trava o objeto) **[confirmado — F10]** | — |
| Smart Objects | Portas, Integrações (Miro, Notion, Google Sheets, arquivos) e Spawn Point **[confirmado — F10]** | — |
| Interatividade por objeto | Embedded Page (abre qualquer página dentro do SoWork), External Link, Travel Menu, Upload File (até 10 MB), Whiteboard, Broadcast Podium **[confirmado — F10]** | Embeds de YouTube via iframe API **[inferido — chunk `YoutubeEmbed`, F45, F46]** |
| Pisos e paredes | Clicar ou arrastar para pintar tiles; trocar materiais **[confirmado — F10]** | Divisórias que parecem paredes ficam em Furniture **[confirmado — F10]** |
| Templates | Templates de andar; seletor de fundo de sala com miniaturas ao vivo **[confirmado — F10, F5]** | — |
| Mapa sob medida | Premium com mais de 30 usuários ganha mapa feito pelo time de design. Migração gratuita de outras plataformas **[confirmado — F32]** | — |
| Mapas da comunidade | Enviar o seu mapa para a comunidade (`POST communityMaps/submit`) **[inferido — F46; flag `feat_community_maps_submit`, F45]** | — |
| Gong | Objeto colocado pelo Mapmaker para comemorar metas **[confirmado — F5, set/2025]** | — |
| Recursos avançados | Seleção múltipla, snap/resize de zonas, zonas hover/pickable, mapas top-down, tags de objeto **[inferido — flags, F45]** | — |
| Apps Framework | "Custom apps and agents" **[confirmado — F2]** | **[inferido — flags `feat_apps_framework*`, F45]** |

### 2.9 Jogos e social

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Arcade | 15 jogos pelo botão "Play a Game" da toolbar de reunião, incluindo **Tank Wars** com lobbies multiplayer e barras de vida **[confirmado — F5, jul/2026]** | Partidas de cerca de 5 min, sem download **[confirmado — F34]** |
| Pomodoro e coworking | Sprints de foco individuais ou em grupo (Premium) **[confirmado — F5, jul/2026]** | — |
| Celebração | Gong, palmas, badges, presentes, recompensas de tutorial **[confirmado — F5, F22]** | XP, awards e baú de recompensas **[inferido — flags `feat_xp_revamp`, `feat_awards`, `feat_reward_chest`, F45]** |
| Polaroids | Foto do grupo **[inferido — flag `feat_polaroids` e chunk `PolaroidView`, F45, F46]** | — |
| Eventos sazonais | Itens de Halloween e Natal ("6 Days of SoWork Xmas") **[confirmado — F5]** | — |
| Eventos virtuais | Há página de produto "virtual-events" **[confirmado — F47]**. Conteúdo não analisado | — |

### 2.10 Reuniões

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Calendário | Google e Outlook; migrar reuniões recorrentes; painel e calendário em página inteira (dia/semana/mês) com "Next Up" **[confirmado — F8, F5]** | Lembretes e "join em 1 clique" **[confirmado — F8]** |
| Extensão Chrome | No evento do Google Calendar ou do Outlook, "Add SoWork Meeting" gera um link para uma sala livre, permite escolher andar e zona, e o link leva o convidado direto para a zona certa **[confirmado — F25]** | Une a agenda ao lugar físico do mundo |
| Reuniões externas | Convidados entram em modo vídeo, **sem acesso ao escritório**, ilimitados **[confirmado — F9, F24]**. Convidados entram sem carregar o mundo do jogo **[confirmado — F37]** | Também há "Office Visits", com Guest Pass, para quem vai circular como avatar **[confirmado — F24]** |
| Gravação, transcrição e resumo | Botão "Record Meeting": escolher resumo IA, gravação e transcrição, mais o idioma. Ícone vermelho durante a gravação; salvar ou descartar **[confirmado — F16]** | Funciona também em Quick Chats **[confirmado — F16]** |
| Meeting Library | Resumo, vídeo, transcrição, renomear, compartilhar/descompartilhar, editar o resumo, PDF, tradução, timestamps clicáveis, busca por frase, coleções, lido/não lido **[confirmado — F16, F5]** | **Privado por padrão.** Convidados nunca acessam **[confirmado — F16]** |
| Widgets de reunião | Timer, agenda, standup, enquete, música **[confirmado — F2]** | — |
| Controle de duração | "Meeting length controls"; 30 min no Free **[confirmado — F2]** | — |
| Pós-reunião | Prompt de feedback, resumo por e-mail, action items para o Zapier **[inferido — flags, F45]** | — |

### 2.11 IA

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Memória de reuniões | Resumos, transcrições e action items **[confirmado — F2, F16]** | Reuniões longas podem levar até 24 h para processar **[confirmado — F16]** |
| Agentes de IA no escritório | "Interaja com agentes de IA dentro do escritório" **[confirmado — F1]** | No motor há um `NpcOrchestrator`: NPCs sentam em mesas, ficam parados na mesa do dono, e aproximar abre um menu ou "app chat" **[inferido — F46; flag `feat_npcs`, F45]**. Ou seja, agentes viram personagens no mapa |
| MCP Server | Premium conecta o SoWork ao Claude ou ao ChatGPT para buscar resumos, ver quem está online, ler chat e mudar status **[confirmado — F5, jul/2026]** | Tela de consentimento OAuth (`McpConsent`) **[confirmado — F46]** |
| API pública e webhooks | Chaves de API, webhooks de saída, endpoints de reuniões, início/fim, busca no chat, indicador de digitação, horas de trabalho **[confirmado — F5, mai e jun/2026]** | — |
| Analytics com "sentimento" | Team Focus Health, Office Presence, Availability, **Team Sentiment** com check-ups semanais; relatório semanal em PDF **[confirmado — F5, F2]** | — |
| Tradução | Tradução de chat e tradução automática do suporte **[confirmado — F2, F5]** | — |
| Provedor de LLM | **Não encontrado.** O manifesto de dependências tem `openai` e há uma flag `feat_whisper` **[inferido — F44, F45]**. O Enterprise fala em "secure and sandboxed models" **[confirmado — F2]** | — |

### 2.12 Integrações

| Integração | O que faz | Fonte |
|---|---|---|
| Google Calendar / Outlook | Sincroniza a agenda, convite com o escritório como local, status automático | **[confirmado — F35, F8]** |
| Extensão Chrome "SoWork Meetings" | Agenda direto em uma zona do mapa | **[confirmado — F25]** |
| Slack | Posta no canal quando você está em reunião no SoWork. O HTML do app tem `slack-app-id` | **[confirmado — F35, F43]** |
| GitHub | Eventos de PR, issues e repositório no chat do escritório | **[confirmado — F35, F5]** |
| Zapier | Empurra eventos do escritório para qualquer app | **[confirmado — F35]** |
| Miro | Quadros Miro dentro do escritório | **[confirmado — F35]** |
| Google Drive | Anexar e compartilhar documentos (jun/2026) | **[confirmado — F5]** |
| Embeds (Notion, Google Sheets, qualquer URL) | Por smart objects | **[confirmado — F10]** |
| API, webhooks, MCP | Ver 2.11 | **[confirmado — F5]** |
| "Em breve" | OneDrive, ClickUp, Asana | **[confirmado — F35]** |

### 2.13 Admin, segurança e privacidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Papéis e permissões | Admin, Teammate e Guest, com toggle por recurso: chat, Mapmaker, convidar, gravar, broadcast, gerenciar mesas, expulsar do escritório **[confirmado — F15]** | No código também existem os papéis `owner` e `contributor` **[confirmado — F46]** |
| Login | E-mail com código, Google, Microsoft, SSO; domínios permitidos; liga/desliga convidados como avatares **[confirmado — F15, F28]** | — |
| SSO e SCIM | SSO no Premium e no Enterprise; SCIM no Enterprise **[confirmado — F2, F36]**. Sessões revogadas na hora quando o usuário sai do IdP **[confirmado — F5, mar/2026]** | MFA delegado ao IdP **[confirmado — F36]** |
| SOC 2 | Relatório sob NDA, pedido pelo suporte **[confirmado — F14]**. Tipo (I ou II) não informado **[confirmado — F36]** | — |
| GDPR / LGPD | "Segue princípios" de GDPR (minimização, retenção controlada) e tem DPA **[confirmado — F36, F1]**. **LGPD: não encontrado** | — |
| Criptografia e residência | TLS 1.2+ e dados em repouso criptografados. Mídia em servidores regionais US/EU/APAC. **Dados do app no Google Cloud NAM5 (EUA)**. Gravações em US-East. Sem escolha de região **[confirmado — F36]** | Relevante para a LGPD (transferência internacional) **[inferido]** |
| Controles de espaço | Andar protegido por senha; Protect Asset; expulsar do escritório; gestão de membros em massa; fluxo de entrada com painel de "join request" **[confirmado — F11, F10, F5, F24]** | — |
| Gravações | Uma única permissão governa gravação, transcrição e resumo **[confirmado — F5, jan/2026]**. Aviso de consentimento ao gravar: **não encontrado** **[confirmado — F36]** | — |
| Monitoramento | Analytics de "employee", atividade de apps, horas de trabalho e ausência com export CSV, sentimento **[confirmado — F5, F2]** | Session replay dentro do app **[inferido — flag `feat_session_recording` e `SessionReplayRecordingStore`, F45]** |

### 2.14 Performance e requisitos

| Item | Detalhe |
|---|---|
| Requisitos mínimos | Windows 10 64-bit, Intel i5 6ª geração ou Ryzen 2000+, 4–8 GB de RAM, **GPU com WebGL2**. macOS 10.15+. iOS 15. Android 7.1. Navegador: só Chrome **[confirmado — F6]** |
| Recomendação | Usar o app desktop, que "reduz a pressão de memória" **[confirmado — F12, F26]** |
| Configurações de performance | **Auto Detect** (recomendado de início), **Lite Mode** (sem avatares nem cenário, só bolhas com nome), **qualidade gráfica** Low/Medium, **FPS** Low/Medium, desligar cancelamento de ruído, desligar blur e fundos **[confirmado — F12, F26]**. **No Graphics 2.0** desliga o motor de vez **[confirmado — F5, out/2025]** |
| Níveis internos de qualidade | `original`/`m0`, `m1`, `m2` (padrão), `m3`, `lite`, `noGraphics`, `schematicOnly`. A densidade de pixels é limitada a 2x (m0–m2) ou 1x (m3/lite). Os modos lite/schematic desligam animações ("motion profile none") **[confirmado — F46]** |
| FPS dinâmico | Limite de FPS sincronizado com o motor; pausa quando a janela está inativa; reduz em reunião **[confirmado — código F46; flags `feat_dynamic_framerate`, `feat_pause_fps_when_inactive`, `feat_downgrade_fps_on_meeting`, `feat_0_fps`, F45]** |
| Robustez | Tratamento de **perda de contexto WebGL2** (citado como comum em certas GPUs Intel), recarregar o motor, aviso de "página descartada" sugerindo o app Electron **[confirmado — F46, F45]** |
| Carregamento | Carga parcial, throttling e indicador de download de assets, assets DLC sob demanda **[inferido — flags, F45]**. Convidados externos entram sem carregar o mundo **[confirmado — F37]** |
| Rede | Endpoints e IPs estáticos para firewall (EU, Índia, EUA); exige WebSockets, HTTPS e UDP **[confirmado — F13]** |
| Limites | 50+ pessoas por chamada **[confirmado — F5]**. Limite por espaço: **não encontrado** |

### 2.15 Mobile e acessibilidade

| Feature | Detalhe |
|---|---|
| Apps iOS/Android | Chat, resumos de reunião, entrar e criar reuniões, calendário, feed de atividade, perfis **[confirmado — F18]**. Compartilhar tela, chat com swipe-up, status em texto, horários e aniversários **[confirmado — F5, jul/2026]** |
| Restrição | **A conta precisa ser criada no desktop antes** **[confirmado — F18]** |
| Mundo no mobile | Versões de mundo e de "andares" no mobile em desenvolvimento **[inferido — flags `feat_mobile_world_v2`, `feat_mobile_floors_view`, F45]**. Web mobile mostra o Simple Mode **[confirmado — F5]** |
| Acessibilidade | Tema claro/escuro **[confirmado — F5]**; respeita `prefers-reduced-motion` (`usePrefersReducedMotion`); navegação por teclado com roving tabindex **[inferido — chunks em F45]**; página de atalhos **[confirmado — F5]**. Declaração WCAG: **não encontrada** |

### 2.16 Onboarding

| Feature | Detalhe |
|---|---|
| Fluxo "move in" | `app.sowork.com/movein`: escolher o escritório (2 min), convidar o time (1 clique), começar **[confirmado — F4]** |
| Checklist e tracker | Checklist "Getting Started" na Home e tracker de onboarding para admins em Team Analytics **[confirmado — F5]** |
| Acesso ao CEO | Mensagem de boas-vindas do CEO no chat, que responde pessoalmente; reporte de bugs via menu ou @Vish **[confirmado — F8, F7]** |
| Suporte no mundo | O escritório público do SoWork tem gente do time para atender ao vivo **[confirmado — F26]** |
| Recompensas de tutorial | **[inferido — `TutorialRewardsStore` e flag `feat_tutorial_directory`, F45]** |
| Indicação | Programa de afiliados e "Creators" pagando por até 12 meses por indicação **[confirmado — F5]** |

---

## 3. Stack técnica

| Camada | Tecnologia | Evidência |
|---|---|---|
| Site de marketing | **Framer** | `generator = Framer` no HTML **[confirmado — F47]** |
| Central de ajuda | **Notion** público em domínio próprio (`help.sowork.com`) | Página "Notion" e API pública do Notion respondendo **[confirmado — F7]** |
| Front-end do app | **React 18 + TypeScript**, **MUI 5** (Emotion/JSS), **MobX**, React Router 5, i18next | Manifesto de dependências embutido no bundle de entrada **[confirmado — F44]** |
| Build | **Vite** com `vite-plugin-wasm`, monorepo **pnpm** (`@sophya-mono/*`), Node ≥ 24, `tsgo` para typecheck, Storybook, Jest | **[confirmado — F44]** |
| Motor do mundo | **Motor próprio "Hephaestus"** (`@sophya/hephaestus` ^86.4.6 e `hephaestus-assets-core`). Roda **em um frame separado**, conversa com a UI React por um "broker" de mensagens, usa **WebAssembly** e **WebGL2** | Tags `hep-renderer` e `hep-version`, timer de carga `wasm`, ação de debug "Unload game engine: Removes the engine frame", `getContext("webgl2")` **[confirmado — F44, F46]**. A linguagem de origem do WASM (C++, Rust) **não foi encontrada**. A flag `feat_bevy` sugere experimento com o motor Rust **Bevy** **[inferido — F45]** |
| Tempo real (A/V) | **LiveKit** (`livekit-client` ^2.23) mais **LiveKit Cloud** | **[confirmado — F44, F13]** |
| A/V legado e experimental | **Amazon Chime SDK** (busca a região de mídia mais próxima em `nearest-media-region.l.chime.aws`, flag `feat_chime_metrics`). **Cloudflare RealtimeKit** (`@cloudflare/realtimekit`, chunk `cloudflare`). Amazon IVS para broadcast (flag) | **[confirmado — F46, F44; IVS inferido — F45]**. Leitura: eles migraram de Chime para LiveKit (a "Next-Gen Video Infrastructure" de mar/2026) e mantêm uma camada que abstrai provedores **[inferido]** |
| Áudio | Krisp (`@livekit/krisp-noise-filter`), `hark` (detecção de fala), `howler` (efeitos), `lamejs` (MP3, provavelmente memos de voz) | **[confirmado — F44; uso do lamejs inferido]** |
| Vídeo | `@mediapipe/tasks-vision` (segmentação para blur e fundo) | **[confirmado — F44; uso inferido]** |
| Dados e realtime | **Firebase** (Auth, Firestore, Remote Config), `socket.io-client` com msgpack, protobuf | **[confirmado — F44, F45]**. A config remota com `minimumFetchIntervalMillis` está no bundle **[F45]** |
| Back-end | "SAGE" (`SAGE_BACKEND_ORIGIN`, `sage-apptypes`), "Gaia" (calendário e integrações), "Polaroid" e "Portraits" como serviços separados; previews em `preview-N.sowork.dev`. Dados no Google Cloud (NAM5) e mídia na AWS | Scripts do `package.json` e trechos do código **[confirmado — F44, F36]** |
| Rich text e colaboração | **TipTap 3** / ProseMirror (chat), **Excalidraw** (whiteboard), `pdfjs-dist`, `html2pdf.js` (PDF de resumos), `ical-generator` e `rrule` (agenda), `react-big-calendar` | **[confirmado — F44, F43]** |
| Pagamentos | **Stripe** (inclusive Stripe Connect para afiliados) | **[confirmado — F44, F45]** |
| Observabilidade e analytics | **Sentry** 7.57, **Mixpanel**, **Amplitude**, **Intercom**, **Meta Pixel**, Microsoft **Clarity** (site), web-vitals | **[confirmado — F43, F44, F47]** |
| CMS e formulários | `@sanity/client`, `@typeform/embed-react` (pesquisas PMF) | **[confirmado — F44]** |
| Desktop | **Electron** (`@sophya/sowork-desktop-lib`), com área de arrastar da barra de título e deep links | **[confirmado — F43, F44, F45]** |
| Mobile | Apps nativos nas lojas (App Store id6451073110, `com.sowork.mobile`). O código detecta `isEmbeddedInNativeApp`, o que sugere WebView em partes do app **[inferido — F18, F45]** | — |
| Tradução interna | `@google-cloud/translate` nos scripts de i18n | **[confirmado — F44]** |

---

## 4. Padrões de UX/design que valem estudar

1. **Zoom como troca de modo (LOD semântico).** Afastar até o fim leva da World View para a Simplified View, e aproximar faz o caminho inverso **[F8]**. Para a Infinity, é o mecanismo natural para alternar entre **3D, 2D e planta**: a câmera se afasta, o mundo "achata" e vira mapa.
2. **Status que explica o efeito no hardware.** Online = "vídeo e mic ligados"; Busy = "inalterado"; Unavailable = "desligados, ninguém conecta" **[F50]**. A pessoa entende na hora o que o status faz com a privacidade dela.
3. **Escada de performance em degraus nomeados.** Auto Detect → qualidade/FPS → Lite (bolhas) → Schematic → No Graphics **[F12, F46]**. Cada degrau tira uma camada de custo e mantém a função social.
4. **Convidado externo sem mundo.** O cliente entra em uma tela de vídeo "estilo Zoom", sem baixar assets **[F9, F37]**. O mundo é para quem é de casa.
5. **Calendário amarrado ao lugar.** A extensão do Calendar aponta para andar e zona específicos, e o link leva a pessoa direto para a sala certa **[F25]**.
6. **Mesa como identidade e âncora.** Spawn na mesa, atalho para voltar, "Leave and Return to Desk" depois da call, mesa atribuída já no convite **[F8, F5]**.
7. **Gravação privada por padrão** com compartilhamento explícito por pessoa **[F16]**.
8. **Menu de comandos global (`Cmd/Ctrl+K`)** para achar colegas, abrir canais, mudar status, anunciar e trocar o fundo de vídeo **[F5]**.
9. **Atalhos globais de mic e câmera com o app em segundo plano** (`Cmd+Shift+U` e `Cmd+Shift+V`) **[F5]**.
10. **Agentes de IA como NPCs sentados em mesas** **[F46]**. Torna o agente "encontrável" no espaço, no mesmo modelo mental das pessoas.
11. **Balões de chat sobre o avatar** com fade independente **[F5]**: comunicação leve e visível no mundo, sem abrir painel.
12. **Suporte e vendas dentro do próprio produto** (escritório público com o time) **[F1, F26]**.

---

## 5. Críticas e pontos fracos

### 5.1 Reclamações reais (com fonte)

| Reclamação | Fonte |
|---|---|
| "Pesado em laptops mais antigos"; faltam integrações com ferramentas de projeto | Product Hunt, michaelkhan **[F38]** |
| Cadeiras giram em direções estranhas; algumas mesas não podem ser atribuídas. O CEO respondeu que estavam reescrevendo o sistema de mesas | Product Hunt, Nicole **[F38]** |
| O visual é "far from real life" | Product Hunt, Shelley Ceridwen **[F38]** |
| O app desktop às vezes mostra tela em branco; onboarding difícil de seguir; "alguns bugs" (corrigidos rápido) | Trechos de reviews do G2 via busca **[F39]** |
| Mudança de política de cobrança de convidados no meio da assinatura | Resumo do Product Hunt citado em busca. O texto do review não estava visível, então **não verificado** **[F38]** |
| Analytics de time descrito como "o bom e o potencialmente sinistro (creepy)" | Trecho de review em busca **[F39]** |
| A estética de jogo seria ruim para uso com clientes | Página de comparação da Katmai, concorrente e enviesada **[F41]** |

A avaliação geral é alta: G2 4,8–4,9 (50 a 111 reviews, conforme a página) e Product Hunt 4,7 (25 reviews) **[F1, F38, F39]**. Há pouca crítica independente.

### 5.2 Análise crítica (o que falta) [inferido]

- **Sem 3D.** É 2.5D com sprites isométricos. Não resolve a ambição de "presença imersiva" e não tem câmera livre.
- **Sem decaimento de áudio por distância.** O modelo é bolha liga/desliga mais zona. Não existe "ouvir de longe baixinho", que dá a sensação de escritório vivo.
- **Sem telas no mundo.** O compartilhamento vive na interface de chamada, não em TVs e paredes do espaço.
- **Só Chrome no navegador**, e o desktop Electron é recomendado para tudo. A conta só pode ser criada no desktop.
- **Monetização que distrai em contexto corporativo**: DLC de roupas e pets pagos, itens "Deluxe" que ficam pretos quando o trial acaba, e **cancelamento de ruído liberado em troca de review no G2**. Esta última é questionável do ponto de vista de integridade de reviews.
- **Expansão desordenada de features**: mais de 300 feature flags, CRM interno, arcade com 15 jogos, afiliados em dezenas de países. A central de ajuda tem várias páginas só com títulos e sem corpo (Desks, Guests, Roadmap) **[F7]**.
- **Vigilância.** App ativo, horas de ausência, "sentimento", export CSV e session replay no app. Isso pede política clara e consentimento, ainda mais sob a LGPD.
- **Residência de dados**: dados do app nos EUA, sem escolha. Para empresa brasileira, isso é transferência internacional (LGPD, art. 33).
- **Preço confuso**: tabelas contraditórias na página oficial **[F2]**.
- **Mapmaker com modos por categoria** (para apagar parede é preciso estar na aba Walls) **[F10]**: armadilha clássica de editor.

---

## 6. Para a Infinity

### 6.1 Copiar

1. **A transição World → Simplified pelo zoom**, levada para 3D → 2D: um mundo só, com renderização diferente conforme a distância da câmera ou a escolha do usuário.
2. **Escada de performance com Auto Detect** e degraus claros (qualidade, FPS, lite, esquemático, sem gráficos), mais **FPS dinâmico**: pausar quando a janela está inativa e baixar durante reunião.
3. **Status com efeito explícito em câmera e mic** e idle automático que muta e desliga a câmera.
4. **Mesa própria como âncora** (spawn, atalho, voltar depois da call) e **andares com andar padrão** (lobby).
5. **Meeting Zones com tranca e gravação automática**, e **portas com "bater"**, com notificações agrupadas por cenário (multidão na porta, quem bate várias vezes).
6. **Gravação, transcrição e resumo privados por padrão**, com compartilhamento explícito.
7. **Menu de comandos `Ctrl/Cmd+K`** e **atalhos globais de mic e câmera**.
8. **Objetos com interatividade configurável** (embed, link, upload, whiteboard, viagem): é o "Lego" que deixa o espaço útil.

### 6.2 Melhorar

1. **Áudio espacial de verdade**: volume por distância e oclusão por paredes e portas, em vez de bolha binária. Manter o "círculo de proximidade" visual como ajuda.
2. **Telas no mundo**: o compartilhamento aparece numa TV ou parede da sala, e também em painel 2D para quem está no modo 2D.
3. **Mapmaker sem modos escondidos**: ferramenta contextual pelo tipo do objeto selecionado, não pela aba.
4. **Analytics agregados por time, nunca individuais por padrão.** Nada de "sentimento" ou app ativo sem opt-in explícito. Isso é requisito de confiança e de LGPD.
5. **Agentes de IA como NPCs**, mas com função clara (ex.: "recepcionista" que leva visitantes à sala, "bibliotecário" que responde sobre reuniões passadas usando a memória interna).
6. **Hospedagem no Brasil ou com escolha de região** e retenção configurável.

### 6.3 Evitar

1. Gamificação paga e cosméticos pagos num produto interno (DLC, pets pagos, itens que ficam pretos).
2. Feature flags e features em excesso sem documentação. Melhor poucas features muito bem acabadas.
3. Dependência de um navegador só e app desktop obrigatório para a experiência boa.
4. Contradições de documentação e preço.
5. Session replay e monitoramento invisível de colaboradores.

### 6.4 Ideias inovadoras inspiradas no SoWork

1. **"Zoom semântico 3D → 2D → planta":** com a mesma posição no mundo, a câmera sobe, o 3D vira 2D top-down e depois uma planta com só pessoas e salas ocupadas. Quem está no 2D e quem está no 3D se veem no mesmo lugar.
2. **"Porta com fila inteligente":** bater na porta cria uma mini fila visível ("3 pessoas esperando") e a pessoa dentro responde com um preset ("5 min", "entra", "manda no chat").
3. **"Mesa viva":** a mesa mostra o status, o horário local e o último resumo de reunião compartilhado. Clicar nela abre o perfil e um botão "deixar recado" (memo assíncrono que aparece quando a pessoa volta).
4. **"NPC de onboarding":** um agente de IA na recepção que conduz o novato por um tour físico (salas, pessoas-chave, onde sentar) e responde perguntas usando a documentação interna.
5. **"Agenda espacial":** o evento do calendário reserva uma sala do mundo; no horário, a sala "acende" e os participantes recebem um "teleportar agora"; ao fim, o resumo fica preso na parede da sala como um "post-it".

---

## 7. Fontes

| ID | Fonte |
|---|---|
| F1 | https://www.sowork.com/ |
| F2 | https://www.sowork.com/pricing |
| F3 | https://www.sowork.com/facts |
| F4 | https://www.sowork.com/product/virtual-office |
| F5 | https://www.sowork.com/whats-new (entradas mensais de ago/2025 a jul/2026, ex.: https://www.sowork.com/whats-new/july-2026-the-sowork-mcp-arcade-games-focused-app-activity , https://www.sowork.com/whats-new/march-2026-next-gen-video-infrastructure-seat-based-billing) |
| F6 | https://www.sowork.com/download |
| F7 | https://help.sowork.com/ (raiz "SoWork 2.0 Help Documentation" e página "What's New & Roadmap"; conteúdo lido via API pública do Notion, só leitura) |
| F8 | https://help.sowork.com/Getting-Started-Guide-21fb2190ba6b81c2aa86f05a57a5d297 |
| F9 | Central de ajuda: "Overview of Meetings" (https://help.sowork.com/21fb2190ba6b81e48a44f882ca21587c) e "Starting & Managing Meetings" (https://help.sowork.com/21fb2190ba6b80d8b6a6d4a7eba69af7) |
| F10 | "How to Customize Your Office with Mapmaker": https://help.sowork.com/26cb2190ba6b803397e2f0eb2594e146 |
| F11 | "Floors: Travel, Create, and Manage": https://help.sowork.com/21fb2190ba6b800ca4b1c8bdf446286c |
| F12 | "Boosting Performance in SoWork": https://help.sowork.com/21fb2190ba6b81f89ec5c0a2ad2413a9 |
| F13 | "VPN & Firewall Access": https://help.sowork.com/2a7b2190ba6b80fcb174dade355c4422 |
| F14 | "SOC2 Compliance & Data Security": https://help.sowork.com/21fb2190ba6b80bd9fb3e5a944d36809 |
| F15 | "Permissions, Privacy, and Security Settings": https://help.sowork.com/21fb2190ba6b8059b988c9f38c4aaeff |
| F16 | "AI Summaries, Recordings & Transcripts": https://help.sowork.com/21fb2190ba6b8024ac49e3594c87ebdf |
| F17 | "Broadcasting in SoWork": https://help.sowork.com/21fb2190ba6b801e8387d797ec0afb3d |
| F18 | "Getting Started: SoWork Mobile App": https://help.sowork.com/21fb2190ba6b80b0b4bfeae4a6f7b790 |
| F19 | "Set Your Status in SoWork": https://help.sowork.com/21fb2190ba6b802cac8bce81272e1e4a |
| F20 | "Background Noise Cancellation": https://help.sowork.com/21fb2190ba6b80969a81c05feae609e9 |
| F21 | "Set Your Working Hours and Vacation Days": https://help.sowork.com/21fb2190ba6b80ff9b7fdbfcb9b1ceec |
| F22 | "Badges and Avatar Gifts": https://help.sowork.com/21fb2190ba6b804f9bc4fd47894b1d4d |
| F23 | "How to Purchase a DLC Outfit": https://help.sowork.com/21fb2190ba6b8092882fe304d6457647 |
| F24 | "How to invite Guests": https://help.sowork.com/21fb2190ba6b8027afc5d08a42187167 |
| F25 | "Schedule/Join meetings - Calendar Chrome Extension": https://help.sowork.com/28db2190ba6b802088d6e71c5159a326 |
| F26 | "Troubleshooting Checklist": https://help.sowork.com/Troubleshooting-Checklist-2a7b2190ba6b8082b4f7e8fcdfc7da61 |
| F27 | "Upgrade Your Team's SoWork Plan": https://help.sowork.com/21fb2190ba6b80708bfcc79e84992561 |
| F28 | "Logging In and Out of SoWork": https://help.sowork.com/21fb2190ba6b806099d6cd2f5caa822f |
| F29 | "How to Share Your Screen in SoWork": https://help.sowork.com/21fb2190ba6b80dcbf06d3f2c8e5fac7 |
| F30 | https://www.sowork.com/glossary/2.5d-isometric-world |
| F31 | https://www.sowork.com/glossary/lite-mode |
| F32 | https://www.sowork.com/glossary/custom-map |
| F33 | https://www.sowork.com/glossary/avatars |
| F34 | https://www.sowork.com/product/team-games |
| F35 | https://www.sowork.com/product/integrations |
| F36 | https://www.sowork.com/blog/sowork-vs-teamflow-security-compliance-2026 |
| F37 | https://www.sowork.com/whats-new/june-july-2025-the-interface-overhaul-simplified-mode |
| F38 | https://www.producthunt.com/products/sowork/reviews |
| F39 | https://www.g2.com/products/sowork/reviews (página bloqueada para fetch, HTTP 403; usei só trechos de resultados de busca) |
| F40 | https://aichief.com/ai-productivity-tools/sowork/ |
| F41 | https://katmaitech.com/compare/katmai-vs-sowork (concorrente, enviesado) |
| F42 | https://katmaitech.com/blog/which-virtual-office-companies-are-still-standing (concorrente, enviesado) |
| F43 | HTML público de https://app.sowork.com/ (análise estática) |
| F44 | Bundle público `https://app.sowork.com/static/js/entry-DDZHE0wU.js` (contém o manifesto de dependências do `package.json`) |
| F45 | Bundle público `https://app.sowork.com/static/js/main-DlK3Ylw2.js` (303 feature flags `feat_*`, nomes de chunks) |
| F46 | Bundle público `https://app.sowork.com/static/js/officeRoutes-CuvqDuni.js` (motor, perf, NPCs, MCP, notificações) |
| F47 | HTML de https://www.sowork.com/ (gerador Framer) e sitemaps https://www.sowork.com/sitemap_en.xml e https://www.sowork.com/sitemap_pt-BR.xml |
| F48 | https://www.sowork.com/glossary/spatial-meetings |
| F49 | Resultado de busca citando o blog do SoWork sobre Meeting Zones ("You'll notice the meeting zone glow when you walk in"): https://sowork.com/blog/using-meeting-zones-in-your-office (redireciona; texto visto só no trecho da busca) |
| F50 | Bundle público `https://app.sowork.com/static/js/language-en-B0rzM5aK.js` (textos dos presets de presença) |
