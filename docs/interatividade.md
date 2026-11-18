# Infinity Space: interatividade

O escritório precisa ter coisa para fazer em todo canto, sem parecer genérico. Tudo aqui funciona igual no 2D e no 3D, com estado no servidor (todo mundo vê a mesma coisa) e, quando faz sentido, salvo de um dia para o outro.

## Situação (16/11/2026)

Pronto e integrado (base em `docs/atividades.md`):

- **Conversa e encontro:** chat (Geral, Perto com balão sobre a cabeça, conversas diretas, menções), chamar alguém (com teleporte quando é longe), seguir com aceite, busca e comandos (Ctrl+K), ausente automático, janela flutuante com quem fala.
- **Privacidade:** portas das salas (aberta, fechada com "bater", não perturbe com bilhete), roda fechada em área aberta e sussurro (segurar B).
- **Mesas:** check-in até a meia-noite, mesas fixas (admin), até 3 objetos pessoais na mesa e recado deixado na mesa.
- **Rituais:** daily na Sala Eclipse (antes Órbita e Lua, agora uma sala só, com duas entradas e a roda no tapete): roda sorteada, cronômetro suave, passa-a-vez.

- **Escritório:** gongo do Comercial, status no avatar, botão de deploy com foguete, mural de recados, aviãozinho de papel, toca aqui / brinde / abraço, cabine de fotos.
- **Estação viva:** itens na mão, copa (café, chá, água, suco, pipoca) com contador do dia, plantas que murcham e estação de rega, Orbi (robô mascote), jukebox com fila, telescópio, prancha flutuante.
- **Arcade:** tabuleiros ao vivo nas mesas, jogo da velha, hockey de mesa e pingue-pongue em tempo real, 3 fliperamas originais com ranking (Faxina Orbital, Cauda de Cometa, Estilhaço), bolinha de papel com recorde do dia, sinuca.
- **Grupo:** Quiz Show com banco de perguntas editável, Desenhe e adivinhe, Stop, Impostor na Estação.
- **Reuniões:** gravação da sala com envio ao Google Drive.
- **Primeiros passos:** na primeira entrada o Orbi se apresenta, vai até a pessoa e acompanha uma lista que se marca sozinha (andar, usar com E, microfone, chat, achar alguém, mapa, 2D/3D). Tecla ? abre todos os atalhos; dá para rever pela busca, pelos ajustes ou pelo menu Mais.
- **Jukebox:** 10 faixas originais geradas com a ElevenLabs (`scripts/music.mjs`, duas versões de cada; a escolhida fica em `apps/web/public/music`). A versão generativa continua de reserva se um arquivo faltar.

Ainda não: Pomodoro compartilhado, TV do lounge sincronizada, foto do grupo no mural da copa.

## Jogos

| Onde | Jogo | Tipo |
|---|---|---|
| Arcade | Xadrez, Lig 4, Jogo da velha | Mesa, 2 pessoas, por turnos |
| Arcade | Hockey de mesa | Física em tempo real, 2 pessoas |
| Arcade | Pingue-pongue | Física em tempo real, 2 pessoas |
| Arcade | 3 fliperamas com jogos originais (nave no campo de asteroides, cobrinha orbital, quebra-blocos) | 1 pessoa, **ranking do escritório** gravado na máquina |
| Arcade | Sinuca | Física por turnos, 2 pessoas |
| Auditório | **Quiz Show**: apresentador no palco, campainhas na plateia, placar ao vivo; perguntas editáveis (onboarding, cultura Infinity) | Grupo |
| Salas de reunião | **Desenhe e adivinhe** no quadro branco | Grupo |
| Café | **Stop / Adedonha** | Grupo |
| Lounge | **Impostor na Estação**: dedução social com missões espalhadas pela estação | Grupo |
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
| **Telescópio (janela)** | Câmera cinematográfica olhando a Terra. |
| **Jukebox** | Fila de músicas compartilhada, ouvida por proximidade, com trilhas próprias geradas para a Infinity. |
| **TV do lounge** | Assistir vídeo junto (sincronizado) num happy hour. |
| **Mesas** | Check-in na mesa rotativa, objetos pessoais e recado deixado na mesa. |
| **Status no avatar** | Balão com status curto (almoço, foco, em call) acima da cabeça. |
| **Prancha flutuante** | Shift vira uma prancha antigravidade para cruzar a estação mais rápido. |

## Rituais

- Daily na sala do time (lista, timer suave, passa-a-vez).
- Mesa de foco compartilhada com Pomodoro.
- Palco do auditório: quem sobe é ouvido por todos; reações da plateia (aplausos, confete) aparecem no palco.

## Ordem de entrega

1. Jogos de mesa (em andamento) e o pacote de interações do escritório.
2. Jogos em tempo real e fliperamas com ranking.
3. Jogos de grupo (Quiz Show, Desenhe e adivinhe, Stop, Impostor).
