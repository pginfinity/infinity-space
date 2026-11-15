# Infinity Space

Escritório virtual interno da AI Infinity: um mundo só, visto em 2D (PixiJS) ou 3D (Three.js). Uso interno, não comercial. Endereço final: `space.ai-infinity.io`.

Leia antes de mudar algo grande: [docs/arquitetura.md](docs/arquitetura.md) (decisões), [docs/plano.md](docs/plano.md) (etapas e critérios de aceite), [docs/marca.md](docs/marca.md) (cores, fontes, regras da marca).

## Comandos

```bash
npm install          # uma vez
npm run dev          # servidor do mundo (:2567) + web (:5173), juntos
npm test             # testes unitários (vitest)
npm run typecheck    # tsc em todos os pacotes
npx playwright test  # ponta a ponta no Chrome instalado (com `npm run dev` no ar)
```

Atalho de desenvolvimento: `http://localhost:5173/?nome=Ana&lente=3d` entra direto, sem a tela de entrada.

## Estrutura

- `packages/world`: o mundo como dados e regras puras (mapa, colisão, rotas, audição, protocolo). Sem dependências. Servidor e cliente usam o mesmo código; mudou aqui, muda nos dois lados.
- `apps/server`: WebSocket próprio (msgpack) + HTTP (Hono). A sala valida poses (andável, velocidade) e retransmite a 15 Hz.
- `apps/web`: Vite + React 19 + Tailwind 4. `lens2d/` (Pixi), `lens3d/` (R3F, carregada sob demanda), `engine/movement.ts` (movimento independente da lente), `world/registry.ts` (poses em tempo real fora do React), `net/session.ts` (conexão com reconexão).

## Regras

- **Um mundo, duas lentes.** Tudo que existe no 3D existe no 2D, no mesmo lugar. Regras do mundo vão para `packages/world`, nunca duplicadas numa lente.
- **Unidade é metro.** `x` = leste, `z` = sul, yaw 0 = norte, sentido horário. No 3D, `rotation.y = PI - yaw`.
- **Posições a 60 fps não passam pelo React.** Use `world/registry.ts`; a store Zustand guarda só lista, status e UI.
- **Áudio primeiro.** Nada novo entra se áudio, vídeo ou tela estiverem instáveis.
- **Presença, não vigilância.** Nenhuma métrica individual de tempo, atividade ou fala. Nunca.
- **Marca:** laranja como destaque único por tela; o gradiente da estrela só no símbolo e em momentos especiais. A estrela vem do SVG oficial (`apps/web/src/brand/sparkle.ts`); não redesenhar.
- **Textos da interface em pt-BR** via i18next (`apps/web/src/i18n/pt-BR.json`). Comentários de código em português.
- **Segredos** só em `.env.local` (fora do Git). A chave da ElevenLabs é usada apenas em scripts locais de geração de áudio, nunca no app nem na VPS.
- **Antes de dizer que algo está pronto:** typecheck, testes unitários e, se mexeu em fluxo, o teste de ponta a ponta. Olhe os screenshots em `test-results/screens/`.

## Skills de design: precedência

- Fonte de verdade visual: `docs/marca.md`; `PRODUCT.md`/`DESIGN.md` se o impeccable gerar. Não criar `design-system/*/MASTER.md`.
- Em conflito entre skills: craft-floor do impeccable > ui-ux-pro-max. O ui-ux-pro-max é consulta de regras (React/Three.js, acessibilidade), não direção estética.
- Este app é UI de ferramenta (modo Operate do impeccable): densidade e clareza acima de efeitos; nada de padrões de landing page dentro do escritório.
- O impeccable foi instalado sem o executável (modo só texto): não rodar `npx impeccable`, `hooks on`, `login` nem o modo `live`.
