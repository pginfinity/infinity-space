# Stack técnica dos concorrentes: engenharia reversa com REA

> Pesquisa competitiva para o escritório virtual interno 2D+3D da Infinity. Este documento cobre **só a stack técnica** (render, UI, áudio/vídeo, tempo real, hospedagem), com evidência tirada de bundles e de tráfego de rede. Features e reviews estão em `docs/pesquisa/concorrentes/`.
>
> **Data da coleta:** 15/11/2026 · **Ferramenta:** REA (Reverse Engineer Anything) CLI 6.9.0 · **Navegador:** Chrome 157 isolado, com perfil temporário novo e CDP em `127.0.0.1:9333`.

## Como ler

- **[evidência REA]**: observado pelo REA. As fontes possíveis são a rede capturada por `capture-browser-scenario`, os scripts capturados por `inspect-web-page --include-script-sources` e exportados por `export-web-scripts`, e a análise estática de `analyze-web-bundle`. A citação indica o script ou endpoint.
- **[inferido]**: conclusão derivada da evidência, sem confirmação direta. Inclui donos de IP vistos por DNS/RDAP público, padrões de nomes e cruzamento com a pesquisa de features.
- Strings de biblioteca dentro de um bundle provam que **o código foi entregue ao navegador**. Elas **não provam que a função roda** com os parâmetros padrão. Exemplo: todo `livekit-client` traz o gancho `isKrispNoiseFilterEnabled`, mesmo quando o Krisp não está ativo.

### Método (igual para todos os alvos)

1. `capture-browser-scenario` em modo *connect*: abre a URL numa aba nova, espera de 10 a 18 s e grava eventos `network`, `websockets`, `workers` e `frames`. A espera é a única ação; nada foi clicado nem digitado.
2. `inspect-web-page --include-script-sources`, restrito às origens de script próprias de cada produto, seguido de `export-web-scripts`. Os scripts foram salvos em disco **sem executar nada**.
3. `analyze-web-bundle --detail summary`, que gera Evidence com rotas e candidatos a endpoint.
4. Busca de assinaturas de bibliotecas no texto dos scripts exportados (Phaser, PixiJS, Three.js, LiveKit, mediasoup, Krisp, DeepFilterNet, RNNoise, Socket.IO, SignalR etc.), com leitura do contexto de cada achado.
5. DNS e RDAP públicos dos hosts de mídia observados, para descobrir o provedor (DigitalOcean, Oracle, OVH, AWS).

Todas as evidências estão em `C:\Users\PCGAMER\AppData\Local\Temp\claude\2ad646bcf73c665d\537b840a-6b33-458d-81a7-43a3592ccc7d\scratchpad\rea-stack\`, com uma pasta por alvo. Cada pasta tem `scn-out.json` (rede), `inspect-src.json`, `scripts/` (JS exportado com manifesto), `bundle-evidence.json` e `bundle-summary.json`. As capturas de tela estão em `screenshots\`.

### Regras respeitadas e efeitos colaterais a registrar

- Nenhuma conta foi criada de propósito, não houve login, nenhum formulário foi preenchido e nada foi clicado.
- **Efeito colateral do próprio app:** só abrir dois links públicos de demonstração já fez o app chamar `identitytoolkit.googleapis.com/v1/accounts:signUp`, ou seja, um login **anônimo** automático no Firebase. Os links são a demo `app.flat.social/f/demo-flat` e o escritório público `cosmos.video/v/gbxz-vop2-6dtk/office`, divulgado pela própria Cosmos em "Visit Cosmos team's office now". Isso é comportamento do app ao carregar a página: nenhum dado foi informado. O tour da VirtualStation também envia sozinho um `POST /api/tour/visits`.
- Alvos que exigem login antes de entregar o motor 3D ficaram registrados como limitação (Katmai).

---

## 1. Tabela comparativa

| Produto | Render | UI | A/V (SFU) | Ruído | Tempo real | Avatares | Hospedagem | Confiança |
|---|---|---|---|---|---|---|---|---|
| **Gather (v1)** `app.gather.town` | **Phaser 3.80.1** (WebGL, com fallback para Canvas) [REA] | React 18.3.1 + Redux/redux-saga [REA] | **mediasoup-client** para um SFU próprio. Flags `Livekit` / `LivekitSelfhost` em rollout. TURN da Cloudflare (exposição 1) e da Twilio (0) [REA] | Krisp (configuração `krispNoiseReduction`) + noiseReduction [REA] | WebSocket próprio `wss://router.gather.town` + **protobuf** (ts-proto) [REA]. Firebase Auth [REA] | Sprites 2D no Phaser [REA] | SPA no S3+CloudFront, API atrás da Cloudflare [REA]. Servidores de jogo em regiões nyc3/sfo3/sgp1/fra1/blr1, padrão DigitalOcean [inferido] | Alta |
| **Gather 2.0** `app.v2.gather.town` | **Phaser 3.80.1** [REA] | **React 19.2.0** + MobX [REA] | **mediasoup-client** para SFU próprio. LiveKit só aparece em gravação (`livekit-recording/spaces/`) [REA] | Krisp com níveis de modelo (`perf-krisp-allow-high-model-level`) [REA] | `wss://router.v2.gather.town`. API REST em **msgpack** (`application/x.gather.msgpack`) [REA] | Sprites, com som de passos por tipo de piso [REA] | CloudFront (app e static), API atrás da Cloudflare. Statsig, Amplitude (via proxy), New Relic, Sentry [REA] | Alta |
| **SoWork** `app.sowork.com` | **Motor próprio "hephaestus" v86.4.6, Rust compilado para WASM** (wasm-bindgen), dentro de um iframe [REA] | React 18 + **MUI 5** + **MobX**, build Vite [REA] | **LiveKit** (`livekit-client` 2.23.0). `@cloudflare/realtimekit` aparece nas dependências [REA] | `@livekit/krisp-noise-filter` 0.3.4. MediaPipe para fundo de vídeo [REA] | **socket.io-client + socket.io-msgpack-parser**. Firebase 9 (Auth, Firestore, Remote Config). Chat em `wss://chat.sowork.com` [REA] | Personagens customizáveis "v5" (`characters/v5/*.json`) [REA] | CloudFront no app [REA]. API e chat em AWS ELB us-east-2 [inferido, DNS] | Alta (o .wasm do motor não foi baixado) |
| **Flat.social** `app.flat.social` | **Three.js r182** + Draco (WASM), modelos `.glb` [REA] | **Next.js 16.4.2** (Turbopack) + React [REA] | **LiveKit** (cliente 2.22.0) em `livekit.flat.social` [REA]. IP da DigitalOcean, provável self-host [inferido] | **DeepFilterNet3** (WASM + AudioWorklet, nível 80) [REA] | **Socket.IO** (EIO=4) em `wss://lon.flat.social` [REA]. Firebase Auth anônimo [REA] | Modelos 3D GLB (Heart.glb visto) [REA]. Detalhe do avatar não visto | Cloudflare na frente do app. DigitalOcean Spaces (lon1) para assets [REA]. Droplets DO para LiveKit e socket [inferido] | Alta |
| **ZEP** `zep.us/play/*` | **Phaser 3.80.1** [REA] | Next.js (pages router, dois apps: `web-app` e `play-app`) + React + MobX [REA] | **LiveKit** (cliente 2.4.0) [REA]: **LiveKit Cloud** (`prem-k2zrvfqm.livekit.cloud`) + `livekit.zep.us` / `dev-livekit.zep.us` [REA], com IPs da Oracle Cloud [inferido]. Opção `iceTransportPolicy:"relay"` [REA] | Gancho Krisp do SDK. Uso não confirmado | **ASP.NET Core SignalR + MessagePack** (`/hub/game`) [REA]. Backend .NET [inferido] | Sprites 2D + catálogo de "equipment/wearables" [REA] | Vercel atrás de CloudFront [REA]. PostHog (proxy `ingestion.zetta.so`), Sentry, OpenTelemetry/HyperDX [REA] | Alta |
| **Katmai** `app.katmaitech.com` | **Não observável**: o cliente 3D fica atrás do login (`/app` redireciona para `/login`) [REA]. A pesquisa de features indica motor próprio sobre WebGL/Three.js [inferido] | Portal em **Vue 3** + Vite [REA] | Não observável | Flag `noise-reduction-rnnoise` (padrão: desligada) [REA] | Não observável | Vídeo real das pessoas, sem avatar (pesquisa de features) [inferido] | CloudFront [REA]. LaunchDarkly, Datadog RUM, HubSpot [REA] | Baixa |
| **Cosmos** `cosmos.video/v/*` | **PixiJS v7** (WebGL). Tiles de mapa em textura **DDS** [REA] | React + MobX + Tailwind 2.2.19 (bundle webpack em `/v/`). O site é Next.js [REA] | **LiveKit SDK 2.9.4** para frota própria `sfu{1,2}.{eu1,apse1,sa1,usw1}.cosmos.video` + `video-sfu-allocator` [REA]. Hosts `-direct` em IP OVH [inferido] | **DeepFilterNet3**, **RNNoise** ("Aggressive"), "Vonage noise cancellation" e NS do navegador [REA] | WebSocket próprio `wss://cosmos.video/realtime_api/v1/subscribe` (token + tópicos) [REA]. Firebase Auth anônimo [REA] | Avatares 2D em JSON+PNG (atlas). Tilesets pixel-art de terceiros (LimeZu) [REA] | Cloudflare (site e API), CloudFront (`cdn.eu1`), S3, OVH e AWS [REA + inferido] | Alta (só até o lobby, sem entrar no mapa) |
| **VirtualStation** `app.virtualstation.io` | **Phaser 3.90.0** [REA] | React + Redux Toolkit + MUI, build Vite, PWA [REA] | **LiveKit** (cliente 2.22.0) em `connect.virtualstation.io` [REA]. CNAME `vs-livekit-server-*.ap-south-1.elb.amazonaws.com`, ou seja, LiveKit self-host na AWS de Mumbai [inferido, DNS] | Nenhum filtro dedicado observado (só o gancho Krisp do SDK) | **Socket.IO** (`chat.virtualstation.io`) + `wss://ai.virtualstation.io/ws`. Firebase (FCM) [REA] | Sprite sheets de 32 px (`new-stripe-sheets/Avatar-32-*`), pets e veículos. Mapa em CSV [REA] | CloudFront (app e assets) [REA]. AWS ap-south-1 (api, chat, ai) [inferido, DNS]. Razorpay [REA] | Alta |

**Resumo em uma linha:** o 2D é quase todo **Phaser 3** (Gather ×2, ZEP, VirtualStation) ou **PixiJS** (Cosmos). O 3D no navegador é **Three.js** (Flat; Katmai segundo a pesquisa de features). O áudio e vídeo convergem para **LiveKit**: 6 de 7 entregam `livekit-client` no bundle. No Gather v1 ele está atrás de flags, ao lado do mediasoup; o Gather 2.0 usa mediasoup. A Katmai não pôde ser vista. Para ruído, o open-source usado é **DeepFilterNet3/RNNoise em WASM**. Para estado, **Socket.IO** domina; as alternativas são WebSocket próprio com protobuf ou msgpack, ou SignalR.

---

## 2. Evidências por produto

### 2.1 Gather

#### Gather v1 (`https://app.gather.town/signin`)

Evidence: cenário `ev_c3bc675d…382211`, export `ev_1c7e46c6…b82ce` (8 scripts, 9,2 MB de JS), bundle `ev_99352093…32d632` (52 rotas). Arquivos em `rea-stack\gather\`.

- **Render:** `bundle.61cf1aa5b1821ce935e6.js` contém `VERSION:"3.80.1"` e o banner `"Phaser v"+VERSION` [REA]. Em `main.27098a2769626cb8be39.js` aparecem as chaves `PhaserContextLostState`, `PhaserFallbackToCanvasLastStartup`, `FPSCap` e `onPhaserReady` [REA]. Ou seja, eles tratam perda de contexto WebGL e caem para Canvas quando necessário. O app também baixa `unpkg.com/detect-gpu@5.0.34/dist/benchmarks/d-nvidia.json`, uma biblioteca de detecção de nível de GPU, provavelmente para escolher a qualidade [REA].
- **UI:** React 18.3.1 (`version:"18.3.1"`, `rendererPackageName:"react-dom"`), redux-saga, slices `gate` e `setting` [REA].
- **A/V:**
  - `main.27098…js` traz `mediasoup-client` (Logger, `recvTransport`, `consumerCount("screen")`, `setSFUChoosingStrategy`) [REA].
  - O enum de provedores é `Base`, `Gather`, `GatherV2`, `Livekit`, `LivekitSelfhost`, com `TWILIO_TOKEN_TTL_S=7200` e gates `livekitEnabled` / `livekitSelfhostEnabled` com `exposure` [REA].
  - Os gates de TURN são `EnableCloudflareTurn` (exposição 1), `PreferCloudflareTurn` e `EnableTwilioTurn` (exposição 0) [REA].
  - O SDK `livekit-client` também está no bundle (função `.livekit.cloud` / `.livekit.run`) [REA].
- **Ruído:** chaves `noiseReduction-X`, `krispNoiseReduction-X`, `echoCancellation`, `gainControl`, `KrispNewBadge` [REA].
- **Áudio espacial:** só o gerenciador de som do Phaser (`createPanner` / `createStereoPanner`), que vale para efeitos sonoros [REA]. A espacialização da voz não aparece no bundle de login.
- **Tempo real:**
  - Config de produção com `routerURLs: ["wss://router.gather.town"]` e `regions: nyc3-c, nyc3-a, sfo3-b, sfo3-a, sgp1-b, sgp1-a, fra1-b, blr1-a` [REA]. Esses slugs são os nomes de região da DigitalOcean [inferido].
  - Mensagens geradas por ts-proto (`protobufPackage`, `MoveDirectionEnum`, `SpriteDirectionEnum`, `RespawnAtDesk`) [REA].
  - `socket.io-client` também está no bundle [REA].
- **Auth e dados:** Firebase (`identitytoolkit`, `securetoken`, `gather-town.firebaseio.com`). Storage via proxy `cdn.gather.town/v0/b/gather-town.appspot.com` atrás da Cloudflare [REA]. Imagens em `gather-town.imgix.net` [REA].
- **Analytics e observabilidade:** New Relic (`bam.nr-data.net`), Amplitude via proxy próprio (`crystal.gather.town/2/httpapi`, mesmo caminho da API Amplitude), Sentry, Cloudflare Turnstile, Google Identity [REA].
- **Hospedagem:** `app.gather.town` responde com `x-amz-cf-id` e `x-amz-expiration` (S3 + CloudFront). `api.gather.town` e `cdn.gather.town` respondem com `cf-ray` (Cloudflare) [REA].

#### Gather 2.0 (`https://app.v2.gather.town/signin`)

Evidence: cenário `ev_f9d76abe…673690`, export `ev_efa56027…328c2` (23 scripts, 12 MB), bundle `ev_67d6299e…1c2c1739`. Arquivos em `rea-stack\gather-v2\`.

- **Render:** `bundle.6f2d2aefd41d12dd.js` traz Phaser `VERSION:"3.80.1"` e PannerNode com `panningModel:"HRTF"`, `distanceModel:"inverse"` (som do Phaser) [REA]. São 85 arquivos `.ogg` de passos por piso (Carpet, Wood, Stone, Grass) em `static.gather.town/sounds/footsteps/` [REA].
- **UI:** `if("19.2.0"!==…)` confirma **React 19.2.0**. Também tem MobX [REA].
- **A/V:** `mediasoup-client` com `createSendTransport` / `createRecvTransport`, `iceServers` e `iceTransportPolicy`. A telemetria usa `av.sfu.endpoint` e `sfu.consumer_id` [REA]. LiveKit só aparece como `livekit-recording/spaces/` e no evento `meeting.recording_livekit_limit_reached` [REA]. Ou seja, o v2 roda **SFU próprio com mediasoup** e usa LiveKit para gravação [inferido].
- **Ruído:** `krispPostAgcTargetDbfs`, `perf-krisp-allow-high-model-level` e `desktop_app_config` [REA]. Isso sugere Krisp com mais força no app desktop [inferido].
- **Tempo real:** `switchEnv({prod:["wss://router.v2.gather.town"], staging:[…], local:["ws://localhost:1443"]})`. A API usa o header `Accept: application/json, application/x.gather.msgpack` [REA].
- **SaaS:** Statsig (`statsigClientAPIKey`, `featureassets.org/v1/initialize`), Amplitude, New Relic, Sentry, WorkOS (SSO), Stripe, Firebase Auth (`accounts:signInWithCustomToken`) [REA].
- **Hospedagem:** CloudFront em `app.v2` e `static`. Cloudflare em `api.v2` e no router, cujo IP 104.18.x é da Cloudflare [REA + inferido].
- **Limitação (vale para v1 e v2):** só a tela de login foi vista. O mapa, o WebSocket de jogo e as conexões do SFU não abriram.

### 2.2 SoWork (`https://app.sowork.com/`)

Evidence: cenário com falha, mas a observação parcial foi retida em `scn-out.json`. Export `ev_3704fba4…aa73ac7` (**762 scripts, 26,6 MB de JS só na tela inicial**). Bundle `ev_c1ecb50c…cfc97c8fa` (200 rotas, 910 candidatos a endpoint). Arquivos em `rea-stack\sowork\`.

- **Manifesto de dependências embutido:** `entry-DDZHE0wU.js` traz o `package.json` do app [REA]. Os itens relevantes:
  - Motor e A/V: `@sophya/hephaestus ^86.4.6`, `@sophya/hephaestus-assets-core`, `livekit-client ^2.23.0`, `@livekit/krisp-noise-filter ^0.3.4`, `@cloudflare/realtimekit ^1.2.3`, `@cloudflare/speedtest`, `@mediapipe/tasks-vision`, `hark` (detecção de voz), `howler`.
  - Estado e rede: `socket.io-client ^4.4.1`, `socket.io-msgpack-parser`, `notepack.io`, `@bufbuild/protobuf`, `firebase ^9.21.0`.
  - UI: `mobx 6.12`, `@mui/material ^5`, `react ^18.2`, `react-router 5.1.2`, `@excalidraw/excalidraw`, `@tiptap/*`.
  - SaaS: `@sentry/browser 7.57`, `@amplitude/analytics-browser`, `mixpanel-browser`.
- **Render:** `inWorldMetadata-6ialBFqR.js` gera um iframe que faz `import(base+'hephaestus_bg.js')`, `WebAssembly.compileStreaming(fetch(base+'hephaestus_bg.wasm'))` e `__wbindgen_start()`, com `base="/static/hep/86.4.6/"` [REA]. O padrão `wasm-bindgen` indica **motor próprio em Rust** [inferido]. Não dá para saber se usa WebGL ou WebGPU porque o `.wasm` não é baixado antes do login. Chunks auxiliares: `WorldFpsLimiter`, `GameInputLock`, `isInputActionMovement` e um shader WebGL de hue/sat em `AssetDownloadManager` [REA].
- **A/V:** o chunk `livekit-client.esm-BZTotWk5.js` traz `yc="2.23.0"`. O chunk `video_background-CTTeYphe.js` dispara `enable-lk-krisp-noise-filter` [REA].
- **Tempo real:** a API fica em `https://api.sowork.com/api/v1` e o chat em `wss://chat.sowork.com` [REA]. Os dois apontam por CNAME para `prod-ingress-*.us-east-2.elb.amazonaws.com` [inferido, DNS]. O endpoint de versão de assets é `api.sowork.com/eyekia/api/v1/assets-version` [REA].
- **Dados:** Firebase do projeto `sage-learning-prod` (Installations e Remote Config), Firestore (`firestore-GTHIdcpF.js`) [REA].
- **Avatares:** `characters/v5/customizer_config.json`, `character_art_database.json`, `customizer_product_prices.json`. Os itens de avatar são vendidos [REA].
- **Analytics:** Sentry, Amplitude (com session replay `sr-client-cfg`), Intercom (WebSocket `nexus-websocket-a.intercom.io`), Meta Pixel, GA [REA].
- **Hospedagem:** `app.sowork.com` responde com `x-amz-cf-*` (CloudFront). O site institucional é Framer [REA].
- **Limitações:** o binário WASM do motor e as conexões LiveKit/Socket.IO não aparecem sem login.

### 2.3 Flat.social

Três capturas:

| Captura | URL | Evidence (cenário · export · bundle) | Volume |
|---|---|---|---|
| Login | `app.flat.social/sign-in` | `ev_1f2c1ebf…657149` · `ev_163f81df…cdab` · `ev_5ab92dbe…50d` | 28 scripts, 5,2 MB |
| Lobby da demo | `/f/demo-flat` | `ev_28f303e6…91e1` · — · `ev_d2322d04…51f7` | 52 scripts |
| Sala da demo | `/pt-BR/f/demo-flat/virtual-office-headquarters` | `ev_7671f4b5…177f` · `ev_4acc6a94…cc9` · — | 159 scripts, 16,6 MB |

Arquivos em `rea-stack\flat\`, `flat-demo\` e `flat-room\`.

- **Render 3D:** `window.__THREE__="182"` aparece em `3nlns3hu9bhyn.js`, então é **Three.js r182** [REA]. Na sala o app baixa `/draco/draco_wasm_wrapper.js`, `/draco/draco_decoder.wasm`, `/fonts/helvetiker_bold.typeface.json` e `Heart.glb` do bucket DigitalOcean Spaces `flat-social-bucket.lon1` [REA]. O pipeline de assets é **glTF/GLB com compressão Draco**.
- **UI:** `window.next={version:"16.4.2"}`, `turbopack-*.js` e `_sentryNextJsVersion="16.4.2"`. O Sentry usa o túnel `/monitoring` [REA].
- **A/V:**
  - O chunk `1se6d7ii5_7sr.js` traz `livekit-client` `version:"2.22.0"` [REA].
  - Na sala o app faz `POST /api/open_spatial/token` (gera o token) e `HEAD https://livekit.flat.social/` [REA].
  - `livekit.flat.social` resolve para 165.22.139.42, que o RDAP marca como `DIGITALOCEAN-165-22-0-0`. É um **LiveKit self-hosted na DigitalOcean**, quase certamente [inferido].
- **Ruído:** `3_0yebhfysgbs.js` carrega `DeepFilterNoiseFilterProcessor({sampleRate:48e3, noiseReductionLevel:80, assetConfig:{cdnUrl:"/deepfilternet3"}})`, condicionado a existir `AudioWorkletNode` e `WebAssembly` [REA]. Esse é o filtro **DeepFilterNet3** open-source para LiveKit. Krisp aparece só como campo `krisp_enabled` no protobuf do LiveKit e como gancho do SDK [REA].
- **Áudio espacial:** `0-yc_q0b3k_tf.js` implementa `createMediaStreamSource → createGain → createPanner` com `panningModel="equalpower"`, `distanceModel="linear"`, `refDistance=7.5`, `maxDistance=22.5` [REA]. Ou seja, **áudio espacial próprio em Web Audio sobre as faixas do LiveKit**. Também há `PannerNode` em sons de jogos.
- **Tempo real:** `wss://lon.flat.social/socket.io/?EIO=4&transport=websocket`, que é **Socket.IO** [REA]. O host resolve para 143.110.162.82, da DigitalOcean em Londres [inferido, RDAP]. A API REST é `/api/flats/{slug}`, `/chat/channels`, `/my-permissions`, `/room-map` [REA]. Tipos de sala vistos: `chat`, `conference`, `open_spatial` [REA].
- **Auth e analytics:** Firebase (projeto `flatsocial`, login anônimo automático na demo), Mixpanel EU, Sentry, reCAPTCHA/Turnstile, Stripe [REA].
- **Hospedagem:** `app.flat.social` responde com `cf-ray` (Cloudflare) e `x-powered-by`. A CDN de assets é `*.lon1.cdn.digitaloceanspaces.com` [REA].
- **Limitações:** o avatar 3D e a malha da sala não foram inspecionados em detalhe, e nenhuma faixa de mídia foi publicada (sem câmera e sem microfone).

### 2.4 ZEP

Evidence: home `ev_b6f5e352…e110` / `ev_47a9ecb9…810341f`. Play app `zep.us/play/<id>`: cenário `ev_becbfccd…4c2a`, export `ev_1cc03dec…7b3d` (24 scripts, 8 MB). Arquivos em `rea-stack\zep\` e `rea-stack\zep-play\`.

Para ver o cliente de jogo, foi usada uma rota `play/[mapHashId]` com ID inexistente. O Next.js entregou os chunks da página de jogo mesmo com o mapa dando 404.

- **Render:** um chunk do play app traz `VERSION:"3.80.1"` e `"Phaser v"`, então é **Phaser 3.80.1** [REA].
- **UI:** dois apps Next.js separados (`_next/static/web-app-5488808/` e `play/_next/static/play-app-52adce9/`), React, `mobx-react-lite`, tRPC, Radix UI [REA].
- **A/V:**
  - O SDK é LiveKit `version:"2.4.0"` [REA].
  - A URL do servidor sai de `o.options.rtcHostUrl || ("FREE"===plano ? "https://dev-livekit.zep.us" : "https://livekit.zep.us")`, com fallback para `"wss://prem-k2zrvfqm.livekit.cloud"` [REA].
  - A conexão usa `autoSubscribe:false`, ou seja, assinatura seletiva, e tem a opção `rtcConfig:{iceTransportPolicy:"relay"}` [REA].
  - O log de debug traz um link para o projeto LiveKit Cloud: `cloud.livekit.io/projects/p_5mkvy7a3ua4/sessions/` [REA].
  - `livekit.zep.us` resolve para 152.70.94.231 e `dev-livekit.zep.us` para 64.110.72.219, ambos da **Oracle Cloud** [inferido, RDAP]. Modelo híbrido: self-host para planos menores e LiveKit Cloud "prem" [inferido].
- **Ruído:** só o gancho Krisp do SDK. Nenhum filtro WASM dedicado foi visto.
- **Tempo real:** cliente **ASP.NET Core SignalR** (`HubConnection`, link para `docs.microsoft.com/aspnet/core/signalr`) com **MessagePack hub protocol**. A conexão vai para `${gameServer}/hub/game` (`onGameServerResolved`, `setGameServerHost`) [REA]. Isso indica servidor de jogo em .NET/C# com resolução de host por sala [inferido].
- **Analytics e flags:** Sentry, PostHog com proxy próprio (`ingestion.zetta.so/decide/` e `/e/`), OpenTelemetry (`ingestion.zep.us/v1/traces`, HyperDX), Naver Analytics, Channel.io [REA].
- **Hospedagem:** `zep.us` responde com `x-vercel-id`, `x-vercel-cache` e `x-amz-cf-id` (Vercel atrás de CloudFront). `cdn-static.zep.us` é CloudFront [REA].
- **Limitações:** nenhum espaço real carregou (404), então o WebSocket do servidor de jogo e o tilemap não apareceram.

### 2.5 Katmai (`https://app.katmaitech.com/login`)

Evidence: cenário com falha parcial, export `ev_797bd753…f5ec` (17 scripts, 0,86 MB, dos quais a maior parte é HubSpot), bundle `ev_a831273d…5725`. Arquivos em `rea-stack\katmai\` e `rea-stack\katmai-app\`.

- **UI:** o chunk `KatImg.vue_vue_type_script_setup_true_lang.js` e a marca `__VUE__=!0` em `index-8c28d18c.js` indicam **Vue 3** (SFC com `<script setup>`), build Vite (`assets/*-hash.js`) [REA].
- **Rotas do portal:** `/`, `/:step?/:token?`, `/visit/:verificationToken`, `/dashboard`, `/honeycomb`, `/honeycomb-playground`, `/profile`, `/feature-entity-search` [REA].
- **Onde fica o 3D:** a entrada no espaço é `window.location.href = …/app?s=<space>&v=…` [REA]. Abrir `/app` sem sessão redireciona para `/login` [REA]. **O cliente 3D não é entregue sem login.**
- **Flags do LaunchDarkly** (dão pistas do cliente) [REA]: `atlas-text-rendering` (ligada), `mobile-honeycomb-videos-on-canvas`, `2d-mobile-honeycomb`, `kill-corrupt-workers`, `ignore-load-on-server-startup`, `noise-reduction-rnnoise` (desligada), `background-blur`, `background-removal`, `transcribe-zone-audio`, `include-peer-speaking-indicator`, `optimized-screenshare-controls`.
  - O conjunto sugere vídeo desenhado como textura num canvas, texto via atlas, *workers* de servidor e RNNoise como opção de ruído [inferido].
  - Bate com a pesquisa de features (`concorrentes/katmai.md`: motor próprio sobre WebGL/Three.js, atlas de texto, glTF), que **não** foi confirmada aqui por REA.
- **SaaS:** LaunchDarkly (inclusive stream SSE), Datadog RUM, HubSpot (chat, forms, CMS do site) [REA].
- **Hospedagem:** `app.katmaitech.com` aponta por CNAME para `d37l2ogjqo05va.cloudfront.net` [REA + DNS]. O site é HubSpot CMS atrás da Cloudflare [REA].
- **Limitação principal:** render, A/V e tempo real não foram vistos. Confiança baixa.

### 2.6 Cosmos

Evidence: login `ev_aeed6612…81cb` / `ev_cf23e4f7…1d25` (45 scripts, 1,5 MB). Escritório público `cosmos.video/v/gbxz-vop2-6dtk/office`: cenário `ev_47d88c55…cc34`, export `ev_3370230e…b283` (3 scripts, com o principal `bundle.a71ef9ce38815e01d883.min.js` de 7,7 MB). Captura de tela `ev_948004db…4cd9` mostra o lobby pré-entrada com o pedido de câmera e microfone; nada foi aceito. Arquivos em `rea-stack\cosmos\` e `rea-stack\cosmos-office\`.

- **Render:** o bundle traz `PixiJS Deprecation Warning` e deprecações "since 7.3.0", então é **PixiJS v7** [REA]. O mapa vem em tiles de textura comprimida (`cdn.eu1.cosmos.video/maps_v2/custom_map_*/fg_0_0.dds`, `bg_*.dds`). Animações e avatares vêm em JSON+PNG (`avatars_v2/custom/default_fallback_avatar.json/.png`, `speech_indicator`, `exit_animations_01`) [REA]. Os créditos citam tilesets do itch.io (LimeZu "Modern Interiors", Gutty Kreum) [REA].
- **UI:** React + MobX + Tailwind 2.2.19 [REA]. O site institucional é Next.js atrás da Cloudflare [REA].
- **A/V:**
  - O SDK é LiveKit `version:"2.9.4"`, com `livekitRoom` e `livekitRoomSid` [REA].
  - O fluxo observado [REA]:
    1. `GET sfu.global.cosmos.video/aws_region`
    2. `GET video-sfu.global.cosmos.video/video-sfu-allocator`
    3. `GET /api/v2/regions`
    4. `/health` em `sfu1.eu1`, `sfu1.apse1`, `sfu1.sa1`, `sfu2.usw1` e nas variantes `sfu*-direct.*`
  - É uma **frota própria de SFUs por região, escolhida por latência** [inferido].
  - Os hosts `sfuN.*` passam pela Cloudflare. Os `-direct` saem direto: `sfu1-direct.eu1` = 135.125.218.203, netname `PCI-DE1`, provavelmente OVHcloud Public Cloud [inferido, RDAP]. O allocator fica na AWS [inferido].
  - Com SDK LiveKit, os SFUs devem ser **LiveKit self-hosted** [inferido].
- **Ruído:** módulos `id:"deepfilternet3"` (`DeepFilterNet3Core`, carregado sob demanda) e `id:"rnnoise"` (rótulo "Aggressive", descrição "Stronger removal, sometimes robotic"). Também há `vonageNoiseCancellation`, `browserNoiseCancellation` e `noiseModel` [REA]. O usuário escolhe entre vários modelos.
- **Áudio espacial:** nenhum `createPanner` no bundle. A proximidade usa volume (`gainNode.gain.setTargetAtTime`, `setVolume` do LiveKit) [REA]. Ou seja, a atenuação é por distância, sem HRTF [inferido].
- **Tempo real:** `wss://cosmos.video/realtime_api/v1/subscribe`, autorizado por `GET /api/v2/user/realtime_api_token`, que devolve `token` e `authorized_topics` [REA]. É um **pub/sub próprio por tópicos**.
- **Auth, dados e analytics:** Firebase (projeto `cosmosvideohq`, login anônimo com `provider=anonymous`), Datadog RUM (us3), Sentry, Mixpanel via proxy `mixyp.cosmos.video`, eventos para um ECS em us-west-2, Cloudflare Web Analytics, GTM/Meta [REA].
- **Hospedagem:** Cloudflare (site, API e WebSocket), CloudFront (`cdn.eu1`), S3 (`cosmosvideo-org-assets`) [REA]. OVH e AWS para mídia [inferido].
- **Limitação:** a captura parou no lobby (sem entrar no mapa), então a conexão LiveKit e o WebSocket de movimento não foram observados.

### 2.7 VirtualStation (`https://app.virtualstation.io/tour`)

Evidence: cenário `ev_21822e68…8209`, export `ev_cd724b01…1a80` (29 scripts, 9,1 MB), bundle `ev_7dcc5a75…c7bd`. Captura de tela `rea-stack\screenshots\virtualstation-tour.png` (`ev_a09ed206…ddda`) mostra o escritório pixel-art top-down renderizado. Arquivos em `rea-stack\vs\`.

- **Render:** `useConfetti-CX8PvtWy.js` traz `VERSION:"3.90.0"` e `LOG_VERSION:"v390"`, então é **Phaser 3.90.0** [REA]. O mapa vem de `map-csv/office-floor-5.csv` + `office-floors/office-floor-5.png`. Avatares em sprite sheet de 32 px (`new-stripe-sheets/Avatar-32-*.png`, `Pet-2.png`, `Vehicle-64-*.png`, `AIAvatarSpriteSheet-1.png`). Animações em `api/user-avatar/animations` [REA].
- **UI:** React + Redux Toolkit + MUI, build Vite, PWA (`manifest.webmanifest`) [REA]. O site institucional é WordPress [REA].
- **A/V:**
  - O SDK é LiveKit `Ufn="2.22.0"` [REA].
  - A constante `Xge="https://connect.virtualstation.io"` aponta para o servidor [REA].
  - `connect.virtualstation.io` tem CNAME `vs-livekit-server-1564267957.ap-south-1.elb.amazonaws.com`, ou seja, **LiveKit self-hosted atrás de um ELB na AWS de Mumbai** [inferido, DNS].
- **Tempo real:**
  - `Nc.getInstance("https://chat.virtualstation.io","chat")`, com `socket.connected` e `path "/socket.io"`, indica **Socket.IO** [REA].
  - O assistente de IA usa `wss://ai.virtualstation.io/ws` [REA].
  - As APIs são `api.virtualstation.io`, `chat.*` e `go.api.*` [REA]. O nome `go.api` sugere um serviço em Go [inferido].
- **Outros:** Firebase (FCM/messaging), Razorpay (`rzp_live_*`), Sentry [REA].
- **Hospedagem:** `app.virtualstation.io` e `d25b3o90o3oed9.cloudfront.net` respondem com `x-amz-cf-*` [REA]. A API fica na AWS ap-south-1 [inferido, IP `AMAZON-BOM`].
- **Limitação:** o tour é uma simulação local, e nenhuma conexão LiveKit ou Socket.IO foi aberta durante a captura.

### 2.8 Sites institucionais (páginas públicas)

| Produto | Site | Evidência |
|---|---|---|
| Gather | **Framer** (framerusercontent, events.framer.com), vídeos Wistia | `rea-stack\landing-gather\` |
| SoWork | **Framer** + Leadinfo + Intercom | `rea-stack\landing-sowork\` |
| Flat.social | **Next.js** atrás da Cloudflare + Mixpanel | `rea-stack\landing-flat\` |
| ZEP | **Next.js** (pages) em Vercel+CloudFront, PostHog, Sentry | `rea-stack\landing-zep\` |
| Katmai | **HubSpot CMS** atrás da Cloudflare + jQuery | `rea-stack\landing-katmai\` |
| Cosmos | **Next.js** (app router) atrás da Cloudflare, Firebase, Mixpanel | `rea-stack\landing-cosmos\` |
| VirtualStation | **WordPress** (tema próprio) + tawk.to + Clarity | `rea-stack\landing-vs\` |

---

## 3. Lições técnicas para a Infinity

Contexto: app 2D+3D no navegador, cerca de 20 usuários, VPS própria, só ferramentas gratuitas ou open-source.

### 3.1 O que a convergência dos concorrentes indica (boas escolhas)

1. **Áudio e vídeo: use LiveKit open-source self-hosted.** Seis de sete concorrentes entregam `livekit-client`. A Katmai não pôde ser vista.
   - Flat e VirtualStation rodam o próprio servidor LiveKit (DigitalOcean e AWS).
   - ZEP mistura self-host (Oracle) com LiveKit Cloud.
   - Cosmos usa o SDK sobre uma frota própria.
   - SoWork usa o SDK; o servidor não foi visto.
   - Até o Gather, que construiu SFU próprio com mediasoup, traz o SDK e flags `Livekit` / `LivekitSelfhost` em rollout no v1.
   - Para 20 pessoas, **um único nó LiveKit (Go, Apache-2.0) na mesma VPS, com o TURN embutido em TLS/443**, cobre o caso [inferido]. Não há motivo para mediasoup, que exige escrever a sinalização inteira, nem para uma frota multi-região como a da Cosmos.
2. **Não esqueça o TURN.** O Gather paga TURN de Cloudflare e Twilio (gates `EnableCloudflareTurn` / `EnableTwilioTurn`). O ZEP tem `iceTransportPolicy:"relay"` como opção.
   - Em rede corporativa, UDP bloqueado é a falha número 1.
   - O TURN/TLS embutido do LiveKit, ou um coturn, numa porta 443 dedicada resolve de graça.
   - O proxy da Cloudflare **não** transporta mídia. Por isso a Cosmos expõe `sfu*-direct` fora do proxy, e Flat e ZEP expõem o IP do LiveKit diretamente [inferido].
3. **Áudio espacial no cliente, sobre as faixas do SFU.** Flat faz `MediaStreamSource → Gain → PannerNode` (equalpower, linear, `refDistance` 7,5, `maxDistance` 22,5). A Cosmos só ajusta o volume por distância.
   - Combine isso com **assinatura seletiva**, como o `autoSubscribe:false` do ZEP: cada cliente só assina quem está perto ou na mesma sala. É isso que mantém CPU e banda baixas.
   - Comece com volume por distância (mais barato) e deixe `PannerNode` com equalpower ou HRTF como opção.
4. **Supressão de ruído open-source em WASM, no lugar do Krisp.** Krisp é proprietário: o filtro `@livekit/krisp-noise-filter` depende do LiveKit Cloud ou de licença. Flat e Cosmos usam **DeepFilterNet3** (AudioWorklet + WASM, nível 80 na Flat). Cosmos e Katmai têm **RNNoise** como alternativa mais leve.
   - Proposta: DeepFilterNet3 como padrão, RNNoise para máquinas fracas e o `noiseSuppression` nativo do navegador como fallback. A Cosmos expõe exatamente essa escolha ao usuário.
5. **Para o 2D, Phaser 3 é a escolha consolidada.** Usam Phaser: Gather v1 e v2 (3.80.1), ZEP (3.80.1) e VirtualStation (3.90.0). A Cosmos usa PixiJS v7, mais leve, mas sem tilemap nem física prontos. Dois padrões do Gather valem copiar:
   - Tratar `PhaserContextLostState` e ter `PhaserFallbackToCanvas`, porque perda de contexto WebGL acontece em notebook corporativo.
   - Limitar FPS (`FPSCap`) quando a aba não está em foco.
6. **Para o 3D, Three.js com glTF/GLB e Draco.** A Flat usa Three r182, `.glb` e `draco_decoder.wasm`. A pesquisa de features indica Three.js/WebGL também na Katmai. Para ter **2D e 3D no mesmo mundo**, o padrão mais simples é:
   - Um **modelo de mundo único**: posições e salas no servidor, compartilhadas.
   - Dois renderizadores trocáveis: Phaser (ou Pixi) no modo 2D e Three.js no modo 3D. Outra opção é Three.js com câmera ortográfica no modo 2D, para manter um motor só [inferido].
   - Carregue o motor 3D **sob demanda**. A Flat só baixa Three, Draco e LiveKit dentro da sala (de 28 para 159 scripts). A Katmai separa o portal (Vue) do cliente 3D (`/app`).
7. **Estado em tempo real: Socket.IO basta.** Flat, VirtualStation e SoWork (este com `socket.io-msgpack-parser`) usam Socket.IO. Para 20 pessoas, um servidor Node com Socket.IO (ou Colyseus, se quiser salas e estado sincronizado prontos) é suficiente.
   - Serialização binária, como o protobuf do Gather ou o msgpack de Gather v2, ZEP e SoWork, só vale depois, se a taxa de mensagens de posição pesar [inferido].
   - Alternativa com menos serviços: mandar posições pelos *data channels* do próprio LiveKit [inferido].
8. **Detecte a capacidade do dispositivo e ajuste a qualidade.** O Gather usa `detect-gpu` para escolher o nível. A SoWork tem `WorldFpsLimiter`. A Cosmos manda texturas comprimidas (DDS) em tiles. Para o modo 3D, ofereça presets (sombras, resolução, vídeo no mapa) e escolha o inicial pela GPU detectada.

### 3.2 O que evitar (más escolhas para o nosso contexto)

- **Dependências SaaS proprietárias no caminho crítico.** Os concorrentes usam Firebase Auth/Firestore (Gather, SoWork, Flat, Cosmos, VirtualStation), Krisp, LiveKit Cloud, TURN da Twilio, LaunchDarkly e Statsig. Isso conflita com "VPS própria + gratuito".
  - Equivalentes self-host: autenticação própria com o SSO interno da Infinity (ou Keycloak/Authentik) e Postgres. Para flags, um JSON de config ou Unleash/Flagsmith.
  - Para erros, GlitchTip (compatível com o SDK do Sentry). Para analytics, Umami ou PostHog self-host, se necessário.
- **Motor próprio em Rust/WASM (SoWork "hephaestus" v86).** É um investimento de anos de uma equipe dedicada. Para uma ferramenta interna, use Phaser e Three.js prontos.
- **Bundles gigantes antes do primeiro pixel.** Tamanhos medidos pelo REA:
  - SoWork entrega **762 scripts e 26,6 MB de JS** só na tela inicial.
  - Gather v1: 9,2 MB. Gather v2: 12 MB. Cosmos: um bundle único de 7,7 MB.
  - Metas para a Infinity: shell leve, motor 2D e motor 3D em chunks separados, LiveKit e filtros de ruído só ao entrar na sala.
- **Infra multi-região e frota de SFUs (Cosmos, Gather).** Faz sentido para milhares de clientes no mundo todo. Para cerca de 20 pessoas numa VPS, um nó resolve, e a complexidade operacional não se paga.
- **Excesso de telemetria de terceiros.** Gather carrega New Relic, Amplitude, Sentry, GA, Turnstile e Statsig. Cosmos carrega Datadog, Sentry, Mixpanel, GA, Meta e Cloudflare. Num app interno, isso é peso, superfície de privacidade e custo sem retorno. Basta um coletor de erros self-host.

### 3.3 Stack sugerida a partir dessas evidências (todas gratuitas ou open-source) [inferido]

| Camada | Escolha | Por quê, segundo os concorrentes |
|---|---|---|
| 2D | Phaser 3.8x/3.9x | Gather, ZEP e VirtualStation. Tilemap, sprites e fallback para Canvas |
| 3D | Three.js + glTF/Draco | Flat (r182) e Katmai, segundo a pesquisa de features |
| UI | React + store leve (Zustand ou MobX) | React em 6 de 7. MobX em Gather v2, SoWork, ZEP e Cosmos |
| A/V | LiveKit server self-host + TURN embutido | Flat, VirtualStation, ZEP e Cosmos fazem self-host |
| Áudio espacial | Web Audio (Gain/Panner) + assinatura seletiva | Flat (Panner) e Cosmos (volume) |
| Ruído | DeepFilterNet3, RNNoise e NS nativo | Flat e Cosmos (DeepFilterNet3). Cosmos e Katmai (RNNoise) |
| Tempo real | Socket.IO (ou Colyseus) em Node | Flat, VirtualStation e SoWork |
| Estático e proxy | Caddy/Nginx na VPS. Cloudflare grátis só para HTTP, nunca para a mídia | Padrão da Cosmos (`sfu-direct`) e da Flat |
| Observabilidade | GlitchTip + logs | Substitui Sentry, New Relic e Datadog |

---

## 4. Limitações gerais

- Só foram analisadas telas públicas: login, tour e demos. **Nenhuma** sessão autenticada foi aberta, então os protocolos de jogo (mensagens do WebSocket), as conexões efetivas ao SFU e o binário do motor da SoWork não foram observados.
- Falta de assinatura num bundle de login **não prova** ausência no produto, porque muitos módulos carregam sob demanda depois do login.
- Hospedagem por DNS/RDAP indica o dono do IP no momento da coleta, não a arquitetura completa.
- Os cenários de SoWork e Katmai terminaram com `execution_failure` do provedor Playwright, provavelmente por navegação ou redirecionamento durante a espera. Os eventos de rede retidos na observação parcial foram usados, e os scripts foram capturados normalmente por `inspect-web-page`.
- Os scripts foram baixados e lidos como texto, sem execução. A busca por assinaturas é heurística, e cada achado da tabela foi conferido pelo contexto no código.
