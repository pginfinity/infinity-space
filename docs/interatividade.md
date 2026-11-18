# Infinity Space: interatividade

O escritório precisa ter coisa para fazer em todo canto, sem parecer genérico. Tudo aqui funciona igual no 2D e no 3D, com estado no servidor (todo mundo vê a mesma coisa) e, quando faz sentido, salvo de um dia para o outro.

## Situação (18/11/2026)

Pronto e integrado (base em `docs/atividades.md`):

- **Conversa e encontro:** chat (Geral, Perto com balão sobre a cabeça, conversas diretas, menções), chamar alguém (com teleporte quando é longe), seguir com aceite, busca e comandos (Ctrl+K), ausente automático, janela flutuante com quem fala.
- **Privacidade:** portas das salas (aberta, fechada com "bater", não perturbe com bilhete), roda fechada em área aberta e sussurro (segurar B).
- **Mesas:** check-in até a meia-noite, mesas fixas (admin), até 3 objetos pessoais na mesa e recado deixado na mesa.
- **Rituais:** daily na Sala Eclipse (antes Órbita e Lua, agora uma sala só, com duas entradas e mesa de conferência para 20): roda sorteada, cronômetro suave, passa-a-vez.

- **Escritório:** gongo do Comercial, status no avatar, botão de deploy com foguete, mural de recados, aviãozinho de papel, toca aqui / brinde / abraço, cabine de fotos e mural de fotos da copa.
- **Mural de fotos da copa:** depois da foto na cabine do Marketing, quem saiu nela pode pôr a foto no mural do Café & Copa (parede norte, à direita do Stop). As fotos ficam penduradas em varais, nas duas lentes; perto do mural, E abre a galeria (foto grande, data, baixar, tirar do mural). No máximo 12: as mais antigas saem. Qualquer pessoa perto do mural tira uma foto. Privacidade: a foto é só o render da cena (avatares e móveis); o render esconde qualquer malha com vídeo (câmera ou tela de alguém numa TV), então não leva imagem real de ninguém e não pede consentimento. Só quem saiu na foto recebe o bilhete para enviar (uma foto por disparo, vale 15 min); junto da imagem fica só a data e os nomes já impressos na moldura, nunca quem enviou.
- **Estação viva:** itens na mão, copa (café, chá, água, suco, pipoca) com contador do dia, plantas que murcham e estação de rega, Orbi (robô mascote), jukebox com fila, telescópio, prancha flutuante.
- **Jogos de mesa do café:** damas, dominó (2 a 4) e truco (2 ou 4), com a partida ao vivo no tampo. Cada pessoa recebe do servidor só a própria mão; quem assiste vê quantas pedras ou cartas cada um tem.
- **Arcade:** tabuleiros ao vivo nas mesas, jogo da velha, hockey de mesa e pingue-pongue em tempo real, 3 fliperamas originais com ranking (Faxina Orbital, Cauda de Cometa, Estilhaço), bolinha de papel com recorde do dia, sinuca.
- **Grupo:** Quiz Show com banco de perguntas editável, Desenhe e adivinhe, Stop, Impostor na Estação, Palavra secreta com cartas editáveis.
- **Reuniões:** gravação da sala com envio ao Google Drive.
- **Primeiros passos:** na primeira entrada o Orbi se apresenta, vai até a pessoa e acompanha uma lista que se marca sozinha (andar, usar com E, microfone, chat, achar alguém, mapa, 2D/3D). Tecla ? abre todos os atalhos; dá para rever pela busca, pelos ajustes ou pelo menu Mais.
- **Jukebox:** 10 faixas originais geradas com a ElevenLabs (`scripts/music.mjs`, duas versões de cada; a escolhida fica em `apps/web/public/music`). A versão generativa continua de reserva se um arquivo faltar.

- **Espaço vivo em tempo real:** estação a 400 km sobre São Paulo; Sol, Lua com a fase real, planetas, estrelas reais e Via Láctea; Terra da NASA com dia, noite e luzes das cidades; meteoros nas datas reais (iguais para todos) e eclipses; a luz do escritório vem do Sol de verdade e some na sombra da Terra. Painel "Agora no espaço" no Ctrl+K.
- **Homenagens (easter eggs):** 12 referências discretas a filmes e séries, com arte original (2001, Interestelar, Matrix, Plataforma 9¾, "me venda esta caneta", Chaves, lámen, Soprano, De Volta para o Futuro às 22:04, Konami, Mapa do Maroto, frases do Orbi). Onde fica cada uma: bloco "Homenagens" em `packages/world/src/map/estacao.ts`.
- **Visual Cinema** (oficial): luz física, sombras do Sol, reflexos e gradação de cor; modo "leve" nos ajustes.
- **Mesa de foco (Pomodoro compartilhado):** mesa de quatro lugares no corredorzinho Foco. Quem senta entra no ciclo do grupo (25 min de foco, 5 de pausa, 15 a cada 4 focos), com um relógio só, no servidor; quem chega no meio entra no ciclo em andamento. Anel de progresso sobre a mesa nas duas lentes, chip no HUD para quem está sentado, som suave na troca de fase e status "Foco" automático durante o foco. Pausar, retomar e reiniciar só quando todos os sentados concordam; mesa vazia zera. Nada é contado nem guardado por pessoa.
- **TV do lounge (assistir junto):** no lounge do Átrio, alguém cola um link do YouTube e todos que estão lá veem o mesmo vídeo no mesmo ponto (o player se ajusta quando fica mais de 1,5 s fora do tempo). Fila simples; play, pausa, ±10 s, próximo e trocar para quem está no lounge. O vídeo aparece num painel do HUD (youtube-nocookie); a TV do mundo mostra "Assistindo junto", o título e o progresso. Volume próprio (começa em 35%), abaixa sozinho quando alguém que você ouve fala e só toca no lounge. O servidor guarda só o id do vídeo e o título, em memória.

## Jogos

| Onde | Jogo | Tipo |
|---|---|---|
| Arcade | Xadrez, Lig 4, Jogo da velha | Mesa, 2 pessoas, por turnos |
| Café | Damas (regras brasileiras: captura obrigatória, lei da maioria, dama voadora; empate por 20 lances só de damas, repetição e finais especiais oficiais: 3 damas contra 1 e parecidos em 16 lances de cada lado, 2 contra 1 e parecidos em 5, com a contagem no painel) | Mesa, 2 pessoas, por turnos |
| Café | Dominó duplo-seis (com 4, em duplas; compra do monte com 2 ou 3; batida ou tranca) | Mesa, 2 a 4 pessoas, por turnos, **mãos escondidas** |
| Café | Truco paulista (baralho espanhol, vira e manilha, truco/seis/nove/doze, mão de onze, mão de ferro, carta coberta da segunda vaza em diante, até 12) | Mesa, 2 ou 4 pessoas (em duplas), **mãos e cartas cobertas escondidas** |
| Arcade | Hockey de mesa | Física em tempo real, 2 pessoas |
| Arcade | Pingue-pongue | Física em tempo real, 2 pessoas |
| Arcade | 3 fliperamas com jogos originais (nave no campo de asteroides, cobrinha orbital, quebra-blocos) | 1 pessoa, **ranking do escritório** gravado na máquina |
| Arcade | Sinuca | Física por turnos, 2 pessoas |
| Auditório | **Quiz Show**: apresentador no palco, campainhas na plateia, placar ao vivo; perguntas editáveis (onboarding, cultura Infinity) | Grupo |
| Salas de reunião | **Desenhe e adivinhe** no quadro branco | Grupo |
| Café | **Stop / Adedonha** | Grupo |
| Lounge | **Impostor na Estação**: dedução social com missões espalhadas pela estação | Grupo |
| Marketing Studio | **Palavra secreta**: no painel de letras, quem dá as dicas vê a palavra e as proibidas e fala por voz (ou escreve); o time chuta, o outro time fiscaliza com “Proibida!”. 3 pessoas jogam num time só; com 4 ou mais, quem abriu a mesa escolhe entre dois times sorteados e todos juntos (cooperativo). Começa com 150 cartas originais em 5 temas; **Editar cartas** (perto do painel, sem partida em andamento) cria, edita e apaga cartas (palavra e 4 proibidas) e temas, salvos no servidor, com “restaurar as cartas originais”. O banco só vai para quem abre o editor; no meio da partida ninguém o recebe. No 2D, placar e tempo do painel aparecem numa etiqueta nítida acima dele, por cima de quem está na frente | Grupo |
| Qualquer lugar | Bolinha de papel na lixeira (mira e força) com recorde do dia | 1 pessoa |

## Interações do escritório

| Coisa | O que acontece |
|---|---|
| **Gongo do Comercial** | Toca para o escritório inteiro, confete na sala e aviso "Fulano fechou uma venda!" com mensagem opcional. Conta no placar do mês. |
| **Botão de deploy (Dev Lab)** | Contagem regressiva e um foguete passando pela janela da estação. |
| **Máquina de café** | O avatar sai segurando a caneca. Contador "cafés hoje" na copa. |
| **Plantas** | Murcham se ninguém regar. Regar é uma interação; cuidar das plantas vira hábito do time. |
| **Orbi, o robô mascote** | Passeia pela estação, segue quem chama, recebe carinho, faz emotes. |
| **Toca aqui / abraço** | Emotes de duas pessoas: chegue perto de alguém e convide; os dois fazem juntos. |
| **Aviãozinho de papel** | Escreva um recado e lance: o avião voa pelo escritório até a pessoa. |
| **Mural de recados (Átrio)** | Post-its que ficam no mural para todos, com reações. |
| **Cabine de fotos (Marketing)** | Foto do grupo posando, que vai para o mural de fotos da copa. |
| **Mural de fotos (Café & Copa)** | As fotos da cabine penduradas em varais, com galeria para ver, baixar e tirar do mural. |
| **Telescópio (janela)** | Câmera cinematográfica olhando a Terra. |
| **Jukebox** | Fila de músicas compartilhada, ouvida por proximidade, com trilhas próprias geradas para a Infinity. |
| **TV do lounge** | Assistir vídeo do YouTube junto, sincronizado, num happy hour: link colado no painel da TV, fila e controles para quem está no lounge. |
| **Mesas** | Check-in na mesa rotativa, objetos pessoais e recado deixado na mesa. |
| **Status no avatar** | Balão com status curto (almoço, foco, em call) acima da cabeça. |
| **Prancha flutuante** | Shift vira uma prancha antigravidade para cruzar a estação mais rápido. |

## Rituais

- Daily na sala do time (lista, timer suave, passa-a-vez).
- Mesa de foco compartilhada com Pomodoro (corredorzinho Foco): um relógio para a mesa toda, mudanças só com o acordo de todos.
- Palco do auditório: quem sobe é ouvido por todos; reações da plateia (aplausos, confete) aparecem no palco.

## Ordem de entrega

1. Jogos de mesa (em andamento) e o pacote de interações do escritório.
2. Jogos em tempo real e fliperamas com ranking.
3. Jogos de grupo (Quiz Show, Desenhe e adivinhe, Stop, Impostor, Palavra secreta).
