# Katmai (katmaitech.com): engenharia reversa de produto

> Pesquisa competitiva para o escritório virtual interno da Infinity (modos 2D e 3D no mesmo mundo). A Katmai é o concorrente mais próximo de um "escritório virtual 3D no navegador", então este relatório detalha como eles resolvem performance, câmera, áudio espacial e avatares (ver seção 3.1).
> Data da coleta: 15/11/2026. Usei só informação pública: site, FAQ, central de ajuda (cerca de 45 artigos), blog e roadmap, página de segurança, página de patentes, imprensa, podcasts, G2 (via busca) e análise estática, só leitura com grep, do HTML e do bundle JavaScript público de `app.katmaitech.com`. Não criei conta, não fiz login, não preenchi formulário e não executei nenhum arquivo baixado.
>
> **Legenda:** **[confirmado — Kx]** = afirmação com fonte (lista na seção 7). **[inferido]** = dedução minha a partir de evidência indireta. **[inferido — flag `x`, K56]** = existe uma feature flag do LaunchDarkly com esse nome no bundle de produção. Isso prova que o código existe, não que esteja liberado. "Não encontrado" = procurei e não achei.
>
> **Limitação importante:** o cliente 3D em si (o motor) não é servido publicamente. A rota `/app` devolve o mesmo bundle do painel, e o motor só carrega depois do login **[confirmado — K55, K56]**. Por isso as conclusões sobre o renderizador vêm de nomes de flags, patentes, entrevistas e central de ajuda, não do código do motor.

---

## 1. Visão geral

| Item | Resumo |
|---|---|
| **Empresa** | Katmai Tech, Inc., Nova York, fundada em 2020 por **Erik Braund** (antes, a agência Braund Studios) **[confirmado — K49, K52]**. Passou cerca de 2 anos autofinanciada com uns 10 funcionários, em stealth ("submarine company") **[confirmado — K49]**. **Série A de US$22M** em abr/2023, liderada pela Starr Insurance, com o ex-jogador da NFL Sidney Rice entre os investidores **[confirmado — K49]**. Podcasts citam mais de US$30M no total **[confirmado — K58]**. Tinha uns 40 funcionários em 2023 **[confirmado — K49, K52]** e cerca de 30 em 2025, espalhados por vários países **[confirmado — K51]**. Hoje não há vagas abertas **[confirmado — K40]**. Diz ter "mais de 50 patentes" **[confirmado — K44, K51]**. |
| **Posicionamento** | "Virtual Office Software That Feels Real": escritório 3D fotorrealista no navegador, com **vídeo real das pessoas em vez de avatares**, sem download e sem headset VR **[confirmado — K1]**. Braund: "We're not leaning into avatars, we're not leaning into 3D versions of you" **[confirmado — K58]**. "The goal isn't to be meeting software", e sim "a concurrent session that's always-on" **[confirmado — K52]**. |
| **Público** | Times de **10 ou mais pessoas** que colaboram todo dia, especialmente quem quer substituir calls seguidas **[confirmado — K3]**. Começaram mirando empresas pequenas e 100% remotas, mas **grandes empresas globais mostraram mais interesse** **[confirmado — K51]**. Casos de uso: escritório diário, office hours, onboarding, entrevistas ("Interview Loop"), offsites, vendas **[confirmado — K1, K51]**. Também fazem experiências de marca e gêmeos digitais: réplicas de lojas da Starbucks (Odyssey) e gêmeo digital da sede da TMS em Chicago **[confirmado — K49, K50]**. Clientes citados: SoundCloud **[confirmado — K50]**, Atender, Employ e Innovar Healthcare **[confirmado — K1]**. Há uma versão white-label com a Kinly ("Kinly Virtual Office powered by Katmai") **[confirmado — K54]**. |
| **Dimensão visual** | **3D em primeira pessoa, fotorrealista** **[confirmado — K49, K1]**. Eles comparam a qualidade a "PS3–PS5, dependendo da máquina" **[confirmado — K44, K51]**. As pessoas aparecem como **discos/bolhas de vídeo** no espaço ("avatar discs", "video speaker inside an avatar bubble") **[confirmado — K9, K49]**. Há um **2D View** (grade "honeycomb" de vídeos) para reuniões cheias **[confirmado — K9]**. Um **Basic Mode (mapa 2D)** sem renderização 3D está planejado para nov–dez/2026 **[confirmado — K41]**. No código já existe o estado `desktop2dMode` **[confirmado — K56]**. |
| **Plataformas** | **Navegador**: o requisito oficial é **Google Chrome atualizado**, em **Windows 11 ou macOS 15.3+** **[confirmado — K6]**. Instalável como app web ("Install page as app" no Chrome/Edge, "Add to Dock" no Safari, tela inicial no iOS/Android) **[confirmado — K33]**. **Mobile**: navegador, em beta. Modos "2D Video Conference", "Audio Only" e um 3D que "não substitui o computador" **[confirmado — K14, K8]**. App nativo: **não encontrado**. Um app mobile reconstruído está no roadmap **[confirmado — K42]**. **VR: não.** |
| **Modelo de preço** | **Plano único, US$25 por usuário/mês, todas as features**, sem mínimo de usuários e **convidados grátis**. Venda com demo **[confirmado — K45, K46]**. "One plan. Every feature." **[confirmado — K2]**. No lançamento (2023) era US$15/usuário/mês depois de 30 dias de trial **[confirmado — K50]**. Hoje o site oferece "Start Your Free Trial" **[confirmado — K1]**, e uma flag define 14 dias de trial **[inferido — flag `virtual-office-free-trial-days`=14, K56]**. Os planos pagos incluem espaços com a marca do cliente, desenhados pelo time da Katmai **[confirmado — K3]**. |

### Limites [confirmado, salvo indicação]

| Limite | Valor |
|---|---|
| Pessoas simultâneas por espaço | "Otimizado para **25–30** usuários simultâneos". Para mais gente, criar mais espaços, como andares **[confirmado — K22]**. O padrão da flag é `max-people-in-space` = 25 **[inferido — K56]** |
| Pessoas por reunião | "Cerca de 30 pessoas em uma reunião é onde chega ao máximo" (2023). Não miram eventos com 100+ pessoas **[confirmado — K49]** |
| Imagens de branding | 5 MB por imagem. Pilares em 16x2048 px **[confirmado — K25]** |
| Hardware | 16 GB de RAM no mínimo, CPU i7 de 11ª geração ou M1 ou mais **[confirmado — K6]** |

---

## 2. Inventário completo de features

### 2.1 Mundo, mapa e movimentação

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Câmera em primeira pessoa | Você "é" a câmera; os outros aparecem como vídeo no espaço **[confirmado — K49]** | Campo de visão ajustável: o padrão é FOV 70 e existe um menu de FOV **[confirmado — estado `fovValue:70`, `showFieldOfViewMenu`, K56]** |
| Teclado | Setas: cima anda para frente, baixo para trás, esquerda/direita giram (e fazem strafe se você já está andando). WASD: W/S anda, A/D faz strafe. `Shift` dobra a velocidade. Espaço pula **[confirmado — K8]** | O onboarding manda o convidado "segurar a seta para cima" **[confirmado — K51]** |
| Mouse | Clicar e arrastar para olhar em volta. **Duplo clique no chão** para ir até o ponto (paredes ignoradas), ativado por padrão e desligável **[confirmado — K8, K23]** | `Shift`+duplo clique alterna para um modo "swipe" de câmera; `Esc` sai **[confirmado — K8]**. Distância do clique-para-andar = 30 **[inferido — flag `click-to-move-distance`, K56]**. Patente: "Selecting a point to navigate video avatars" **[confirmado — K39]** |
| Joystick | Joystick na tela, escondido por padrão no desktop. No mobile, joystick flutuante e botão de pulo **[confirmado — K8, K42]** | No mobile, o joystick é a única forma de andar **[confirmado — K8]** |
| Gamepad | "WASD, setas, mouse, trackpad ou controles de videogame" **[confirmado — K44]** | Flag `gamepad-support` **[K56]** |
| Voar | Permissão `flyingAccess`, atribuível por papel **[confirmado — K56]** | Flag `fly-mode-permission` **[K56]** |
| Jump to User | Menu Users → ícone de foguete → "Jump to user". **A pessoa recebe o pedido e aceita**; se estiver indisponível, o pedido expira **[confirmado — K20]** | Teletransporte com consentimento: você não aparece de surpresa |
| Link to Me | Link único que "sincroniza com a sua localização" no escritório. Quem abre cai num lobby, você recebe o alerta e admite com 1 clique; o link vale até ser resetado **[confirmado — K27]** | Para mobile, é a forma de entrar numa reunião específica **[confirmado — K14]** |
| Ir para escritório vazio | "Jump to an Empty Office": achar e ir a uma sala livre sem andar até ela; sair de reunião com 1 clique e continuar visível **[confirmado — K41, planejado nov–dez/2026]** | Flag `teleport-to-empty-office` **[K56]** |
| Mapa | Pelo menu Users, o ícone de mapa abre o mapa do espaço com a pessoa em **ponto azul brilhante** e você em **roxo** **[confirmado — K21]**. "Mini Map: seu escritório visível em tempo real", mostrando salas em uso **[confirmado — K2]** | "Enhanced Map & People Menu" redesenhado no roadmap **[confirmado — K41]** |
| Sentar automático (Meeting Mode) | Ao entrar numa sala, o Auto Meeting Mode te "põe sob a mesa", sentado no lugar livre mais próximo, sem cliques **[confirmado — K11, K26]** | Posicionadores automáticos ("situators") evitam sobreposição de avatares **[inferido — flag `situator-prevent-avatar-overlap`, K56]**. Patentes "Resituating avatars" e "Resituating virtual cameras and avatars" **[confirmado — K39]** |
| Plateia automática | "Theatre Seating Optimization": senta a plateia e posiciona o apresentador sozinho **[confirmado — K41, planejado]** | Flag `discrete-seating` **[K56]** |
| Portas | Cada escritório, sala e área comum tem porta, aberta ou fechada com 1 clique. Em área comum, uma "barreira" se forma **[confirmado — K18]** | Maçaneta amarela = fechada, verde = aberta **[confirmado — K29]**. Escritórios de vidro: dá para ver quem espera do lado de fora **[confirmado — K49]** |
| Arquitetura | Admin troca o layout por presets ("Switch Architecture"). Os ocupantes são movidos para a porta da frente com um aviso **[confirmado — K22]** | — |
| Céu e vista | Admin troca a "localização" vista pelas janelas (skybox) e gira o céu por sala **[confirmado — K37]** | Muda para todos; avisar o time antes **[confirmado — K37]** |
| Ambientes de lazer | Ilha "Katmaitai" com praia, naufrágio, tobogã aquático, natação "com tubarões" **[confirmado — K24]**. Cobertura, penthouse com aquário e teatro para "noite de cinema" **[confirmado — K24]** | Elevadores, corredores, copa **[confirmado — K52]**. "Festas no escritório na Lua" **[confirmado — K40]** |
| Vários andares e espaços | Escritórios com vários andares e permissão de quem circula entre eles **[confirmado — K50]**. Vários espaços por organização **[confirmado — K22]**. "Cross-Space Connectivity" planejado **[confirmado — K41]** | Várias instâncias do mesmo espaço **[inferido — flag `space-multi-instance`, K56]** |
| Plataformas móveis | — | **[inferido — flag `moving-platforms`, K56]** |

### 2.2 Áudio e vídeo por proximidade

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Áudio espacial | "As conversas ficam mais baixas com a distância e acabam quando você se afasta" **[confirmado — K47]**. No corredor, a voz aumenta conforme você se aproxima **[confirmado — K51]** | Patente de **panorâmica esquerda-direita** pela posição do avatar **[confirmado — K39, US 10,952,006]**. Raio e curva de decaimento: **não encontrados** |
| Sound Zones | Áreas onde o som só é ouvido por quem está dentro: escritórios, pátios, lounges, sofás, salas. **Áudio e compartilhamento de tela ficam restritos à zona** **[confirmado — K10]** | **Contador de participantes no canto inferior direito = quem pode te ouvir.** Um sininho ("doorbell") toca quando alguém entra **[confirmado — K10, K49]**. Patentes "Volume areas" e "Providing awareness of who can hear audio" **[confirmado — K39]** |
| Fechar porta | Dentro da zona: "Close Door". Ninguém novo entra; quem já está dentro também pode abrir ou fechar **[confirmado — K18]** | Na lista de usuários aparece um cadeado ("Closed Zone") **[confirmado — K29]** |
| Vídeo sempre ligado | Self-view ("Confidence Monitor") no canto superior direito. `C` esconde ou mostra o self-view, `M` muta, `V` liga/desliga o vídeo **[confirmado — K7]** | Dá para esconder o próprio vídeo para reduzir a "ansiedade do espelho" **[confirmado — K4]** |
| Qualidade de vídeo pela distância | Patente: "Determining video stream quality based on relative position in a virtual space" **[confirmado — K39]** | "Orçamento de streams": máximo de vídeos e pesos por stream, priorizando usuários **[inferido — flags `stream-budget`, `stream-budget-max-video-streams`, `prioritize-user-streams`, K56]** |
| Meeting Mode | Põe os tiles de vídeo de todos à sua frente, mesmo de quem está em outra parte da sala. Só muda a sua visão **[confirmado — K11]** | Botão de "quatro círculos" (antes raio, depois cadeira) **[confirmado — K11, K42]**. Ativação automática com um limiar **[inferido — flag `auto-meeting-mode`=3, K56]** |
| 2D View (honeycomb) | Grade em favo de mel com todos visíveis quando os discos 3D se sobrepõem. Toggle no topo; só muda a sua tela **[confirmado — K9]** | **Auto 2D View**: troca sozinho para 2D quando a zona lota e volta quando esvazia. O falante ativo vai para a frente e aumenta **[confirmado — K9, K42]**. Atalho `G` **[inferido — flag `enable-honeycomb-with-g-key`, K56]** |
| Presenter Mode | Ícone de megafone: "coloca você na tela grande" **[confirmado — K26]** | Patente "Presenter mode in a 3D virtual conference space" **[confirmado — K39]** |
| Mini Theatre | Espaço dedicado a apresentações, all-hands e treinamentos **[confirmado — K42, K15]** | — |
| Office Hours | O host abre o expediente; os colegas recebem alerta e entram numa fila; o host admite um por vez; quando um sai da zona, o próximo é chamado **[confirmado — K19]** | Ótimo para gestores e mentoria |
| Lobby e admissão | Convidados por Link to Me caem num lobby e o host admite **[confirmado — K27]** | Aba "Lobby" no menu da reunião **[confirmado — enum `Lobby`, K56]** |
| Moderação | Mutar outras pessoas (artigo de ajuda) e expulsar do espaço **[confirmado — K4]** | "Mute everyone" e "delegar reunião" (host → delegado) **[inferido — flag `mute-everyone` e estado `showDelegateMeetingModal`, K56]** |
| Emotes | Reações rápidas **[confirmado — K42]** | Patentes "Emotes for non-verbal communication" **[confirmado — K39]**. Emotes com a marca do cliente **[inferido — flag `branded-experience-emotes`, K56]** |
| Indicador de fala | "Voice visualization": animação de quem está falando **[confirmado — K42]** | — |
| Fundo de vídeo | Blur **[confirmado — K32, K23]** | Remoção de fundo **[inferido — flag `background-removal`, K56]**. Patente "Avatar background alteration" **[confirmado — K39]** |
| Seguir apresentador | Permissão `havePeopleFollowThem` (fazer as pessoas te seguirem) e `distribute` (distribuir pessoas) **[confirmado — K56]** | Útil para tours e treinamentos **[inferido]** |

### 2.3 Compartilhamento de tela

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Telas no mundo | **Clicar em qualquer tela visível em mesas ou paredes** para compartilhar, ou usar o botão da toolbar, que conecta à tela mais próxima **[confirmado — K12]** | Os ambientes têm "presentation displays" **[confirmado — K7]** |
| O que compartilhar | Aba (com "Also share tab audio"), janela ou tela inteira **[confirmado — K12]** | No Safari, só a tela inteira **[confirmado — K26]** |
| Visualização | O compartilhamento aparece no jogo e pode ser redimensionado. **Auto-Tilt** gira a câmera para mostrar participantes e tela juntos (desligável). Também abre em janela separada (pop-out) **[confirmado — K12]** | "Auto screenshare" detecta e compartilha a tela pretendida **[confirmado — K42]** |
| Várias telas | Mais de uma tela por sala; os compartilhamentos ficam listados no canto inferior esquerdo com o nome de quem compartilha **[confirmado — K12, K2]** | Patente "Multi-screen presentation" **[confirmado — K39]** |
| Música e vídeo | Compartilhar aba do YouTube com áudio e mutar a aba localmente para evitar eco. O áudio fica só na zona **[confirmado — K36]** | Há artigo próprio sobre eco ao compartilhar vídeo **[confirmado — K5]** |
| Privacidade | Compartilhamento criptografado em trânsito, **não armazenado** **[confirmado — K38]** | — |

### 2.4 Qualidade de áudio

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Noise Reduction | Toggle nas configurações, sem reiniciar. Atua **só no microfone** e mira conversas ao lado, digitação, ventilador, trânsito, cachorro **[confirmado — K16]** | Anunciado no roadmap de ago/2026 **[confirmado — K41]** |
| Provedor de supressão | **Não declarado.** Há uma flag `noise-reduction-rnnoise` **[inferido — K56]**, o que sugere **RNNoise** (open source) | — |
| Cancelamento de eco | **Não encontrado** como feature. Só artigos de troubleshooting de eco **[confirmado — K5]** | — |
| Mídia | WebRTC **[confirmado — K30]**. SFU **mediasoup** **[inferido — flags `mediaSoupStatisticsEnabled`, `data-producer-timeout`, K56]**. "Data producers" são um conceito do mediasoup | Prefere UDP; WireGuard é preferível a OpenVPN TCP; split tunneling **[confirmado — K30]** |

### 2.5 Chat e comunicação assíncrona

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Chat no espaço | "In-space chat" **[confirmado — K52]**. Chat em reunião com arquivos **[inferido — flags `in-meeting-chat`, `in-meeting-chat-files`, K56]** | Botão de chat no canto inferior esquerdo **[confirmado — K31]** |
| Histórico | "Chats e atividade espacial salvos automaticamente e baixáveis" **[confirmado — K2]**. A página de segurança diz que a Katmai **"não armazena histórico de chat"** **[confirmado — K38]**. **Contradição** | — |
| Whiteboards | "Whiteboards that stay put. Pick up where you left off" **[confirmado — K2]** | Persistência espacial: o quadro fica na sala |
| Notas e artefatos | "Deixar notas ou artefatos que outros encontram ao entrar" **[confirmado — K59]** | — |
| DMs, threads, canais | **Não encontrados** | A Katmai se posiciona como complemento de Slack e Teams, não como substituto **[confirmado — K3]** |
| Slack | "Katmai in Slack": ver e entrar em espaços pelo Slack (roadmap) **[confirmado — K42]** | Flag `katmai-in-slack-integration` **[K56]** |

### 2.6 Presença e status

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Status na lista Users | **With Others** (dois bonecos: está numa zona com gente), **Away** (relógio), **Closed Zone** (cadeado), **Guest** (ingresso roxo) **[confirmado — K29]** | O status é derivado do espaço (estar numa zona), não só declarado |
| Away | Tecla `Z`: desliga câmera e mic, avisa os colegas e **pausa a visão do escritório**. O avatar fica com outra aparência **[confirmado — K7, K29]** | Pausar a renderização em Away economiza CPU e GPU **[inferido]**. Existe um estado `sleepMode` **[K56]** |
| Luz de presença | Toggle para desligar o indicador de presença **[confirmado — K42]** | — |
| Escritório próprio | "Assign Offices": cada pessoa tem um lugar encontrável. Usuários registrados têm mesa permanente **[confirmado — K2, K3]** | — |
| Disponibilidade | "Mute o mic para focar, mute o vídeo para dar uma saída sem sair, feche a porta" **[confirmado — K2]** | — |
| Métricas de uso | Mais de 23 horas por semana de "conexão ambiente" por usuário **[confirmado — K42]** | — |
| Desconexão por ociosidade | — | **[inferido — flag `idle-client-disconnect`, K56]** |

### 2.7 Avatares e customização

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Vídeo como avatar | Não há avatar desenhado: a webcam da pessoa aparece num disco ou bolha que anda pelo 3D **[confirmado — K1, K9, K49]** | Patentes "Volumetric avatar rendering", "Volumetric scattering effect... with navigable video avatars" e "Navigating a virtual camera to a video avatar" **[confirmado — K39]** |
| Nome e preview | Na tela de boas-vindas: nome de exibição, preview de como você aparece e ajuste gráfico antes de "Enter Space" **[confirmado — K7]** | — |
| Configurações de avatar | — | **[inferido — flags `avatar-settings`, `space-avatar-settings` e permissão `changeAvatar`, K56]** |
| Sem roupas, pets ou cosméticos | **Não encontrados.** É uma decisão de produto: "real people" **[confirmado — K1]** | — |

### 2.8 Editor de mapa, builder, objetos interativos e embeds

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Presets de espaço | **Central Office** (de 3 a 6 áreas de coworking, 1–2 salas, 4–14 escritórios; o número no nome indica o tamanho ideal do time), **Central Rooftop**, **Katmai Penthouse**, **Katmaitai** **[confirmado — K22, K24]** | Mais presets prometidos **[confirmado — K24]** |
| Branding Points | Admin entra em "Brand Your Space", os pontos de marca acendem, ele clica e faz upload de imagem. Há carrossel de imagens recentes; pilares com textura própria **[confirmado — K25]** | Os pontos de marca aparecem dos dois lados da parede **[confirmado — K25]** |
| Logo, cores e layout | Pelo Space Settings **[confirmado — K3]**. Nomear salas, rótulos **[confirmado — K2]**. Personalização em 2D (logos e arte) **[confirmado — K42]** | — |
| UI com a marca do cliente | Páginas de setup técnico, carregamento e erro com a marca do cliente **[inferido — estados `hasBrandedTechnicalSetupPage`, `hasBrandedSpaceLoadingPage`, `hasBrandedFatalErrorPage`, K56]** | White-label para enterprise com domínio próprio (roadmap) **[confirmado — K42]** |
| Editor de nível (interno) | Modo "build", painel de prefabs, visualização de colisão, zonas, zonas de pulo e "situators" **[confirmado — estado de UI, K56]**. Permissão `levelEditorAccess` **[K56]** | **Não é self-service**: o time da Katmai monta os espaços na "reunião de configuração" **[confirmado — K3]** |
| Customizar objetos | — | **[inferido — flag `object-customization` e permissão `customizeObjects`, K56]** |
| Embeds de web | **Não encontrados** | — |

### 2.9 Jogos e social

| Feature | Detalhe |
|---|---|
| Jogos | **Não encontrados** |
| Lazer espacial | Ilha com natação e tobogã, cinema na penthouse, varanda e rooftop **[confirmado — K24]** |
| Emotes | Ver 2.2 |
| Recompensas | **[inferido — flag `reward-activity`, K56]** |
| Ideia futura | Uma "estação de observação de ursos" inspirada no Parque Nacional Katmai, sem compromisso **[confirmado — K51]** |

### 2.10 Reuniões

| Feature | Como funciona | Detalhe de UX notável |
|---|---|---|
| Instant Katmai | Botão no painel cria um espaço ad hoc com link para mandar **[confirmado — K28]** | — |
| Guest Pass | Tecla `P` ou ícone. Nome, sobrenome, e-mail, **upload CSV** em lote, e-mail automático opcional, **pass compartilhável** (qualquer um com o link), duplicar, desativar, busca por status, período ou espaço **[confirmado — K35]** | O convidado chega na entrada do escritório no horário combinado e o host vai buscá-lo **[confirmado — K28]**. Entrada antecipada, aviso de expiração e identificação do convidado **[inferido — flags `guest-pass-*`, K56]** |
| Agendamento | "Reuniões agendadas com pauta e compartilhamento de tela" **[confirmado — K3]**. **Integração com Google Calendar ou Outlook: não encontrada.** Há integração com **Calendly** **[confirmado — K4]** | Sugestão: colar o Link to Me no convite **[confirmado — K14]** |
| Gravação | **Não há gravação nativa.** A ajuda ensina a gravar com o **OBS** **[confirmado — K17]** | Flag `record-video` desligada **[inferido — K56]**. A segurança afirma que "não grava áudio nem vídeo" **[confirmado — K38]** |
| Transcrição e IA | **Não há nativa.** A ajuda sugere um app de desktop (Plaud) capturando o áudio do sistema; nativa "em desenvolvimento" **[confirmado — K15]**. Planejado: transcrição, resumos e action items para nov–dez/2026 **[confirmado — K41]** | Flag `transcribe-zone-audio` (transcrever por zona) **[inferido — K56]** |
| Interview Loop | Experiência de entrevista de contratação, feita com um cliente enterprise: experiência com a marca, papel de **candidato**, pesquisa de pulso do candidato, analytics de entrevistadores **[confirmado — K41; papel `candidate` e flag `interviewLoop-candidatePulseSurvey`, K56]** | Espaço do tipo "NewInterviewLoopSpace" no painel **[confirmado — K56]** |
| Papéis em reunião | Host, Participant, Delegate, Candidate **[confirmado — K56]** | — |

### 2.11 IA

| Feature | Situação |
|---|---|
| Transcrição, resumos e action items nativos | **Planejados** para nov–dez/2026 **[confirmado — K41]**. Hoje só há o workaround com app externo **[confirmado — K15]** |
| Data Platform ("Data & Insights") | Analytics de uso do escritório, horário central de trabalho, reuniões, padrões de colaboração e adoção. Demo para clientes em ago/2026 **[confirmado — K41]** |
| Outras features de IA | **Não encontradas.** A comparação da própria Katmai diz que ela "não empacota ferramentas de IA de reunião" **[confirmado — K45]** |

### 2.12 Integrações

| Integração | Situação |
|---|---|
| Calendly | Artigo de ajuda **[confirmado — K4]** |
| Slack | Planejado / atrás de flag **[confirmado — K42; K56]** |
| SSO/IdP | Google SSO para todos. Amazon Federate no enterprise. Okta, Azure e Office365 "em desenvolvimento" **[confirmado — K38]**. No código: `local-auth` (sessão de 30 dias), `google-oidc`, `amazon-oidc` (enterprise), `okta-oidc` (enterprise) **[confirmado — K55, K56]** |
| API pública, webhooks, MCP, Zapier | **Não encontrados** |
| Calendário Google/Outlook | **Não encontrado** |

### 2.13 Admin, segurança e privacidade

| Feature | Como funciona | Detalhe |
|---|---|---|
| Papéis | Office Administrator e Team Member no painel **[confirmado — K34]**. No código também existem Katmai Super User, Guest, Customer Service e Invited **[confirmado — K56]** | Tipos de cliente: public, guest, user, coworker, colleague, owner **[confirmado — K56]** |
| Permissões granulares | `adminPortal`, `levelEditorAccess`, `flyingAccess`, `manageFeatures`, `managePeople`, `manageSpaces`, `managePermissions`, `manageOrganizations`, `manageGuestPasses`, `changeSkybox`, `changeArchitecture`, `changeAvatar`, `shareScreen`, `presentSelf`, `havePeopleFollowThem`, `distribute`, `enterMultipleTimes`, `moderationControls`, `removeAnyUserFromOrganization`, `customizeObjects`, `customizeBranding` **[confirmado — K56]** | Útil como checklist de permissões para a Infinity |
| Acesso ao espaço | Admin escolhe quem entra e quando. Guest passes limitados por data, hora e duração **[confirmado — K1, K38]** | Patente "Time access control in virtual environment" **[confirmado — K39]** |
| Hospedagem | **AWS**, servidores na América do Norte e na Europa. Hospedagem por país "em desenvolvimento" **[confirmado — K38]** | — |
| Criptografia | Áudio, vídeo e dados criptografados em trânsito e em repouso; HTTPS/TLS; chat criptografado cliente-servidor. **E2E não mencionado** **[confirmado — K38]** | — |
| Certificações | **Nenhuma própria.** SOC 2 e ISO 27001 aparecem só como certificações dos data centers da AWS **[confirmado — K38]**. GDPR e LGPD: **não mencionados** | Uma página de comparação deles tem um placeholder "[VERIFY]" sobre segurança **[confirmado — K60]** |
| Dados | PII limitada a nome, sobrenome e e-mail. Não grava A/V, não vende dados. Pentests com terceiros. Notificação de incidente **[confirmado — K38]** | — |
| Ciclo enterprise | Um cliente grande levou cerca de **6 meses** de InfoSec, privacidade, retenção e jurídico **[confirmado — K51]** | — |
| Fingerprinting | Config para chave da Fingerprint (identificação de dispositivo) **[inferido — `fingerprintApiKey` e flag `fingerprinting`, K56]** | Ponto de atenção de privacidade |

### 2.14 Performance e requisitos

| Item | Detalhe |
|---|---|
| Requisitos oficiais **[confirmado — K6]** | **Mínimo:** Intel Core i7 11ª geração ou Core Ultra 7, AMD Ryzen 7 5000, Apple M1. **16 GB de RAM.** GPU integrada. **Windows 11 ou macOS 15.3+.** **Chrome atualizado.** 20/5 Mbps. **Recomendado:** i7 13ª geração ou Core Ultra 9, Ryzen 7 7000, M2 Pro; GPU dedicada; 50/10 Mbps; **cabo**; webcam e mic externos com fio |
| Modos gráficos **[confirmado — K13]** | **Enhanced** (máquinas fortes, GPU dedicada), **Balanced** (padrão), **Efficient** (máquinas corporativas e antigas), **HyperLite** (o mais leve). Escolhe-se no login ou durante a sessão, **sem reiniciar** |
| Histórico | Em jun/2024 o padrão passou a ser Efficient **[confirmado — K43]**. Hoje o padrão é Balanced **[confirmado — K13]**. Ajuda antiga: "Graphics: Low Power" e "Resolution: 480p" **[confirmado — K31]** |
| HyperLight / Basic Mode | Modo 3D ultraleve para laptops corporativos, que reduz CPU, GPU e bateria (ago/2026). **Basic Mode = mapa 2D sem 3D** para "praticamente qualquer dispositivo corporativo" (nov–dez/2026) **[confirmado — K41]** |
| Diagnóstico | Pedem o relatório de `chrome://gpu` por e-mail **[confirmado — K6]**. Botão "Reconnect" **[confirmado — K31]**. Alerta de rede ruim **[confirmado — K43]** |
| Histórico de peso | "Derretemos alguns PCs no começo" **[confirmado — K51]** |
| Download | Assets em **glTF**. Meta: "download em 10 segundos ou menos" **[confirmado — K49]** |

### 2.15 Mobile e acessibilidade

| Feature | Detalhe |
|---|---|
| Mobile web (beta) | Escolha de modo ao entrar: **2D Video Conference** (vê participantes e telas, usa câmera e mic) **enquanto quem está no desktop te vê como avatar no 3D**; **Audio Only**; **3D Mode** (não substitui o computador). Troca entre 2D e áudio sem sair da reunião **[confirmado — K14]** |
| Controles | Joystick flutuante e botão de pulo **[confirmado — K8]** |
| Roadmap | App mobile reconstruído, "full participation" **[confirmado — K42]**. Audio-only mobile (ago/2026) **[confirmado — K41]**. Painel responsivo e alvos de toque maiores **[confirmado — K43]** |
| Acessibilidade | Atalhos de teclado, toggle de dicas, 2D View e mapa ajudam. **Não há declaração WCAG**, legendas ou leitor de tela **[não encontrado]** |

### 2.16 Onboarding

| Feature | Detalhe |
|---|---|
| Venda assistida | Demo → **reunião de configuração** em que o time da Katmai monta os espaços e adiciona os usuários → sessões de onboarding. "A maioria dos times está trabalhando em dias" **[confirmado — K3, K47]** |
| Tela de entrada | Nome, preview, modo gráfico, botão "Enter Space" **[confirmado — K7]** |
| Walkthrough | Itens: convidar convidados, compartilhar tela, explorar o Katmai, admitir convidados **[confirmado — estado `walkthroughItemsVisibility`, K56]**. "Tips and Tricks" desligáveis **[confirmado — K4]** |
| Planejado | Tutorial de cadastro e vídeo de boas-vindas **[confirmado — K41]** |
| Self-service | Cadastro self-service desligado por padrão **[inferido — flag `allow-self-service-sign-up`=false, K56]** |
| Kit de adoção | Guias de piloto e comunicação interna, com apoio direto do CEO e do CPO (parceria Kinly) **[confirmado — K54]** |

---

## 3. Stack técnica

| Camada | Tecnologia | Evidência |
|---|---|---|
| Site de marketing | **HubSpot CMS** (também a central de ajuda, com formulário de tickets `kb-tickets`) | `generator = HubSpot` **[confirmado — K57]**. KB inferida pelo padrão de URL **[inferido]** |
| App (painel e UI do espaço) | **Vue 3** (Composition API, `<script setup>`), **Pinia**, **vue-router**, axios, Zod | Runtime Vue (`onUpdate:`, `vue_vue_type_script_setup`), strings `pinia`, rotas **[confirmado — K56]**. Zod pelo padrão `oe.string().uuid()` **[inferido]** |
| Build | **Vite** (polyfill de modulepreload, `assets/index-<hash>.js`) | **[confirmado — K55, K56]** |
| Renderização 3D | **Three.js** (WebGL) com pipeline próprio | Flag `threejs-errors-are-fatal` **[confirmado — K56]**. Braund: "construímos nosso próprio motor": "the Katmai engine that merges the 3D world and the audio video conference" **[confirmado — K52, K58]**. Patentes de sombras em cascata, sombras com offset, sombras alpha-mapped, instancing automático, renderização estática de fundo e frente, scattering volumétrico **[confirmado — K39]**. Renderização de texto por atlas **[inferido — flag `atlas-text-rendering`, K56]** |
| Assets | **glTF** **[confirmado — K49]**. Asset server e CDN **CloudFront** **[confirmado — K56]** | — |
| Mídia em tempo real | **WebRTC** com SFU **mediasoup** | Flags `webrtc-timeout`, `webrtc-max-tries`, `allow-webrtc-tcp`, `webrtc-remediation-strategies`, `reconnect-stalled-streams`, `stream-stall-monitor-min-timespan`=10 s, `resubscribe-missing-streams`, `mediaSoupStatisticsEnabled`, `data-producer-*` **[confirmado nomes — K56; mediasoup inferido]** |
| Servidores de sessão | "Workers" com balanceamento: `max-clients-per-worker`=3, `worker-load-balancing`, `kill-corrupt-workers`, `ignore-load-on-server-startup`, `NodeAssignmentStrategy` | **[confirmado nomes — K56]**. A função exata (simulação, roteamento de mídia ou renderização) **não foi encontrada**. "Surrogate clients" com painel de controle parecem clientes simulados para teste de carga **[inferido]** |
| Áudio | Ruído: RNNoise (flag). Espacialização: panorâmica esquerda-direita (patente) | **[inferido — K56; confirmado — K39]** |
| Feature flags | **LaunchDarkly** (122 flags, `clientstream.launchdarkly.com`), mais "cascading configs" próprios por organização/espaço | **[confirmado — K56, K55]** |
| Observabilidade e analytics | **Datadog** RUM e logs, **HubSpot** analytics e e-mails, Google Tag Manager / GA | **[confirmado — K56, K57]** |
| Pagamento | **Stripe** (`stripePublishableKey`) | **[confirmado — K56]** |
| Auth | Local (e-mail, sessão de 30 dias), Google OIDC, Amazon OIDC, Okta OIDC | **[confirmado — K55, K56]** |
| Infra | **AWS**, regiões América do Norte e Europa | **[confirmado — K38]** |
| Engenharia | **Bitbucket** (`bitbucket.org/katmaisource/katmai`) e **Jira** (`katmai.atlassian.net`, épicos `KE-` e `KSD-`) | Links de build no painel de debug **[confirmado — K56]** |

### 3.1 Como a Katmai resolve 3D no navegador

**Performance**
- **Motor próprio sobre WebGL/Three.js**, otimizado com técnicas de jogo: instancing automático, renderização estática do fundo separada dos objetos em primeiro plano, sombras em cascata por área e atlas de texto **[confirmado — K39; inferido — K56]**. A estratégia é **gastar a GPU em iluminação bonita e economizar em draw calls**.
- **Quatro presets nomeados por tipo de máquina**, com exemplos de modelos de laptop em cada um, trocados **a quente** **[confirmado — K13]**. Entram também um **HyperLight** e um **Basic Mode 2D** **[confirmado — K41]**. Lição: mesmo com motor próprio, o 3D fotorrealista **não roda bem em laptop corporativo comum**, e eles estão recuando para modos mais leves e para o 2D.
- **Away pausa a visão** **[confirmado — K7]** e existe `sleepMode` **[K56]**: renderização sob demanda.
- **Orçamento de vídeo**: limite de streams de vídeo simultâneos, pesos e prioridade, mais qualidade de vídeo por distância **[inferido — K56; confirmado — K39]**. Isso é essencial quando cada "avatar" é um vídeo.
- **Meta de download ≤ 10 s com glTF** **[confirmado — K49]**.
- O requisito real é alto: 16 GB de RAM, i7 de 11ª geração, Chrome, Windows 11 **[confirmado — K6]**.

**Câmera**
- **Primeira pessoa**, FOV ajustável (padrão 70) **[confirmado — K49, K56]**.
- **Câmera automática em contextos sociais**: Meeting Mode senta você e arruma os vídeos à frente; Auto-Tilt enquadra pessoas e tela juntos; a câmera navega até o avatar de alguém (patente) **[confirmado — K11, K12, K39]**.
- **Duplo clique para andar**, mouse-look com arraste, `Shift` para correr, joystick e gamepad **[confirmado — K8, K44]**.

**Áudio espacial**
- **Atenuação por distância mais panorâmica estéreo esquerda-direita** pela posição **[confirmado — K47, K39]**.
- **Zonas de som isoladas** (salas, sofás, pátios), com o **contador "quem pode te ouvir"** e sininho de entrada **[confirmado — K10, K49]**. Portas fecham a zona. Escritório de vidro: você vê quem espera, mas não ouve **[confirmado — K49]**.
- **Compartilhamento de tela restrito à zona**, pela mesma arquitetura **[confirmado — K10, K38]**.

**Avatares**
- **Vídeo ao vivo num disco/bolha** em vez de personagem **[confirmado — K9, K49]**. Patentes de "volumetric avatar rendering" e de troca de fundo do avatar **[confirmado — K39]**.
- **Posicionamento automático** ("situators") evita sobreposição e senta as pessoas **[inferido — K56; confirmado — K39]**.
- Quando lota, **cai para o 2D honeycomb** com destaque do falante **[confirmado — K9]**.

**2D e 3D no mesmo mundo (o mais relevante para a Infinity)**
- **No mobile, a pessoa participa em 2D (vídeo), mas para quem está no desktop ela continua aparecendo como avatar no 3D** **[confirmado — K14]**. É exatamente o padrão "dois clientes, um mundo".
- O 2D View é **local**: trocar para 2D não muda nada para os outros **[confirmado — K9]**.
- O Basic Mode (mapa 2D) é descrito como "uma grande mudança" para dispositivos fracos **[confirmado — K41]**.

**Patentes (atenção jurídica para a Infinity)**
- A Katmai lista **mais de 30 patentes concedidas**, a maioria nos EUA, com uma família também no Canadá, na Austrália, no Japão e na Coreia **[confirmado — K39]**. Temas: videoconferência web com avatares navegáveis, áudio esquerda-direita, áreas de volume, quem pode ouvir, áudio privado, qualidade de vídeo por posição, emotes, modo apresentador, várias telas, controle de zonas, navegação de câmera até o avatar.
- **Não encontrei depósito no Brasil na lista** **[confirmado — K39]**. Patentes são territoriais, mas convém **consultar o jurídico** antes de copiar literalmente mecânicas cobertas (ex.: indicador de "quem pode te ouvir", vídeo em avatar navegável), ainda mais se o produto da Infinity um dia for comercializado ou usado fora do país **[inferido; não é parecer jurídico]**.

---

## 4. Padrões de UX/design que valem estudar

1. **"Quem pode te ouvir" sempre visível** (contador e lista da zona) e sininho quando alguém entra **[K10, K49]**. Resolve o maior medo do áudio espacial: falar algo achando que está em privado.
2. **Portas como privacidade física**, com feedback visual (maçaneta verde ou amarela, barreira em área aberta) e espelhadas no status ("Closed Zone") **[K18, K29]**.
3. **Escritórios de vidro**: privacidade de áudio sem perder presença visual. Você vê que alguém está esperando para falar **[K49]**.
4. **Teletransporte com consentimento** ("Jump to user" pede permissão) **[K20]** e **Link to Me** que leva a você, não a uma sala genérica **[K27]**.
5. **Office Hours com fila** **[K19]**: transforma "tem um minuto?" em fluxo organizado.
6. **Câmera que se organiza sozinha** em reuniões (sentar automático, Auto-Tilt, 2D quando lota) **[K11, K12, K9]**.
7. **Modo gráfico com exemplos de máquinas reais** ("MacBook Air → Balanced; ThinkPad T-series → Efficient") e troca a quente **[K13]**.
8. **Atalhos de uma tecla** (`M`, `V`, `C`, `Z`, `P`) para as ações mais frequentes **[K7]**.
9. **Away que pausa a renderização** e avisa os colegas **[K7]**.
10. **Branding por "pontos de marca"** no ambiente, em vez de um editor livre **[K25]**: simples para admin e difícil de "estragar" o visual.
11. **Ambientes de lazer temáticos** (ilha, rooftop, cinema) como espaços de cultura, separados do escritório de trabalho **[K24]**.

---

## 5. Críticas e pontos fracos

### 5.1 Reclamações reais (com fonte)

| Reclamação | Fonte |
|---|---|
| "Zoom fatigue" e relutância de pessoas em aparecer na câmera; trabalhadores podem se sentir **monitorados** e sem privacidade | Consultor citado pelo CAIL **[K52]** |
| Aprovação enterprise lenta: cerca de 6 meses de InfoSec, privacidade, retenção e jurídico em uma grande empresa | O próprio CEO **[K51]** |
| Protótipos tão pesados que "derreteram alguns PCs" | O próprio CEO **[K51]** |
| Reviews poucos: G2 com 4,5 (5 reviews) ou 4,8 (7 reviews), conforme a página, todos positivos e um marcado como incentivado | Resumo da busca no G2 **[K53]** |
| A central de ajuda tem artigos de troubleshooting para tela de carregamento travada, conexão perdida, eco, vídeo ruim, "por que estou andando devagar", VPN | **[K5]**. Indica problemas recorrentes de performance e rede **[inferido]** |

### 5.2 Análise crítica (o que falta) [inferido]

- **Hardware proibitivo** para muitas empresas: 16 GB, i7 de 11ª geração, Chrome, **Windows 11 ou macOS 15.3+** **[K6]**. No Brasil, onde o parque de notebooks corporativos é mais antigo, isso exclui muita gente.
- **Vídeo sempre ligado como avatar** é o diferencial e também o calcanhar de Aquiles: cansaço de câmera, sensação de vigilância, banda e CPU altos. Sem câmera, a pessoa "some" do mundo, já que não há avatar desenhado.
- **Sem gravação, transcrição ou resumo nativos** (OBS e Plaud como workaround) **[K15, K17]**. Atrás do SoWork e de quase todo o mercado em 2026.
- **Sem chat assíncrono de verdade** (DMs, threads, canais), sem calendário Google/Outlook, sem API: depende de Slack, Teams e agenda externos.
- **Escala baixa**: 25–30 pessoas por espaço e cerca de 30 por reunião **[K22, K49]**. All-hands de empresa média não cabe.
- **Sem editor self-service**: o cliente depende do time da Katmai para montar o espaço **[K3]**.
- **Sem certificação própria** (SOC 2 e ISO só da AWS), sem GDPR ou LGPD declarados, sem hospedagem no Brasil **[K38]**.
- **Contradições**: chat "salvo e baixável" **[K2]** contra "não armazenamos histórico de chat" **[K38]**. "Funciona em bilhões de dispositivos" **[K51]** contra requisito de 16 GB e Windows 11 **[K6]**.
- **Só Chrome** e mobile ainda em beta.
- **Patentes** podem ser barreira para quem copiar as mecânicas literalmente (ver 3.1).

---

## 6. Para a Infinity

### 6.1 Copiar

1. **Zonas de som com o indicador "quem pode te ouvir"**, sininho de entrada e **portas que fecham a zona** (inclusive "barreira" em área aberta).
2. **Escritórios de vidro**: ver sem ouvir.
3. **"Pular até a pessoa" com consentimento** e **Link to Me** com lobby.
4. **Office Hours com fila.**
5. **Câmera e posicionamento automáticos em reunião** (sentar, enquadrar tela e pessoas, trocar para grade quando lota).
6. **Presets gráficos com exemplos de hardware reais e troca a quente**, mais **pausar a renderização em Away e em segundo plano**.
7. **Orçamento de streams de vídeo** (máximo de vídeos decodificados, priorizar quem está perto ou falando, reduzir a resolução pela distância).
8. **Cliente "leve" que participa do mesmo mundo**: quem está no 2D aparece para quem está no 3D como presença no lugar certo.

### 6.2 Melhorar

1. **Avatar híbrido**: personagem 3D estilizado (leve, sempre presente) **com o vídeo opcional** num "monitor" ou bolha sobre ele quando a câmera está ligada. Mantém a presença sem obrigar câmera.
2. **2D e 3D como clientes de primeira classe do mesmo estado de mundo**, não o 2D como "modo de emergência". O 2D top-down deve ter as mesmas zonas, portas e telas.
3. **Requisito-alvo realista**: rodar 3D fluido num notebook corporativo de 8 GB com GPU integrada (Chrome e Edge), com 2D garantido em qualquer máquina.
4. **Memória de reunião nativa** (gravação, transcrição em PT-BR, resumo) e **chat persistente** integrados ao espaço.
5. **Editor self-service** com "pontos de marca" e presets, para o time interno evoluir o espaço sem depender de fornecedor.
6. **Escala**: instanciar salas grandes (auditório) e usar 2D/grade automaticamente acima de N pessoas.

### 6.3 Evitar

1. **Câmera obrigatória** como única forma de presença.
2. **Fotorrealismo à custa de performance.** O estilizado bem iluminado envelhece melhor e roda em mais máquinas.
3. **Depender de um navegador e de um SO recentes.**
4. **Onboarding que depende de consultoria**: para uso interno, o espaço precisa nascer pronto e editável.
5. **Mensagens de segurança contraditórias.** Documentar retenção de chat, gravação e analytics com clareza e alinhado à LGPD.

### 6.4 Ideias inovadoras inspiradas na Katmai

1. **"Janela 2D no mundo 3D":** quem está no modo 2D (ou no celular) aparece no 3D como um "holograma" ou painel na posição dele; quem está no 3D aparece no 2D como token com direção do olhar. Todos ouvem a mesma acústica espacial.
2. **"Mapa de calor de audibilidade":** ao segurar uma tecla, o chão mostra até onde a sua voz chega (com paredes e portas). Torna o áudio espacial visível e confiável.
3. **"Câmera diretora":** em reuniões 3D, um modo de câmera automático corta para quem fala (como transmissão esportiva) e volta ao plano geral quando há silêncio. Útil para gravações e para quem tem dificuldade de navegar.
4. **"Porta de vidro fosco":** um terceiro estado de porta entre aberta e fechada. Os outros veem que você está ocupado e quantas pessoas estão dentro, mas não quem. Dá para "bater" e deixar um recado de voz de 10 s.
5. **"Degradação graciosa por pessoa":** o cliente mede o FPS e, por conta própria, reduz sombras, desliga vídeos distantes, troca vídeo por foto e, no limite, oferece "continuar em 2D, no mesmo lugar", sem sair da reunião.

---

## 7. Fontes

| ID | Fonte |
|---|---|
| K1 | https://katmaitech.com/ |
| K2 | https://katmaitech.com/product |
| K3 | https://katmaitech.com/faqs |
| K4 | https://katmaitech.com/help-center/using-katmai (índice de artigos, inclusive "Calendly", "mute others", "hide self-view", "kick", "tips and tricks") |
| K5 | https://katmaitech.com/help-center/troubleshooting |
| K6 | https://katmaitech.com/help-center/system-requirements |
| K7 | https://katmaitech.com/help-center/katmai-quick-guide |
| K8 | https://katmaitech.com/help-center/how-do-i-move-in-katmai |
| K9 | https://katmaitech.com/help-center/using-2d-view |
| K10 | https://katmaitech.com/help-center/what-is-a-sound-zone |
| K11 | https://katmaitech.com/help-center/what-is-meeting-mode |
| K12 | https://katmaitech.com/help-center/guide-to-screen-sharing |
| K13 | https://katmaitech.com/help-center/finding-the-right-performance-settings-in-katmai |
| K14 | https://katmaitech.com/help-center/using-katmai-when-youre-on-the-move |
| K15 | https://katmaitech.com/help-center/ai-transcription-in-katmai |
| K16 | https://katmaitech.com/help-center/using-the-noise-reduction- |
| K17 | https://katmaitech.com/help-center/how-to-record-your-session-in-katmai |
| K18 | https://katmaitech.com/help-center/can-i-close-my-door |
| K19 | https://katmaitech.com/help-center/how-do-i-set-up-office-hours |
| K20 | https://katmaitech.com/help-center/can-i-jump-to-people-in-my-space-instead-of-walking-over-to-them |
| K21 | https://katmaitech.com/help-center/is-there-a-map-of-my-katmai-space-that-shows-me-where-to-find-other-users |
| K22 | https://katmaitech.com/help-center/how-do-i-change-my-office-architecture |
| K23 | https://katmaitech.com/help-center/how-can-i-disable-automatic-features-in-katmai |
| K24 | https://katmaitech.com/help-center/which-katmai-space-is-best-for-me |
| K25 | https://katmaitech.com/help-center/can-i-add-branding-to-my-katmai-space |
| K26 | https://katmaitech.com/help-center/tips-to-meet-and-present |
| K27 | https://katmaitech.com/help-center/how-do-i-invite-people-directly-to-me-in-katmai |
| K28 | https://katmaitech.com/help-center/how-can-i-set-up-meetings-in-katmai |
| K29 | https://katmaitech.com/help-center/can-i-see-if-someone-is-busy-in-katmai |
| K30 | https://katmaitech.com/help-center/katmai-with-vpn |
| K31 | https://katmaitech.com/help-center/why-am-i-moving-slowly |
| K32 | https://katmaitech.com/help-center/video-setup |
| K33 | https://katmaitech.com/help-center/install-the-katmai-app-on-your-dock-taskbar-or-desktop |
| K34 | https://katmaitech.com/help-center/how-do-i-manage-roles-for-my-team |
| K35 | https://katmaitech.com/help-center/how-do-i-invite-guests |
| K36 | https://katmaitech.com/help-center/how-do-i-play-music-in-katmai |
| K37 | https://katmaitech.com/help-center/how-do-i-change-the-locations-outside-my-space |
| K38 | https://katmaitech.com/security-and-privacy |
| K39 | https://katmaitech.com/patents |
| K40 | https://katmaitech.com/careers |
| K41 | https://katmaitech.com/blog/summer-roadmap-82026 (roadmap, 10/08/2026) |
| K42 | https://katmaitech.com/blog/from-the-cpos-desk-katmai-product-roadmap-review-and-preview (04/11/2025) |
| K43 | https://katmaitech.com/blog/june-product-update-blog-mobile-ui-refresh-and-new-features (21/06/2024) |
| K44 | https://katmaitech.com/blog/captains-log-not-all-virtual-offices-are-created-equal |
| K45 | https://katmaitech.com/compare/katmai-vs-sowork |
| K46 | https://katmaitech.com/blog/which-virtual-office-companies-are-still-standing |
| K47 | https://katmaitech.com/3d-virtual-office |
| K48 | https://katmaitech.com/newsroom |
| K49 | https://gamesbeat.com/katmai-raises-22m-for-a-new-take-on-the-metaverse-with-3d-virtual-office (24/04/2023; lido via curl) |
| K50 | https://gamesbeat.com/katmai-launches-version-1-0-of-virtual-office-for-online-workers (lido via curl) |
| K51 | https://workathomerockstar.com/erik-braund/ (podcast com o CEO, 2025) |
| K52 | https://cail.com/the-modern-enterprise/ |
| K53 | https://www.g2.com/products/katmai-katmai/reviews e https://www.g2.com/sellers/katmai-78ce5cea-e38b-461d-8389-48b023770ebe (páginas bloqueadas, HTTP 403; usei só o resumo da busca) |
| K54 | https://kinly.katmaitech.com/ |
| K55 | HTML público de https://app.katmaitech.com/login e https://app.katmaitech.com/app (análise estática: `availableIdentityProviderIds`, bundle) |
| K56 | Bundle público `https://app.katmaitech.com/assets/index-8c28d18c.js` (122 flags do LaunchDarkly, permissões, papéis, estado de UI, rotas) |
| K57 | HTML de https://katmaitech.com/ (gerador HubSpot) |
| K58 | Resultados de busca com citações de entrevistas de Erik Braund: https://podcasts.apple.com/gb/podcast/erik-braund-ceo-founder-of-katmai-%2430-million-raised/id1619104989?i=1000706950029 e https://frontlines.io/podcasts/erik-braund (a página deu HTTP 429; citações vistas só nos trechos da busca) |
| K59 | https://katmaitech.com/blog/from-the-cpos-desk-mirror-anxiety-zoom-fatigue-isnt-about-video.-its-about-the-pressure-to-perform |
| K60 | Resultado de busca apontando placeholder "[VERIFY]" sobre segurança numa página de comparação da Katmai (busca "Katmai virtual office review G2 OR Capterra OR reddit"; página exata não aberta) |
