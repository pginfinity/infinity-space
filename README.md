# Infinity Space

O escritório virtual da AI Infinity. Um mundo só, visto em **2D** (isométrico, estilo pixel art) ou em **3D**: quem está numa lente vê e conversa com quem está na outra. Uso interno, para até 20 pessoas ao mesmo tempo. Endereço final: `space.ai-infinity.io`.

## O que tem

- **Voz e vídeo por proximidade**, com privacidade aplicada no servidor: salas fechadas isolam, paredes abafam, o palco do auditório fala para a sala toda.
- **Compartilhamento de tela** com intenção (documento nítido ou vídeo fluido); a tela vai para a TV da sala, numa faixa no topo e em tela cheia com zoom; janela minimizada vira aviso, nunca imagem quebrada.
- **Ajustes por pessoa:** microfone, alto-falante e câmera; supressão de ruído em quatro níveis (navegador, RNNoise, GTCRN); volume de cada pessoa; qualidade do 3D (automática, leve, alta).
- **Gravação de reuniões** nas salas de reunião, diretoria e auditório, com aviso para todos e envio ao Google Drive do time.
- **Interatividade:** gongo, foguete de deploy, mural de recados, aviãozinho de papel, toca aqui, cabine de fotos, copa, plantas, o robô Orbi, jukebox, telescópio, status no avatar.
- **Jogos originais:** xadrez, Lig 4, jogo da velha, hockey de mesa e pingue-pongue em tempo real, sinuca, três fliperamas com ranking, bolinha de papel, Quiz Show, Desenhe e adivinhe, Stop e Impostor na Estação.
- **Guia da estação** no mapa ampliado ("o que fazer aqui", com ir até lá).
- **Login por convite** com link mágico no e-mail; app instalável no computador; versão para celular.

## Rodar no seu computador

Precisa de Node.js 24 ou mais novo.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Para testar com duas pessoas, abra uma segunda janela anônima. Atalho de desenvolvimento: `http://localhost:5173/?nome=Ana&lente=3d` entra direto.

Voz, vídeo e tela usam o LiveKit. Baixe o `livekit-server` em [github.com/livekit/livekit/releases](https://github.com/livekit/livekit/releases) e extraia em `.tools/livekit/` (fora do Git); o `npm run dev` sobe tudo junto. Sem ele, o escritório funciona sem mídia.

Em desenvolvimento o login fica desligado. Todas as variáveis de produção estão em [.env.example](.env.example).

## Controles

| Ação | Tecla |
|---|---|
| Andar / correr | WASD ou setas / Shift (no 3D, relativo à câmera) |
| Ir até um ponto | clique no chão |
| Interagir (sentar, jogar, usar) | E ou F |
| Girar a câmera | Q e R |
| Emotes | 1 a 8 |
| Microfone / câmera | M / V |
| Trocar 2D e 3D | L |
| Soltar o que está na mão | G |
| Aceitar toca aqui / brinde / abraço | T |
| Fechar painéis | Esc |

## Testes

```bash
npm run typecheck    # tipos em todos os pacotes
npm test             # testes unitários (vitest)
npx playwright test  # ponta a ponta no Chrome instalado, com npm run dev no ar
```

## Estrutura

- `packages/world`: o mundo como dados e regras puras (mapa, colisão, rotas, audição, protocolo, regras dos jogos e atividades). Servidor e cliente usam o mesmo código.
- `apps/server`: WebSocket do mundo, atividades, login, gravação de reuniões.
- `apps/web`: Vite + React + Three.js (as duas lentes, HUD, mídia e as atividades no cliente).
- `deploy/`: docker-compose (app, LiveKit, Caddy) para a VPS.

## Documentos

- [Arquitetura](docs/arquitetura.md) e [como criar atividades](docs/atividades.md)
- [Plano de produção](docs/plano.md) e [interatividade](docs/interatividade.md)
- [Checklist de infra e deploy](docs/infra.md)
- [O que a V2 vai exigir](docs/v2.md)
- [Marca](docs/marca.md)
- [Pesquisa dos concorrentes](docs/pesquisa/)
