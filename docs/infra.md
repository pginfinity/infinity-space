# Infinity Space: checklist de infra

Para o time de infra preparar a VPS e o domínio. Tudo roda em Docker Compose numa VPS só. Pico esperado: 20 pessoas simultâneas.

## 1. VPS

| Item | Mínimo | Recomendado |
|---|---|---|
| Sistema | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| CPU | 4 vCPU | 4–8 vCPU **dedicadas** (vídeo sofre com CPU compartilhada) |
| RAM | 8 GB | 16 GB |
| Disco | 60 GB SSD | 100 GB NVMe |
| Rede | 1 Gbps, IPv4 público fixo | idem |
| Tráfego | 3 TB/mês | 5 TB/mês ou ilimitado |
| Região | o mais perto possível de Florianópolis (São Paulo ideal) | idem |

Estimativa de tráfego: cada pessoa recebe de 1 a 4 Mbps em conversa com vídeo. Com 20 pessoas, 8 h por dia, o pico fica entre 1 e 3 TB/mês, dependendo de quanto vídeo e tela o time usa.

Precisa ter Docker Engine e o plugin Docker Compose instalados.

## 2. Portas a liberar no firewall da VPS e do provedor

| Porta | Protocolo | Para quê |
|---|---|---|
| 22 | TCP | SSH (restringir por IP, se possível) |
| 80, 443 | TCP | Site e certificados (Caddy) |
| 7881 | TCP | Mídia WebRTC via TCP (quando UDP falha) |
| 50000–60000 | UDP | Mídia WebRTC (principal) |
| 3478 | UDP | TURN (redes que bloqueiam UDP alto) |
| 5349 | TCP | TURN sobre TLS (redes corporativas restritivas) |

## 3. DNS na Cloudflare

| Nome | Tipo | Aponta para | Proxy |
|---|---|---|---|
| `space.ai-infinity.io` | A | IP da VPS | **Proxied** (nuvem laranja) |
| `rtc.space.ai-infinity.io` | A | IP da VPS | **DNS only** (nuvem cinza) |
| `turn.space.ai-infinity.io` | A | IP da VPS | **DNS only** (nuvem cinza) |

- O proxy da Cloudflare **não** transporta WebRTC. Os subdomínios `rtc` e `turn` precisam ficar em "DNS only", senão o vídeo não conecta.
- Em `space.ai-infinity.io`: SSL/TLS em modo **Full (strict)**, com um **Cloudflare Origin Certificate** instalado no Caddy (gerar em SSL/TLS → Origin Server e entregar o certificado e a chave por canal seguro). WebSockets ligados (padrão).
- `rtc` e `turn` usam certificado Let's Encrypt emitido pelo próprio Caddy (precisa das portas 80/443 abertas).

## 4. E-mail para os convites

O login é por convite com link mágico (sem senha), então o servidor precisa mandar e-mail. Quem administra (`ADMIN_EMAILS`) convida pelo painel Pessoas; cada convite chega com um link que vale 7 dias, e depois cada um entra pedindo um link na tela de entrada (vale 15 minutos, uma vez só). Todas as variáveis estão em `.env.example`. Para o envio, uma destas opções:
- **SMTP da própria empresa** (Google Workspace, Microsoft 365 ou outro): host, porta, usuário, senha de app e o endereço remetente (ex.: `space@ai-infinity.io`).
- **Serviço transacional com plano grátis** (ex.: Brevo ou Resend): conta, chave e domínio verificado (registros SPF/DKIM na Cloudflare).

## 5. Acesso e deploy

- Usuário `deploy` na VPS com acesso por **chave SSH** (sem senha), no grupo `docker`.
- Repositório GitHub privado com estes **secrets** em Actions: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.
- Arquivo `.env` de produção criado direto na VPS (nunca no repositório). O modelo vem em `.env.example`.

Primeira subida (uma vez, na VPS):

1. `git clone <repositório> /opt/infinity-space` e criar `/opt/infinity-space/.env` a partir do `.env.example`.
2. Pôr o Origin Certificate da Cloudflare em `/etc/infinity/certs/origin.pem` e `origin.key` (permissão 600).
3. `cd /opt/infinity-space && docker compose --env-file .env -f deploy/docker-compose.yml up -d --build`.
4. Conferir `https://space.ai-infinity.io/health` e entrar com um dos e-mails de `ADMIN_EMAILS`.

Depois disso, cada push na `main` que passar na verificação (typecheck, testes e build) é publicado sozinho pelo workflow `Deploy`. Arquivos: `Dockerfile`, `deploy/docker-compose.yml` (app, LiveKit e Caddy), `deploy/Caddyfile`, `deploy/livekit.yaml`.

## 6. Backups e manutenção

- Backup diário do volume `dados` (contas, mural, plantas, rankings, gravações pendentes e as fotos do mural da copa em `fotos-copa/`, no máximo 12 JPEG, poucos MB), guardado por 14 dias, com cópia fora da VPS. Ex.: `docker run --rm -v infinity-space_dados:/d -v /backup:/b alpine tar czf /b/dados-$(date +%F).tgz -C /d .`
- O certificado do TURN (Let's Encrypt, emitido pelo Caddy) renova a cada ~60 dias e o LiveKit só lê na partida: reiniciar o LiveKit uma vez por semana (cron: `docker compose -f /opt/infinity-space/deploy/docker-compose.yml restart livekit`), de madrugada.
- Atualizações de segurança automáticas do Ubuntu (`unattended-upgrades`).
- Monitoramento simples de disponibilidade (ex.: UptimeRobot grátis) em `https://space.ai-infinity.io/health`.
- Fotos do mural da copa (`/api/mural-fotos/<id>.jpg`): o servidor responde com `Cache-Control: private`, então a Cloudflare não guarda cópia (com o login ligado, só quem tem sessão vê). Não criar regra de cache para `/api/*` na Cloudflare. O envio aceita até 2 MB por foto (o Caddy não limita o corpo por padrão).

## 7. Gravação das reuniões no Google Drive

As reuniões gravadas dentro do Infinity Space (salas de reunião, diretoria e auditório) viram um arquivo de áudio Opus (`.ogg`, cerca de 20 MB por hora) que o servidor envia para uma pasta de um Drive compartilhado do Workspace (Business Standard tem Drive compartilhado). Enquanto isto não estiver configurado, as gravações ficam salvas na VPS (`DATA_DIR/gravacoes`) e são enviadas sozinhas quando a configuração existir.

1. No [Google Cloud Console](https://console.cloud.google.com), criar (ou usar) um projeto da empresa e **ativar a Google Drive API**.
2. Em *IAM e administrador → Contas de serviço*, criar a conta `infinity-space-gravacoes` (sem papéis no projeto) e gerar uma **chave JSON**.
3. No Google Drive, criar o **Drive compartilhado** (ex.: "Gravações Infinity Space"), ou escolher um existente, e adicionar o e-mail da conta de serviço como **Administrador de conteúdo**. Criar a pasta de destino e copiar o id dela (o trecho depois de `/folders/` na URL).
4. Na VPS, guardar o JSON fora do repositório (ex.: `/etc/infinity/google.json`, permissão 600) e pôr no `.env` de produção:
   - `GOOGLE_APPLICATION_CREDENTIALS=/etc/infinity/google.json`
   - `DRIVE_FOLDER_ID=<id da pasta>`
   - `LIVEKIT_INTERNAL_URL=ws://livekit:7880` (endereço do LiveKit visto de dentro da VPS)
   - `TZ_DISPLAY=America/Sao_Paulo` (fuso usado no nome dos arquivos)
5. O servidor precisa do `ffmpeg`: ele entra na imagem Docker do servidor quando o deploy for montado. Fora do Docker: `apt install ffmpeg` e `FFMPEG_PATH=/usr/bin/ffmpeg`.

Cada arquivo leva no nome a sala, a data e a hora, e na descrição a duração, os participantes e quem iniciou. A transcrição fica com o time de IA, lendo dessa pasta.

## O que eu preciso receber

1. IP e especificações da VPS.
2. Acesso SSH (usuário `deploy`) ou alguém do time para rodar os comandos de deploy.
3. Origin Certificate da Cloudflare (certificado e chave).
4. Credenciais de e-mail (SMTP ou serviço transacional).
5. Acesso ao repositório GitHub privado.
6. Os e-mails de quem vai administrar o escritório (`ADMIN_EMAILS`).
7. Para as gravações: o JSON da conta de serviço e o id da pasta no Drive compartilhado (seção 7).
