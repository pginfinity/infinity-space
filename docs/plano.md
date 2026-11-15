# Infinity Space: plano de produção (V1)

Cada etapa termina com algo que dá para abrir e testar. Uma etapa só fecha quando o critério de aceite passa, verificado em mais de um navegador ao mesmo tempo.

Escopo da V1 e da V2 conforme as decisões de 15/11/2026. IA, integrações, gravação, editor de mapa e controle remoto de tela ficam para a V2 ([v2.md](v2.md)).

## Etapa 0: Fundação
- Monorepo, tokens da marca (cores, NORD, Geist), CLAUDE.md.
- `packages/world`: formato do mapa, planta do Círculo de Evolução, colisão, rotas, regra de audição, com testes.
- Servidor do mundo (WebSocket próprio) com a sala do escritório.
- Cliente: entrada com nome e cor, lente 2D e lente 3D desenhando o mesmo mapa, movimento por teclado e clique, troca entre lentes.

**Aceite:** duas janelas abertas, uma no 2D e outra no 3D, cada pessoa vê a outra andar no lugar certo, em tempo real.

## Etapa 1: Áudio e vídeo
- LiveKit local, token emitido pelo servidor, entrar mudo.
- Volume que cai com a distância, pan estéreo, conversas ao redor abafadas.
- Zonas e salas: quem está numa sala só ouve quem está nela; sala de vidro (vê, não ouve).
- Privacidade aplicada no LiveKit (permissões por faixa).
- Anel "quem te ouve" no chão e contador no HUD.
- Painel de áudio e vídeo por usuário: dispositivos, ganho, supressão de ruído (DeepFilterNet3, RNNoise, navegador, desligada), eco, ativação por voz ou aperte-para-falar, teste de microfone; câmera com desfoque e fundo da marca; volume por pessoa.
- Vídeo como bolha sobre o avatar e na doca de conversa.

**Aceite:** três pessoas; duas conversam perto e a terceira, longe, ouve abafado; uma entra numa sala fechada e as de fora param de ouvir de verdade (conferido no servidor).

## Etapa 2: Tela compartilhada
- Compartilhar tela, janela ou aba; intenção "documento" ou "vídeo"; várias telas ao mesmo tempo.
- A tela vai para a TV mais próxima no 3D e vira cartão no 2D; TV parada mostra relógio, nome da sala e próxima reserva.
- Tela cheia com um clique, zoom e anotação.
- Janela minimizada: aviso para quem assiste e alerta para quem compartilha.

**Aceite:** teste automatizado simula a janela minimizada e confere o aviso; duas telas simultâneas na mesma sala.

## Etapa 3: Presença e convivência
- Login por convite (link mágico ou senha), perfis, papéis (admin e membro).
- Status Disponível / Ouvindo / Foco / Ausente com efeito explícito; automático por inatividade, tempo escolhido por cada um.
- Mesas fixas e rotativas: Livre/Ocupada, check-in, objetos pessoais na mesa, recado deixado na mesa.
- Chat: canais, mensagens diretas, threads, chat de proximidade (balão).
- Chamar / convidar / ir até; seguir com aceite; busca e comandos (Ctrl+K).
- Portas com três estados, bater, bilhete na porta; cadeado de conversa; sussurro; megafone e palco do auditório.
- Emotes, dança, sentar ("E · Sentar"), janela flutuante (Picture-in-Picture).

**Aceite:** um dia de uso real pelo time sem bug bloqueante.

## Etapa 4: Lente contínua, avatar e direção de arte
- Transição contínua 3D ↔ 2D pelo zoom.
- Criador de avatar (mesmo avatar nas duas lentes).
- Estação espacial: Terra lá fora com o horário real de Florianópolis, céu de galáxia da marca, iluminação de dia e de noite.
- Escada automática de qualidade e parada do render quando minimizado.

**Aceite:** 60 fps no preset Médio num notebook com GPU integrada; transição sem cair da chamada.

## Etapa 5: Jogos e rituais
- Plataforma interna de jogos (módulos do servidor, iguais no 2D e no 3D).
- Jogos: hockey de mesa, sinuca, basquete de escritório, corrida pelos corredores, xadrez, damas, dominó, baralho, quiz com campainha no auditório, desenhe-e-adivinhe, dedução social, palavra secreta. Todos originais.
- Daily na sala do time (lista, timer suave, passa-a-vez); momentos com o gradiente da marca.

**Aceite:** quatro pessoas jogam e quem passa vê o jogo e a plateia.

## Etapa 6: App desktop, celular e som
- App Electron: tela com áudio do sistema, atalhos globais, janela flutuante, iniciar com o sistema.
- PWA para celular e tablet com o 2D completo.
- Sons da ElevenLabs: ambiência por zona, passos por piso, sons de interface, jukebox do lounge.
- Primeira entrada: voo da Terra até o átrio, criação do avatar, tutorial fazendo.

## Etapa 7: Produção
- Deploy na VPS (Docker Compose), HTTPS, backups, monitoramento de erros.
- Teste de carga com 30 participantes simulados (áudio, vídeo e tela).
- Política de privacidade curta e fiel ao código.

## Ritmo
Qualidade acima de pressa. Cada etapa é entregue para o time testar antes da próxima; bugs relatados entram na frente de recursos novos.
