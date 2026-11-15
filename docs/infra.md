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

O login é por convite com link mágico, então o servidor precisa mandar e-mail. Uma destas opções:
- **SMTP da própria empresa** (Google Workspace, Microsoft 365 ou outro): host, porta, usuário, senha de app e o endereço remetente (ex.: `space@ai-infinity.io`).
- **Serviço transacional com plano grátis** (ex.: Brevo ou Resend): conta, chave e domínio verificado (registros SPF/DKIM na Cloudflare).

## 5. Acesso e deploy

- Usuário `deploy` na VPS com acesso por **chave SSH** (sem senha), no grupo `docker`.
- Repositório GitHub privado com estes **secrets** em Actions: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.
- Arquivo `.env` de produção criado direto na VPS (nunca no repositório). O modelo vem em `.env.example`.

## 6. Backups e manutenção

- Dump diário do PostgreSQL, guardado por 14 dias, com cópia fora da VPS.
- Atualizações de segurança automáticas do Ubuntu (`unattended-upgrades`).
- Monitoramento simples de disponibilidade (ex.: UptimeRobot grátis) em `https://space.ai-infinity.io/health`.

## O que eu preciso receber

1. IP e especificações da VPS.
2. Acesso SSH (usuário `deploy`) ou alguém do time para rodar os comandos de deploy.
3. Origin Certificate da Cloudflare (certificado e chave).
4. Credenciais de e-mail (SMTP ou serviço transacional).
5. Acesso ao repositório GitHub privado.
