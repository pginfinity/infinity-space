# Cosmos (cosmos.video): engenharia reversa de produto

> Pesquisa competitiva para o escritório virtual interno da Infinity (modos 2D e 3D no mesmo mundo).
> Data da coleta: 15/11/2026. Usei só informação pública: site, central de ajuda, changelog, lojas de app, reviews e análise estática (só leitura, com grep) do HTML e dos bundles JavaScript públicos. Não criei conta, não fiz login e não executei nenhum arquivo baixado.
>
> **Legenda:** **[confirmado — Fx]** = afirmação com fonte (lista na seção 7). **[inferido]** = dedução minha a partir de evidências indiretas. "Não encontrado" = procurei e não achei.

---

## 1. Visão geral

| Item | Resumo |
|---|---|
| **Empresa** | Cosmos Video Limited, registrada na Inglaterra e no País de Gales (nº 12875387), com sede em Londres **[confirmado — F34]**. Fundada em set/2020 por Rahul Goyal (ex-Citymapper) e Karan Baweja (ex-TransferWise) **[confirmado — F37, F38]**. Seed de £2M liderado pela LocalGlobe com Entrepreneur First, em dez/2020. Total captado: ~US$2,2–2,6M, conforme a fonte **[confirmado — F38]**. É um time pequeno **[inferido]**: as vagas no LinkedIn são poucas e um concorrente aponta "risco de longevidade" **[F45]**. |
| **Posicionamento** | "A virtual office where remote teams do their best work — together." É um "Virtual HQ" persistente para times remotos síncronos **[confirmado — F1, F36]**. Também tem verticais para educação ("Digital Campus") e estúdios de VFX/games **[confirmado — F37]**. |
| **Público** | Times remotos de 5 a 150 pessoas (templates de 20 a 150) **[confirmado — F30]**, escolas e cohorts, estúdios criativos. Cases publicados: Frontier VFX (75 pessoas), Reconciled (60), Codomo (15), Divi Engine (7) **[confirmado — F37]**. |
| **Dimensão visual** | **2D/2.5D**. Dois estilos de mapa: "minimal professional" (traço fino, fundo claro) e "vibrant 2.5D" **[confirmado — F30]**. Avatares em "picture bubble" (foto) ou "3D Avatars" animados e customizáveis **[confirmado — F25]**. No código, os avatares "3D" são **spritesheets JSON** carregados de `cdn.eu1.cosmos.video/avatars_v2/custom/{id}.json` **[confirmado — F46]**. Ou seja, são modelos 3D pré-renderizados como sprites 2D **[inferido]**. Não há modo 3D navegável. |
| **Plataformas** | Web: Chrome, Firefox e derivados do Chromium. **Safari não é suportado** **[confirmado — F9]**. Desktop para macOS, Windows e Linux (Linux desde out/2026) **[confirmado — F4, F9]**. O desktop é feito em **Electron** **[confirmado — F46]**: o bundle se identifica como `kind:"electron"` e grava `electron_app_log`. Mobile: app Android nativo reescrito em nov/2026, Android 8+ **[confirmado — F4]**; app iOS com iOS 15+ pela App Store **[confirmado — F39]** (a central de ajuda ainda diz iOS 13 **[F9]**). Sites localizados em 8 idiomas, entre eles português **[confirmado — F37]**. |
| **Modelo de preço** | Cobra por **usuário simultâneo (concurrent seat)**, não por membro cadastrado. "Space capacity is determined by the number of user seats you are paying for. It counts people online at the same time" **[confirmado — F23]**. Premium a **US$8,80 por usuário simultâneo/mês** no mensal ou **US$7,70** no anual **[confirmado — F37, F45]**. A página de preços não renderizou o valor na coleta **[F3]**. O anual economiza 12,5% **[confirmado — F3]**. |

### Planos e limites [confirmado — F3]

| | Free | Premium | Enterprise |
|---|---|---|---|
| Preço | US$0 | US$8,80/usuário simultâneo/mês (US$7,70 no anual) | Sob consulta |
| Usuários online simultâneos | 4 | 150 | 500 |
| Pessoas por chamada | 4 | até 150 | até 200 (tabela) ou "até 500" (card). A própria página se contradiz |
| Qualidade da chamada | SD 480p | HD 1080p | HD 1080p |
| Compartilhamento de tela | 1080p a 5 fps | 4K a 30 fps | 4K a 30 fps |
| Arquivo no chat | 25 MB | 150 MB | 500 MB |
| Gravação | 5 h no total, retidas por 15 dias | 3 h por usuário, retenção ilimitada | 3 h por usuário, retenção ilimitada |
| Plantas | Biblioteca pronta | Biblioteca + custom | Totalmente custom |
| SLA de suporte humano | 7 dias | 24 h | 6 h |

- Trial de 14 dias nos planos pagos, **com cartão** **[confirmado — F3]**.
- 10% de desconto no anual para escolas, ONGs e startups **[confirmado — F3]**.
- Add-on de gravação: US$15/mês por 50 h **[confirmado — F3]**.
- **Comportamento ao estourar o limite:** novos usuários não entram no espaço. Quem passa do limite da chamada **consegue falar, mas não vê os outros nem os compartilhamentos de tela**. Não há cobrança nem upgrade automático **[confirmado — F3]**.
- Limite técnico: até 250 pessoas por espaço e até 200 por chamada **[confirmado — F7]**. No Firefox, até 125 por chamada **[confirmado — F5]**.

---

## 2. Inventário completo de features

### 2.1 Mundo, mapa e movimentação

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Espaço persistente | Planta 2D/2.5D sempre "aberta", com link permanente (`cosmos.video/v/xxxx-xxxx-xxxx`) ou link memorável (`cosmos.video/seuespaco`) **[confirmado — F5, F46]** | "Always ready for people to drop in anytime" **[F2]** |
| Movimento por clique | Clique único com **pré-visualização no hover** de onde o avatar vai parar (out/2025). Duplo clique virou opção em Preferences › Advanced › Navigation (abr/2026) **[confirmado — F4]** | A prévia do destino reduz erros de navegação |
| Setas do teclado | "Or use the arrow keys instead" **[confirmado — F46]** | Os atalhos de movimento estão no menu `/` **[F24]** |
| Zoom e pan | "Reset Zoom" e "Selection Zoom" **[confirmado — F46]**. Pan e zoom foram otimizados em abr/2024 **[confirmado — F6]** | "Click to focus camera on user/room" **[F46]** |
| Home / spawn | "Set Home" numa sala. O usuário sempre nasce na sua mesa. O botão "Go Home" volta para lá de qualquer lugar **[confirmado — F20, F5]** | Também dá para entrar "na minha mesa em modo Listening" a partir da Home **[F5]** |
| Teleporte para pessoa | Passe o mouse sobre um avatar e clique em "Talk now", ou abra o link da pessoa, que leva até a posição dela **[confirmado — F2, F11]** | Cada usuário tem um link único que leva convidados até ele **[F12]** |
| Mover a conversa | "Move conversation" (tecla **J**) leva o grupo para outra sala, escolhendo quem vai junto **[confirmado — F15]** | Todos vêm marcados por padrão |
| Seguir alguém | Não encontrei um "follow" de avatar. As strings "Follow the red path" são do onboarding **[F46]** | — |
| Sentar | Não encontrei mecânica explícita de sentar. Os avatares ficam em cadeiras e mesas da planta **[inferido]** | — |
| Interação com objetos | Mesas de jogo nas Game Rooms, apps embutidos que abrem sozinhos ao entrar na sala, rádio do espaço **[confirmado — F11, F16, F21]** | O objeto/sala dispara o comportamento, sem menu |
| Bola de neve | Tecla **T** arremessa bola de neve **[confirmado — F6, F46]** | Easter egg social |
| Pets | Puppy, kitten ou penguin seguem o avatar. Dá para fazer carinho ou enxotar (2022) **[confirmado — F6]**. A adoção continua no código **[F46]** | — |
| Sidebar de salas ativas | Lista de salas com ocupação e "active rooms sidebar" **[confirmado — F4]** | Navegação sem precisar olhar o mapa |
| Abas Space/Call | Aba "Space" para navegar e ver breakouts; aba "Call" para a galeria **[confirmado — F5]** | Separa "onde estou" de "com quem falo" |
| Indicação de movimento | Pistas de movimento e nomes de sala clicáveis para novatos **[confirmado — F5]** | — |

### 2.2 Áudio e vídeo por proximidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| **Spatial Areas** | Cada avatar tem uma **caixa colorida** (área de proximidade). "When your proximity area overlaps with someone else's, you automatically see and hear each other" **[confirmado — F12]** | É binário (sobrepôs ou não). Não há raio ou decaimento documentado **[F12]**. Na prática: grupo por sobreposição, sem atenuação gradual **[inferido]** |
| Grupos dinâmicos | Os grupos se formam e se dissolvem com o movimento **[confirmado — F12]** | Meta de setup de conexão abaixo de 50 ms ao se aproximar **[confirmado — F35]** |
| Ativação por proximidade no servidor | Os relays de vídeo "ativam e desativam feeds com base na proximidade e priorizam quem está em conversa" **[confirmado — F35]** | Só renderiza os rostos visíveis, então a carga se estabiliza **[F4]** |
| **Meeting Rooms** | A sala inteira vira uma chamada única, sem depender da posição **[confirmado — F11]** | Até 200 pessoas, com breakouts e apps **[F2]** |
| **Personal Rooms** | Mesa própria com três modos: **Open** (a chamada começa sozinha), **Knock Required** e **DND** **[confirmado — F20]** | Uma sala por usuário. Só o dono ou um admin resetam **[F20]** |
| Trancar sala / bater | "Lock room" na toolbar. Quem chega bate e os presentes aceitam. Ao destrancar, quem estava batendo entra direto **[confirmado — F15]** | — |
| **Focus Rooms** | Microfone desativado, câmera opcional, cada um informa a tarefa e a duração (timers de 30/60/90 min) **[confirmado — F11, F37]** | O código também bloqueia tela e apps dentro da Focus Room ("Screen sharing disabled in focus rooms", "App sharing disabled in focus rooms") **[confirmado — F46]** |
| **Game Rooms** | Os jogos começam automaticamente quando alguém entra **[confirmado — F11]** | Sem link e sem instalação |
| **Broadcast (megafone)** | "Broadcast to All Rooms" / "Start Broadcasting to Everyone". Há limite de broadcasters simultâneos e uma configuração "Guests can broadcast to the whole space" **[confirmado — F46]** | Aviso ao ouvinte: "The broadcaster cannot see or hear you" **[F46]**. Usuários mobile ouvem broadcasts desde a v1.9.6 **[F39]** |
| **Sussurro (whisper)** | "Start Whispering", "Whispering with …", "Whispering, can't hear you", implementado com atributos de participante do LiveKit **[confirmado — F46]** | Não aparece na documentação pública **[inferido: feature nova ou experimental]** |
| Spotlight | Admins e membros fixam vídeo, tela ou app para todos, e a gravação segue o spotlight **[confirmado — F14, F46]** | "Pin Video/Screenshare/App for Everyone" |
| Active speaker | Destaca quem está falando, ligado em View Settings **[confirmado — F14]** | — |
| Visualizações | Floating Space View (até 4 vídeos sobre o mapa), Galeria (até 36), Spotlight e Active Speaker **[confirmado — F14]** | 720p por padrão na galeria e no pin **[F5]** |
| Pop-out | O desktop abre um pop-out com até 4 vídeos. O pop-out do Chrome foi reconstruído em abr/2026: pilha vertical, todos os controles, abre sozinho ao compartilhar tela e se desativa no hover em dois monitores **[confirmado — F4, F5]** | Minimizado, o app "para de renderizar o espaço" e libera assets da memória **[confirmado — F35]** |
| Breakouts | Dois passos (tamanho do grupo e duração). Atribuição manual, reshuffle, anúncios para os grupos e retorno com um clique **[confirmado — F4]** | — |
| Interações na chamada | Levantar a mão (**H**, numerada por ordem), reações (**1–9**, com emotes que "voam" quando várias chegam juntas), timer compartilhado com alarme, enquetes **[confirmado — F15, F5]** | O som das reações pode ser desligado **[F5]** |
| Segunda câmera | "Second camera share" **[confirmado — F5]** | Útil para quadro físico ou produto |
| Silenciar colega | "Mute colleagues" no mobile **[confirmado — F39]** | — |
| Música não atrapalha conversa | A Space Radio abaixa sozinha quando você entra numa chamada **[confirmado — F21]** | Ducking automático |

### 2.3 Compartilhamento de tela

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Multi-share simultâneo | Várias pessoas compartilham ao mesmo tempo, e você alterna e amplia **[confirmado — F17]** | Máximo de compartilhamentos simultâneos não documentado |
| Modos de qualidade | **Slow connection**, **Standard** (texto nítido, padrão) e **Smoother video** (mais fps) **[confirmado — F17]** | O usuário escolhe pela intenção, não por números |
| Resolução | Até 4K a 30 fps (Premium). Free: 1080p a 5 fps **[confirmado — F3, F4]** | — |
| Áudio do sistema | Desktop (Mac, Windows e Linux) só com tela inteira. No navegador, só com aba do Chrome ("Also share tab audio") **[confirmado — F4, F17]** | — |
| Anotação | Caneta ou ponteiro, cor por pessoa, traços que somem ou ficam, screenshot da tela anotada. Só quem compartilha controla o modo, e ele precisa estar no desktop **[confirmado — F4, F17]** | Traços que somem servem para apontar. Traços persistentes servem para review |
| Desligamento automático por privacidade | O compartilhamento para ao sair da sala, ao ficar sozinho ou ao mudar para Listening, Focusing ou Away **[confirmado — F6, F13]** | Evita vazar a tela sem querer |
| Telas no mundo | Não. A tela aparece no layout da chamada, não como objeto no mapa **[inferido — F14, F17]** | — |
| Compartilhar a tela do celular | App Android **[confirmado — F4]** | — |
| Prioridade de banda | Com banda baixa, tela e áudio têm prioridade sobre o vídeo **[confirmado — F6]** | — |
| Live streaming | Grava e transmite via RTMP para YouTube, Twitch ou Livestream, espelhando o layout do recorder **[confirmado — F5, F18]** | — |

### 2.4 Qualidade de áudio

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Cancelamento de ruído "Cosmos" | Dois modelos: **Balanced** (recomendado, baixo consumo) e **Aggressive** (mais forte, "às vezes robótico") **[confirmado — F19]** | No bundle, Balanced é o modelo **DTLN** e Aggressive é o **RNNoise**. Há ainda as opções **DeepFilterNet3** ("Best quality · heavy (~17 MB, high CPU)") e **FastEnhancer-tiny** ("Lightest · ~4% CPU") **[confirmado — F46]**. São modelos open source rodando no cliente **[inferido: WASM/AudioWorklet]** |
| Remoção de ruído do navegador | "Lightest", usa o processamento nativo do browser **[confirmado — F19]** | — |
| Áudio sem edição | Só o cancelamento de eco fica ativo, para música e streaming **[confirmado — F19]** | — |
| Noise gate | Opcional, abre o mic só quando você fala **[confirmado — F4, F19]** | — |
| Teste de microfone | Grava uma amostra e reproduz com o modo escolhido. Tem medidor de nível **[confirmado — F4, F19]** | Testar antes de entrar evita o "tá me ouvindo?" |
| Modo música Bluetooth | Libera o mic quando você está mutado, para manter a qualidade A2DP do fone. Desmutar leva 2–3 s **[confirmado — F4]** | Resolve o problema clássico do headset Bluetooth em modo HFP |
| Volume de entrada | Automático ou manual **[confirmado — F4]** | — |
| Recomendações de SO | Orienta usar Voice Isolation (macOS/iOS) ou Voice Focus (Windows 11 24H2) com o Cosmos em "Unedited", para não processar duas vezes **[confirmado — F19]** | — |
| Bitrate | 196 kbps de áudio nas Meeting Rooms (llms.txt) **[confirmado — F37]**. Outra página fala em 96 kbps **[F37]** | Números inconsistentes |
| Krisp | O código do filtro Krisp do LiveKit está no bundle (`enable-lk-krisp-noise-filter`) **[confirmado — F46]**, mas a UI não o oferece. Provavelmente vem junto do SDK e não é usado **[inferido]** | — |
| Codecs de vídeo | VP9 por padrão, VP8 como fallback (Firefox). AV1 citado **[confirmado — F35, F4, F37]**. Simulcast, dynacast e adaptiveStream do LiveKit **[confirmado — F46]** | 30% menos banda com VP9 em reuniões grandes **[F5]** |

### 2.5 Chat e comunicação assíncrona

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Canais | Públicos (visíveis a membros e convidados) e privados **[confirmado — F2, F23]** | O canal público é compartilhado com as áreas de convidado. Para ser interno, precisa ser privado **[F23]** |
| DMs | Clique no nome e mande mensagem. Mostra quem está online **[confirmado — F2, F6]** | — |
| Threads | Visão dedicada de thread, seção "Threads" na sidebar, controle de não-lidos **[confirmado — F2, F5]** | — |
| Chat da reunião / sessão | Histórico persistente, reações e arquivos que continuam acessíveis depois da sessão **[confirmado — F2]** | — |
| Formatação e pins | Negrito, itálico, tachado, código, emojis, pin em canais e DMs **[confirmado — F6]** | O editor é ProseMirror/TipTap **[confirmado — F46]** |
| Chat offline (mobile) | Mensagens salvas abrem sem rede e a fila é enviada ao reconectar **[confirmado — F4]** | — |
| Webhooks | Ferramentas externas postam em canais específicos **[confirmado — F27]** | — |
| Notificações | Deep link para a mensagem certa, preferências por espaço, aba "Activities" **[confirmado — F5, F6]** | — |
| Convite para conversar | "Are you free for a chat?" e "Invite to talk", com respostas rápidas: **Go now / In 5 min / Can't come** **[confirmado — F4, F6]** | Respostas pré-definidas tiram o atrito social |
| Quadro branco | Era nativo (post-its, caneta, texto, imagem) **[F16]**, mas foi **aposentado em abr/2026** **[confirmado — F4]**. A central de ajuda ainda o descreve | — |
| Notas / docs nativos | Não encontrado. Docs vêm como apps embutidos (Google Docs) | — |
| Booking quando o espaço está vazio | Convidados agendam reunião quando não há ninguém online **[confirmado — F5]** | — |

### 2.6 Presença e status ("True Statuses")

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| 4 estados | 🟢 **Available**, 🟡 **Listening** (conectado, com mic e câmera desligados), 🔵 **Focusing**, 🔴 **Away** **[confirmado — F31]** | Listening é o estado do meio, ótimo: "estou aqui, me chame", sem câmera |
| Troca automática | Available vira **Listening após 5 min** de inatividade. **Away após 10 min** sem input no sistema. O Auto-Away **não pode ser desligado** **[confirmado — F13, F31]** | Diz que é "para manter os status verdadeiros" |
| Status custom | Texto, emoji e timer de duração **[confirmado — F31]** | — |
| Presets do time | O admin cria presets ("Break 15 min", "another-call 30 min") que todos aplicam com um toque **[confirmado — F4, F31]** | — |
| Notificar quando ficar livre | Avisa quando uma pessoa específica fica disponível **[confirmado — F6, F31]** | — |
| Aviso de aproximação | Som e notificação quando alguém se aproxima da sua mesa, inclusive em Listening, Focusing ou Away **[confirmado — F6, F31, F46]** | — |
| Mesa própria | Personal Room "[Seu Nome]'s Room", que mostra se você está na mesa **[confirmado — F20]** | — |
| Horário de funcionamento | Landing page com logo, descrição e horário de trabalho **[confirmado — F5]** | O "Cosmos Hours" (horários de co-working) foi **aposentado** em abr/2026 **[confirmado — F4]** |
| Chamada por status no celular | Em Available ou Listening, o celular toca mesmo bloqueado **[confirmado — F4, F32]** | — |
| Perfil | Bio, local, fuso, idioma e interesses **[confirmado — F25, F5]** | — |

### 2.7 Avatares e customização

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Picture Bubble | Foto num círculo **[confirmado — F25]** | Reconhecimento facial imediato |
| "3D Avatars" | Animados, com roupas (tops, calças, sapatos, acessórios) **[confirmado — F25]**. Tecnicamente, spritesheets JSON na CDN **[confirmado — F46]** | O estilo é escolhido pelo admin para o espaço inteiro, não por pessoa **[confirmado — F25]** |
| Fundos virtuais | Blur, imagem, upload. O admin publica fundos de marca para todos. Consumo de CPU caiu para cerca de 1/3 em out/2026 e há modo de baixa performance **[confirmado — F4]** | MediaPipe (face detector e landmarker) no bundle **[confirmado — F46]**. Provável uso em fundo virtual ou enquadramento **[inferido]** |
| Pets | Ver 2.1 | — |

### 2.8 Editor de mapa, builder, objetos interativos e embeds

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Space Builder | Edita um template ou cria do zero. Publica **sem precisar de refresh para ninguém** **[confirmado — F5, F30]** | "1-click publishing" **[F30]** |
| Templates | 20 espaços prontos para 20–150 pessoas, em dois estilos (minimal e vibrant 2.5D) **[confirmado — F30]** | — |
| Biblioteca de assets | Mais de 1.000 itens: móveis, decoração, plantas, iluminação, texturas. Pisos e cores delimitam zonas **[confirmado — F30]** | — |
| Floor plan builder (abr/2026) | Temas minimal e vibrant, tipos de sala (mesa pessoal, meeting, focus, game, spatial), labels de texto e imagem **[confirmado — F4]** | **O tipo da sala define o comportamento de A/V.** Muda em Room card › Details › Room Type, com efeito imediato **[F11]** |
| Personalização | Logos, imagens e texto em qualquer lugar. Landing page custom para convidados **[confirmado — F30, F48]** | — |
| Apps embutidos | Qualquer site que aceite iframe, como Figma, Miro, Google Docs, Sheets e Slides, "abre para todos na chamada" **[confirmado — F16]** | Favoritos (estrela) e **auto-launch ao entrar na sala** **[F16]** |
| Co-watch do YouTube | Reprodução sincronizada em que qualquer um dá play, pause ou seek **[confirmado — F16]** | — |
| Space Radio | Playlist de links do YouTube tocando no espaço todo. Volume individual, pular faixa, contador de ouvintes **[confirmado — F21]** | Ducking automático em chamadas |
| Spotify | Integração que exige Spotify Premium para controlar o player ("CoListening") **[confirmado — F46]** | — |

### 2.9 Jogos e social

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| 12 jogos nativos | **Quebra-gelo:** Two Truths and a Lie, Who Said It Best, Personal Deception, Cosmos Telephone. **Grupo:** Cosmos Art (estilo Gartic), Trivia (25 categorias), Jigsaw (167+ imagens), Snake. **Duelos:** Navy Wars (batalha naval), Tic Tac Toe (grade infinita, 5 em linha), Chess, Sudoku **[confirmado — F26, F37]** | Os jogos começam sozinhos na Game Room. O host escolhe no menu e os jogadores clicam para entrar **[F16]**. A contagem diverge: 12 numa página, 15 em outra **[F16, F26]** |
| Poker e jigsaw | Citados na central de ajuda **[confirmado — F16]** | — |
| Snowball e pets | Ver 2.1 | — |

### 2.10 Reuniões

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Agendamento por calendário | Add-on do Google Calendar e plugin do Outlook. O Cosmos vira o local padrão da reunião e a chamada começa sozinha na sala designada quando o primeiro entra **[confirmado — F27, F5]** | O link do calendário leva sempre para a mesma sala, ou para uma sala aleatória se o escritório estiver vazio **[F6]** |
| Agenda do dia | Mostra as reuniões do dia na sidebar ("Today's Calendar") **[confirmado — F27]** | — |
| **Cosmos Replay** (gravação) | Botão "Rec". Um **bot gravador** entra na chamada. 1080p, armazenado na nuvem da Cosmos, gravação em meeting rooms ou spatial areas **[confirmado — F18]** | O bot aparece como avatar especial ("special_bot_recorder") **[F46]** |
| Transcrição e resumo | Transcrição automática pesquisável, resumo por IA, "key insights", action items, links para clipes. **10 idiomas** **[confirmado — F18, F5]** | Provedor de STT/LLM **não encontrado** (nem na privacidade nem no bundle) |
| Compartilhamento | Só o dono, membros do espaço ou qualquer pessoa com o link. Player com 1–2x, PiP e qualidade adaptativa **[confirmado — F18]** | Reprodução em HLS/DASH (hls.js e dash.js no bundle) **[confirmado — F46]** |
| Auto-share | Envia o replay aos convidados do evento de calendário e o resumo ao Slack **[confirmado — F5, F27]** | — |
| Legendas ao vivo | "Enable Captions", configuração de idioma e **tradução** ("Captions are being translated to") via `/api/v2/captions/start` **[confirmado — F46]** | Não aparece nas páginas públicas **[inferido: lançamento recente]** |
| Reuniões grandes | 200 participantes **[confirmado — F5]** | — |

### 2.11 IA

| Feature | Como funciona |
|---|---|
| Resumo, action items e insights do Replay | Ver 2.10 **[confirmado — F18]** |
| Legendas e tradução ao vivo | Ver 2.10 **[confirmado — F46]** |
| Cancelamento de ruído por modelos neurais | DTLN, RNNoise e DeepFilterNet3 **[confirmado — F46]** |
| Assistente / agente / copiloto | **Não encontrado.** Não há agente conversacional nem busca semântica. A IA se limita a reuniões e áudio |

### 2.12 Integrações [confirmado — F27, F5, F46]

| Integração | O que faz |
|---|---|
| Google Calendar / Outlook | Agendamento, auto-start na sala, agenda do dia, local padrão, envio de gravações aos convidados |
| Slack | Notificações de atividade num canal, `/cosmos` para compartilhar o link, aviso de convite para conversar mesmo offline, **sincronização de status**, resumos de gravação, compartilhar conversas nomeadas num canal |
| Webhooks | Mensagens entrando nos canais |
| YouTube | Space Radio e co-watch |
| Spotify | Controle do player (exige Premium) |
| Apps em iframe | Figma, Miro, Google Workspace |
| RTMP | YouTube, Twitch |
| SSO | SAML, Google Workspace, Microsoft 365 **[confirmado — F37]**. "SSO login" no iOS v1.9.14 **[F39]**. Plano exigido não encontrado |

### 2.13 Admin, segurança e privacidade

| Feature | Detalhe |
|---|---|
| Papéis | Owner, admin, member, guest **[confirmado — F3, F23]**. "Three-tier roles" **[F37]** |
| Acesso ao espaço | Só membros, ou membros e convidados. Convidado entra direto ou bate e espera aprovação. **Áreas de convidado** limitam o que ele vê. Salas fora dessas áreas exigem login **[confirmado — F4, F23, F28]** |
| Restrição por domínio | Entrada restrita por domínio de e-mail **[confirmado — F28]** |
| Remoção e limites para convidados | Remover convidados e restringir o broadcast deles **[confirmado — F28]** |
| Compliance | **SOC 2 Type II** e GDPR declarados **[confirmado — F28]**. O trust center não informa o tipo de SOC 2 e deixa a documentação atrás de "Get access" **[F33]**. Registro no ICO ZA878308 **[F34]** |
| Criptografia | AES-256 nas chamadas **[confirmado — F3]**. Diz ter "End-to-end encryption for all communications" **[F28]**. Isso **conflita** com o bot gravador, as legendas no servidor e o SFU LiveKit **[inferido: provavelmente é criptografia em trânsito (DTLS-SRTP), não E2EE real]** |
| Residência de dados | "Located in Ireland, in the EU". Gravações e mensagens ficam com terceiros nos EUA **[confirmado — F34]**. A página de features diz "Belgium" e "AWS, GCP and Azure" **[F28]**. A página de segurança cita só AWS **[F33]**. Há inconsistência |
| Retenção | Logs técnicos por 15 dias, e-mails de suporte por 60 dias **[confirmado — F34]**. Logs de sistema de 15 a 90 dias **[F28]** |
| Analytics de admin | Conversas por duração, mapa de calor de co-working, utilização, **linha do tempo de status por membro**, exportação de logs (conversas, status, entradas e saídas) **[confirmado — F29]** | "No recording or monitoring of conversation content" |
| Trust center | Controles listados: EDR, DLP, DNSSEC, criptografia de disco, notas A em SSL Labs, CryptCheck e ImmuniWeb. RTO de 2 h **[confirmado — F33]** |

### 2.14 Performance e requisitos

| Item | Detalhe |
|---|---|
| Hardware | **Mínimo:** dual-core e 2 GB (até 20 participantes). **Recomendado:** Intel i3/i5/i7 de 10ª geração ou Ryzen 3000, com 4 GB. **Ótimo:** Intel de 11ª geração, Ryzen 5000 ou M1, câmera 1080p e GPU com **WebGL 2.0** **[confirmado — F10, F35]** |
| Rede | 5 Mbps de upload e download recomendados **[confirmado — F10]**. Portas UDP 10000–65400. Domínios `*.cosmos.video`, `*.livekit.cloud`, `*.twilio.com`, `*.xirsys.com` **[confirmado — F8]** |
| Low Resource Mode | **Automático quando a renderização cai abaixo de 20 fps:** limita a 4 tiles, reduz a resolução periférica e comprime texturas **[confirmado — F35, F22]**. Também pode ser ligado na mão. Esconde imagens e textos custom do mapa **[F22]** |
| Opções avançadas | "Disable Compressed Textures", "Support Old Graphics Cards" (sem WebGL) e "Force Video Relay" (força TURN em firewall corporativo) **[confirmado — F22, F46]** |
| "Videos in Gallery" | Diminuir o número reduz a carga na hora **[confirmado — F4]** |
| Relatórios de performance públicos | Teste trimestral com 150 bots em 15 regiões. Diz usar menos CPU e GPU que Meet, Zoom e Teams numa chamada de 5 pessoas. Chamada de 90 pessoas no Windows caiu de ~17% para ~5% de CPU. Idle o dia todo fica em ~1,5% **[confirmado — F4]** | São números da própria empresa |
| Background | CPU e GPU fora de chamada caíram 2,4–3,1x num Celeron N4500 com 8 GB **[confirmado — F4]** |
| Roteamento | "Fastest server route automatically". Servidores em 6 regiões (América do Norte, América Latina, Europa, Ásia, Japão, Austrália) **[confirmado — F4, F35]** |
| Uptime | Diz ter 99,999% **[F37]**. A status page não carregou os dados **[F49 status]** |

### 2.15 Mobile e acessibilidade

| Feature | Detalhe |
|---|---|
| Lista em vez de mapa | O mobile mostra a **lista de salas e pessoas** com ocupação, disponibilidade e salas trancadas. Não há mapa **[confirmado — F32, F4]** |
| Tap-to-talk / Invite to talk | Com respostas rápidas **[confirmado — F4]** |
| Chamada | Landscape, PiP, fundo virtual lembrado, compartilhar a tela do celular, **low resources mode** (menos vídeos com sinal ruim ou aparelho quente) e **audio-only** **[confirmado — F4, F32]** |
| Convidado mobile | Precisa baixar o app, mas entra só com o nome **[confirmado — F23]** |
| Tablet | Usa a interface mobile **[confirmado — F32]** |
| Teclado | Paleta de comandos **Cmd/Ctrl+K**, `/` lista os atalhos, painel de status navegável por teclado **[confirmado — F24, F4]** |
| Acessibilidade formal (WCAG, leitor de tela) | **Não encontrado.** As legendas ao vivo ajudam **[F46]** |

### 2.16 Onboarding

| Feature | Detalhe |
|---|---|
| Setup guiado | `/setup-office` cria a organização a partir do e-mail de trabalho, escolhe casos de uso e o mapa disponível (APIs `/api/v2/organization/from_work_email`, `/usecases`, `/venues/maps/available`) **[confirmado — F47]** |
| Tutorial no mundo | "Follow the red path to meet Alexei, a Cosmos Bot". Um caminho vermelho no chão leva até um bot para praticar a conversa por proximidade **[confirmado — F46]** | Aprender fazendo, dentro do mundo |
| Entrar sem permissões | Dá para entrar sem liberar mic e câmera. O pedido aparece só ao desmutar **[confirmado — F6]** |
| Landing page do convidado | Ajuda com as permissões de navegador e SO (Chrome, Edge, Firefox). Pré-join com ruído e fundo **[confirmado — F4]** |
| Vídeos tutoriais | Três vídeos para o Space Builder **[confirmado — F5]** |
| Central de ajuda | Cerca de 80 artigos em 8 categorias (Help Scout) **[confirmado — F48, F8]** |

---

## 3. Stack técnica

| Camada | Tecnologia | Status |
|---|---|---|
| **Mídia (SFU)** | **LiveKit Cloud**: "Livekit.cloud is our media provider" | **[confirmado — F8, F46]** |
| Protocolo | WebRTC | **[confirmado — F7]** |
| TURN | Twilio e Xirsys | **[confirmado — F8]** |
| Codecs | VP9 (padrão), VP8 (fallback), AV1. Simulcast, dynacast e adaptiveStream | **[confirmado — F35, F4, F46]** |
| **Renderização do mundo** | **PixiJS v7** (`@pixi/core`, `@pixi/math`), WebGL/WebGL2, spritesheets JSON | **[confirmado — F46, F10]** |
| Avatares | Spritesheets pré-renderizados (`avatars_v2/custom/{id}.json`) | **[confirmado — F46]**. Origem 3D baked **[inferido]** |
| UI | React, Tailwind CSS, Emotion, Headless UI (`<Transition />`) | **[confirmado — F46]** |
| Estado no cliente | MobX | **[confirmado — F46]** |
| Editor de chat | ProseMirror / TipTap | **[confirmado — F46]** |
| Player do Replay | hls.js, dash.js | **[confirmado — F46]** |
| Gráficos (analytics) | ApexCharts (`polarToCartesian`, `chartType`) | **[inferido — F46]** |
| Ruído | DTLN, RNNoise, DeepFilterNet3, FastEnhancer-tiny no cliente. Código do Krisp do LiveKit presente | **[confirmado — F46]** |
| Visão computacional | MediaPipe Tasks (FaceDetector, FaceLandmarker) | **[confirmado — F46]** |
| Auth | Firebase Auth (`cosmosvideohq.firebaseio.com`) e reCAPTCHA Enterprise | **[confirmado — F47, F46]** |
| Backend | APIs REST `/api/v2/...`. A nomenclatura "venues" é legado de "virtual venues" de 2020 | **[confirmado — F47, F38]** |
| Servidores | "Game servers" (estado, posição, proximidade) separados dos "video relay servers", em 6 regiões | **[confirmado — F35]** |
| Infra | AWS **[confirmado — F33]**. "AWS, GCP and Azure" **[F28]**. CDN `cdn.eu1.cosmos.video` **[F47]**. Dados na Irlanda **[F34]** | — |
| Observabilidade | Datadog RUM (Browser Agent) | **[confirmado — F46]** |
| Analytics | Mixpanel (proxy `mixyp.cosmos.video`), Google Tag Manager | **[confirmado — F47]** |
| Desktop | Electron | **[confirmado — F46]** |
| Mobile | Android nativo (2026). iOS de 38 MB | **[confirmado — F4, F39]**. Linguagem não encontrada |
| Site de marketing | Next.js (App Router) e Payload CMS | **[confirmado — F47]** |
| Suporte | Help Scout | **[confirmado — F8]** |
| Pagamento | Stripe | **[confirmado — F3]** |
| Provedor de STT/LLM | Não encontrado | — |

---

## 4. Padrões de UX e design que valem estudar

1. **O tipo da sala define o comportamento.** Spatial, Meeting, Personal, Focus e Game são propriedades de uma zona do mapa, e cada uma muda o áudio, a toolbar e as permissões (a Focus Room bloqueia mic, tela e apps). Trocar o tipo é um dropdown com efeito imediato **[F11, F46]**. É o padrão mais reaproveitável para um editor de mundo.
2. **Listening como estado intermediário.** "Estou presente, pode me chamar, mas estou sem câmera." Isso resolve o constrangimento de ficar com a câmera ligada o dia todo **[F31]**.
3. **Respostas pré-definidas ao convite** (Go now / In 5 min / Can't come). Diminuem o custo social de recusar **[F4]**.
4. **Personal Room com três níveis de porta** (Open, Knock, DND) e "Go Home" de qualquer lugar **[F20]**.
5. **Degradação automática e transparente.** Abaixo de 20 fps entra em Low Resource Mode. A banda prioriza tela e áudio. O pop-out minimizado para de renderizar o mundo **[F35, F6]**.
6. **Privacidade por padrão no compartilhamento de tela.** Para sozinho ao sair da sala, ao ficar só ou ao mudar de status **[F13]**.
7. **Prévia do destino no hover** antes do clique de movimento **[F4]**.
8. **Paleta Cmd+K para qualquer ação** e `/` para listar atalhos, com teclas de uma letra (H, J, T, 1–9) **[F24, F15]**.
9. **Tutorial no mundo.** O caminho vermelho até um bot ensina proximidade fazendo **[F46]**.
10. **Mobile como lista, não como mapa.** É um bom reconhecimento de que o mapa não funciona em tela pequena **[F32]**.
11. **Abas Space vs Call.** Separam a navegação espacial da galeria de vídeo **[F5]**.
12. **Ducking automático da música** quando começa uma conversa **[F21]**.
13. **Modos de compartilhamento por intenção** ("documento" ou "vídeo"), não por parâmetros técnicos **[F17]**.
14. **Comunicação pública de performance**: relatório trimestral com metodologia **[F4]**.
15. **Estilo visual "minimal"** com traço fino, fundo claro e vídeo flutuando sobre o mapa (ver o screenshot da home **[F1]**). Lê como ferramenta de trabalho, não como jogo.

---

## 5. Críticas e pontos fracos

### 5.1 Reclamações reais (com fonte)

| Reclamação | Fonte |
|---|---|
| **Cancelamento do lifetime deal da AppSumo** em abr/2025. Compradores chamaram de "bait-and-switch", ganharam um cupom de 50% e dizem que não tiveram resposta | Trustpilot (1★, 16/04/2025) **[F42]**, AppSumo (09/04/2025) **[F41]**, Product Hunt **[F40]** |
| Trial curto e com poucas features | G2 (via resumo de busca; a página dá 403) **[F43]** |
| Problemas de conexão ocasionais | G2 **[F43]** |
| Curva de aprendizado: "difícil entender o caso de uso no começo" e "nem todo mundo quer ficar online o dia todo" | Capterra CA (via resumo de busca) **[F44]** |
| Faltavam reações e reserva de sala pelo Google Calendar (2022, depois resolvido em parte) | App Store **[F39]** |
| Concorrente diz que "parece mais jovem/menos maduro" que Kumospace e SoWork e que há risco de longevidade por ser um time pequeno | Flat.social (concorrente, viés) **[F45]** |
| **Volume de reviews baixo**: G2 4,8 (~41), Product Hunt 4,5 (8), AppSumo 4,9 (26, vários incentivados), Trustpilot 3,1 (2), App Store 5,0 (6) | **[F40–F43, F39]** |

O Reddit (r/Cosmosdotvideo, para onde aponta `/feedback`) e o Hacker News não deram resultado: o Reddit devolveu 403 e o HN não tinha threads.

### 5.2 Análise crítica (o que falta) [inferido]

- **A proximidade é binária.** Por sobreposição de caixa, sem decaimento por distância, sem paredes que atenuam e sem áudio posicional (pan). Isso tira a "acústica" que dá vida a um escritório.
- **Sem Safari.** Exclui usuários de Mac que não instalam o app.
- **A IA é rasa**: só o Replay e as legendas. Não há assistente, busca no histórico, standup assíncrono nem contexto da empresa.
- **Recursos foram retirados** (Whiteboard e Cosmos Hours em abr/2026) e a ajuda ainda os documenta. Isso sinaliza enxugamento de escopo e documentação desatualizada.
- **Marketing inconsistente**: E2EE vs bot gravador, Irlanda vs Bélgica, 12 vs 15 jogos, 96 vs 196 kbps, 200 vs 500 por chamada.
- **Analytics individual de status** (linha do tempo por membro e logs de entrada e saída). Mesmo sem conteúdo, pode virar ferramenta de vigilância.
- **Auto-Away que não pode ser desligado.** É rígido para quem lê ou pensa longe do teclado.
- **Sem 3D nem imersão.** Os "3D avatars" são sprites.
- **Mobile sem mapa.** Perde a noção espacial (o que é defensável, mas é uma lacuna).
- **Sem quadro branco, docs ou notas persistentes** ancorados no mundo depois da remoção do whiteboard.
- **Editor de mapa sem objetos programáveis** (gatilhos, portas, links) além de iframes e tipo de sala.

---

## 6. Para a Infinity

### 6.1 Copiar

1. **Arquitetura em duas camadas**: um *game server* autoritativo (posição, proximidade, estado das salas) separado do SFU, que assina e cancela as faixas conforme a proximidade **[F35]**. Para a Infinity, isso é o que permite **um único estado de mundo** servido para os clientes 2D e 3D.
2. **LiveKit** como SFU, com simulcast, dynacast e adaptiveStream. Assinar só os vídeos visíveis **[F8, F46]**.
3. **Tipos de sala declarativos no editor** (spatial, meeting, personal, focus, game) **[F11]**.
4. **True Statuses** com Listening e auto-switch, presets do admin, "me avise quando X ficar livre" e aviso de aproximação **[F31]**.
5. **Personal Room com Open/Knock/DND** e "Go Home" **[F20]**.
6. **Focus Rooms de body doubling** com tarefa e timer, bloqueando mic e tela **[F11, F46]**.
7. **Supressão de ruído com modelos abertos e selecionáveis** (DTLN, RNNoise, DeepFilterNet3), mais "áudio sem edição", noise gate, teste de mic e o modo música Bluetooth **[F19, F4, F46]**. Isso dá autonomia sem pagar Krisp.
8. **Auto-degradação** (<20 fps entra em modo leve), prioridade de áudio e tela sobre vídeo, pop-out que para de renderizar o mundo **[F35]**.
9. **Cmd+K e atalhos de uma letra** **[F24]**.
10. **Move conversation**, breakouts em dois cliques e spotlight que a gravação segue **[F15, F4, F14]**.
11. **Compartilhamento de tela que para sozinho** ao sair da sala ou mudar de status **[F13]**.

### 6.2 Melhorar

1. **Proximidade com decaimento real e paredes.** Volume como função da distância e oclusão por parede ou zona. No 3D, HRTF ou panner. No 2D, pan estéreo. Os parâmetros são os mesmos nos dois modos.
2. **Avatares 3D de verdade com fallback 2D baked.** O Cosmos já faz sprites a partir de 3D [inferido]. A Infinity pode usar **o mesmo rig** no modo 3D (glTF) e gerar spritesheets automáticos para o modo 2D. Assim a identidade visual fica idêntica entre os modos.
3. **IA em PT-BR integrada ao mundo**: ata e resumo da sala, busca no histórico e "o que aconteceu nesta sala hoje". O Cosmos só tem o Replay.
4. **Quadro branco e notas como objetos persistentes no mundo** (o Cosmos removeu o dele), com tldraw ou Excalidraw embutidos e ancorados na sala.
5. **Mobile com mini-mapa opcional** além da lista.
6. **Analytics agregado e opt-in.** Nada de linha do tempo individual para gestores.
7. **Auto-Away configurável** pelo usuário, com limites definidos pela política interna.
8. **Suporte a Safari**, ou pelo menos um aviso elegante com o app desktop como alternativa.

### 6.3 Evitar

1. **Alegar E2EE** se existe bot gravador ou processamento no servidor. Seja preciso: "criptografia em trânsito".
2. **Remover features sem migração** e deixar a documentação desatualizada.
3. **Inconsistência de números** entre páginas. Para uso interno, mantenha um único "limites.md" como fonte de verdade.
4. **Status forçado** que o usuário não controla. Gera desconfiança.
5. **Depender de WebGL 2 sem fallback.** O Cosmos precisou de "Support old graphics cards" **[F22]**.

### 6.4 Ideias inovadoras inspiradas no Cosmos

1. **"Uma conversa, duas lentes."** Trocar entre 2D e 3D **sem cair da chamada**: o grafo de áudio e vídeo (LiveKit) é independente do renderizador. O PixiJS (2D) e um motor 3D consomem o mesmo snapshot do game server. Quem está no 3D vê quem está no 2D como avatar 3D, e vice-versa como sprite.
2. **Sussurro e megafone com regras.** O sussurro (escondido no código do Cosmos **[F46]**) vira cidadão de primeira classe: fala privada dentro de uma spatial area, com indicador visual para quem está perto ("fulano está sussurrando"). O megafone fica limitado por papel e com fila.
3. **Porta com bilhete.** Quando a sala está em DND, a batida deixa um **bilhete de voz ou texto pendurado na porta**, entregue quando o status sai de DND. Junta o Knock com o async.
4. **Modo leve progressivo**: 3D, depois 2D, depois lista (estilo mobile do Cosmos), trocado sozinho conforme os fps e a bateria, sempre com o mesmo estado e a mesma conversa.
5. **Salas com memória.** Cada sala guarda o último resumo de IA, os links fixados e o quadro. Entrar na sala mostra "da última vez aqui: …", o que torna o espaço físico um índice do conhecimento.

---

## 7. Fontes

**Site e produto**
- F1. https://cosmos.video/
- F2. https://cosmos.video/product/features
- F3. https://cosmos.video/pricing
- F4. https://cosmos.video/changelog
- F5. https://cosmos.video/changelog/page/2
- F6. https://cosmos.video/changelog/page/3
- F26. https://cosmos.video/product/team-building-games
- F27. https://cosmos.video/product/features/integrations
- F28. https://cosmos.video/product/features/security-and-access
- F29. https://cosmos.video/product/features/space-insights--analytics
- F30. https://cosmos.video/product/features/fully-customisable-spaces
- F31. https://cosmos.video/product/features/true-statuses
- F32. https://cosmos.video/product/features/mobile-experience
- F35. https://cosmos.video/blog/high-performance-virtual-spaces
- F36. https://cosmos.video/blog/why-we-built-cosmos
- F37. https://cosmos.video/llms.txt
- F49. https://cosmos.video/download e https://status.cosmos.video

**Central de ajuda (support.cosmos.video)**
- F7. /article/93-technical-limits-audio-video-space
- F8. /article/49-blocked-by-company-firewall
- F9. /article/40-supported-browsers
- F10. /article/127-minimum-system-network-requirements
- F11. /article/137-what-are-the-different-room-types-in-cosmos
- F12. /article/135-spatial-areas-boost-impromptu-conversations-with-proximity-based-calling
- F13. /article/101-why-does-my-status-automatically-change-to-listening-or-away
- F14. /article/117-video-views-map-view-gallery-view-spotlight-active-speaker
- F15. /article/118-call-interactions-raise-hands-reactions-timer-lock-and-move
- F16. /article/119-collaborative-tools-app-selector-whiteboard-games
- F17. /article/114-multi-party-screenshare-with-different-modes
- F18. /article/116-record-your-call-in-cosmos-and-get-shareable-ai-summary-and-transcriptions
- F19. /article/113-remove-background-noise-with-noise-cancellation
- F20. /article/134-set-up-your-personal-room-in-cosmos
- F21. /article/129-how-to-play-music-across-your-space
- F22. /article/76-performance-optimization
- F23. /article/88-guest-experience-and-limits
- F24. /article/132-control-cosmos-with-keyboard-using-shortcuts-and-actions-bar
- F25. /article/109-how-to-setup-your-profile
- F48. https://support.cosmos.video (índice de categorias)

**Segurança e legal**
- F33. https://security.cosmos.video
- F34. https://cosmos.video/privacy_policy

**Empresa e imprensa**
- F38. https://cosmos.video/product/news/cosmos-raises-2m-from-localglobe-to-bring-people-together-online, https://www.uktech.news/news/zooms-uk-rival-cosmos-video-raises-2m-to-enable-human-connection-in-the-remote-era-20201211, https://www.cbinsights.com/company/cosmos-video, https://yourstory.com/2021/12/startup-bits-pilani-alumni-gamifying-online-workspaces/amp

**Reviews e terceiros**
- F39. https://apps.apple.com/gb/app/cosmos-video/id1609969340
- F40. https://www.producthunt.com/posts/cosmos-video/reviews
- F41. https://appsumo.com/products/cosmos-video/reviews/
- F42. https://ca.trustpilot.com/review/cosmos.video
- F43. https://g2.com/products/cosmos-video/reviews (403 na coleta direta; conteúdo via resultado de busca)
- F44. https://www.capterra.ca/software/1060214/cosmos-video (403; via resultado de busca)
- F45. https://flat.social/blog/cosmos-video-alternative (concorrente, com viés)

**Análise estática (só leitura, nada executado)**
- F46. Bundle do app web: https://cosmos.video/v/bundle.a71ef9ce38815e01d883.min.js (≈7,6 MB, inspecionado com grep)
- F47. HTML e chunks do site de marketing: https://cosmos.video/, https://cosmos.video/setup-office e `/_next/static/chunks/*`
