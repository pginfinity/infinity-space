# Skills e ferramentas de terceiros: revisão de segurança e utilidade

Projeto: escritório virtual interno 2D+3D da Infinity (React + Three.js/React Three Fiber; navegador, desktop e celular; uso interno, sem SEO nem marketing).
Data da revisão: 15/11/2026.

## Como a revisão foi feita

- Os repositórios 1 a 11 foram clonados com `git clone --depth 1` numa pasta temporária de revisão, fora do projeto. Nada de dentro deles foi executado: nenhum script, instalador, `npm`/`npx`/`pip`, hook ou binário. A análise foi só leitura e busca de texto.
- Em todos foram lidos o README, os `SKILL.md`, os manifestos (`.claude-plugin/*.json`, `hooks.json`, `settings.json`) e os arquivos executáveis. Nos repositórios grandes (impeccable, claude-seo, marketingskills) a leitura foi dirigida: instaladores, hooks e launchers foram lidos inteiros, e o resto foi varrido por busca de rede, subprocessos, `eval`/`exec`, caminhos fora do projeto, telemetria e frases de prompt injection.
- Os repositórios 12 a 14 não foram clonados. Foram pesquisados na web.
- Commits revisados (as instruções de instalação no final fixam exatamente estes):

| Repo | Commit revisado |
|---|---|
| Leonxlnx/taste-skill | `f6b76575f949707b4e3c37cd86cb44b0b98643e8` |
| nextlevelbuilder/ui-ux-pro-max-skill | `efd98221354918762b54a5079b39554c3f546f7a` |
| obra/superpowers | `22f0b463e7a5e579904dd6211a520321035526f7` |
| multica-ai/andrej-karpathy-skills | `2c606141936f1eeef17fa3043a72095b4765b9c2` |
| pbakaus/impeccable | `2b86d9c07b97d4bed7de23583e1bd1e58dd2baae` |
| Nutlope/hallmark | `04977e15f3dfd6ee4b74c887dac3eb52665d6c92` |
| juliobsz/skills | `add880bd6ec9f5592a1482846fc0dd282c9161bc` |
| INSANE0777/awwwards-skills | `5dcf198e2090b0a5886846f3821b1fb571ee4c27` |
| img2threejs/img2threejs | `0c0c49bc168e648dbaf9c8c080474de0b3a941b6` |
| AgricIDaniel/claude-seo | `468ed5b0d9e3249394783710e54abb02837e326b` |
| coreyhaines31/marketingskills | `1f837447b20bb6f0e72d87b80ece1c221c362c7d` |

## Resumo

- **Nenhum repositório tem código malicioso.** Não encontrei exfiltração, ofuscação nem prompt injection hostil.
- **Vários repositórios são invasivos:**
  - hooks automáticos que rodam em toda edição ou a cada fim de turno;
  - instaladores que escrevem em `~/.claude` (escopo global);
  - download de binário em tempo de execução;
  - telemetria ligada por padrão.
- **Instalar no projeto** (copiando só as pastas certas, sem hooks):
  - `karpathy-guidelines`;
  - `ui-ux-pro-max` (só a sub-skill principal);
  - `impeccable`, com mitigações obrigatórias;
  - duas skills do superpowers: `systematic-debugging` e `verification-before-completion`.
- **Risco mais sério encontrado:** no impeccable, o modo `live` pode abrir sozinho uma instância do `claude` com `--permission-mode bypassPermissions` (ou do `codex` sem sandbox). O prompt dessa instância inclui HTML e texto da página. É um caminho de prompt injection para execução sem aprovação. A mitigação está na seção de instalação.
- **Todo o resto:**
  - Só como referência: img2threejs, marketingskills (pontual), Awesome-Design-Tools e system-design-primer.
  - Ignorar: taste-skill, hallmark, juliobsz, awwwards-skills e claude-seo. Penpot fica para depois.

---

## 1. Leonxlnx/taste-skill

**O que é.** Skill para Claude Code (também vem como plugin, `.claude-plugin/marketplace.json`). Uma skill só, `design-taste-frontend` (v2.5.1), em `skills/taste-skill/`. Gera **sites institucionais e landing pages** "no nível de figma.com e x.ai":
- uma seção por tela;
- fotografias reais;
- efeitos shader apenas em sites de tecnologia;
- um "gate" que confere a página num Chrome headless antes de deixar o agente terminar.

**Como se instala e o que altera.**
- `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"` (README.md:81). Usa a CLI de terceiros `skills`.
- Ou `/plugin marketplace add Leonxlnx/taste-skill` + `/plugin install taste-skill@taste-skill` (README.md:94-95).
- Ou `install.sh`, que cria **symlink/junction em `~/.claude/skills`**, ou seja, escopo global (install.sh:38-50). Em Windows, cai para `mklink /J` (install.sh:85-94).
- Ao usar, cria a pasta `.taste-skill/` no projeto (build.json, gate.json, unarmed.json).

**Arquivos que executam código.**
- `skills/taste-skill/scripts/*.mjs` (cerca de 18,7 mil linhas): `gate.mjs`, `consistency.mjs`, `perf.mjs`, `effects.mjs`, `moments.mjs`, `icons.mjs`, `photos.mjs`, `start.mjs`, `copy-lint.mjs`, `shoot.mjs`. Abrem Chrome/Edge headless com perfil temporário (`--remote-debugging-port=0`), medem a página e fazem lint de texto.
- `assets/**/*.js`: componentes e efeitos que vão para a página gerada. Só fazem fetch relativo/local.

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| Médio | `skills/taste-skill/SKILL.md:14-20` | Hook `Stop` declarado no frontmatter da skill: roda `node gate.mjs --hook claude` com timeout de 600 s. Procura o script em vários caminhos, incluindo `$HOME/.claude/skills/...`. |
| Médio | `scripts/gate.mjs:71-76` e `:590-596` | Em modo hook, o gate pode **bloquear o fim do turno** (`{"decision":"block"}`) até a página passar nas checagens. O limite é de "rounds + 4" bloqueios, ou 30 em 6 h. |
| Baixo | `scripts/photos.mjs:667`, `:790` · `scripts/icons.mjs:65-66` · `scripts/start.mjs:288` | Rede para domínios esperados: Wikimedia Commons, cdn.jsdelivr.net e Google Fonts. Envia User-Agent identificando a skill (`photos.mjs:87`). Não há telemetria. |
| Baixo | `install.sh:89` | `rm -rf` de uma cópia deixada por um `ln` mal-sucedido. Fica restrito ao destino do link. |

Sem prompt injection. Não lê credenciais.

**Relevância: baixa.** Todo o conteúdo é sobre sites de marketing: hero, fotos de stock, "uma seção por tela", 60-80 palavras por tela. Um escritório virtual é UI de aplicativo (HUD, chat, listas, canvas 3D), e essas regras atrapalham.

**Recomendação: ignorar.**

---

## 2. nextlevelbuilder/ui-ux-pro-max-skill

**O que é.** Plugin para Claude Code com **7 skills** em `.claude/skills/`: `ui-ux-pro-max`, `design-system`, `ui-styling`, `brand`, `banner-design`, `design` e `slides`. A principal, `ui-ux-pro-max`, é um banco local pesquisável (CSV) servido por scripts Python sem dependências. Contém:
- 120 diretrizes de UX/acessibilidade;
- 80 estilos;
- 192 paletas e 74 pares de fontes;
- 22 stacks, entre elas `react.csv`, `threejs.csv` (53 regras) e `react-performance.csv`.

**Como se instala e o que altera.**
- `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` + `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` (README.md:262-263). Instala **as 7 skills**.
- Ou `npm install -g ui-ux-pro-max-cli` + `uipro init --ai claude` (README.md:270-276). A CLI baixa o zip do release no GitHub e copia para `.claude/` do projeto ou para o home (`cli/src/utils/github.ts`, `template.ts:337`).
- `--persist` cria `design-system/<projeto>/MASTER.md` no projeto (SKILL.md:92-114).

**Arquivos que executam código.**
- `ui-ux-pro-max/scripts/search.py`, `core.py`, `design_system.py`, `preview.py`, `reasoning_contract.py`: só stdlib (csv, json, re, argparse...). Leem CSVs locais. **Sem rede.**
- `design/scripts/{logo,icon,cip}/generate.py`: geração de logo e ícone por IA (Gemini, Atlas Cloud, MuAPI).
- `design-system/scripts/*.py|*.cjs`: tokens e slides. `fetch-background.py` usa URLs fixas do Pexels.
- `ui-styling/scripts/shadcn_add.py`: roda `npx shadcn@<versão> add` (linhas 116, 165).
- `brand/scripts/*.cjs`: extraem cores e tokens de arquivos locais.
- `cli/src/**`: instalador npm (não é necessário).

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| Médio | `.claude/skills/design/scripts/logo/generate.py:56-57`, `icon/generate.py:31-32`, `cip/generate.py:74-75` | Leem `~/.claude/skills/.env` e `~/.claude/.env` (**fora do projeto**) para carregar chaves de API. Depois enviam prompts para Gemini, `api.atlascloud.ai` (`logo/generate.py:92`) e `api.muapi.ai` (`:95`). Fica restrito à skill `design`, que **não** será instalada. |
| Baixo | `.claude/skills/ui-styling/scripts/shadcn_add.py:116` | `npx shadcn@...` baixa e executa um pacote npm. Só roda se a skill for invocada. |
| Baixo | `cli/src/utils/extract.ts:17,19,76,78` | `exec` com caminhos interpolados em string de shell. Seria injeção apenas com caminhos maliciosos. Só afeta quem usa a CLI. |
| Info | `.claude/skills/ui-ux-pro-max/SKILL.md:65` | Ponto positivo: a própria skill manda tratar resultados como recomendação, não instalar pacotes e não enviar dados privados. |

Sem hooks, sem telemetria, sem prompt injection.

**Relevância: alta** para a sub-skill `ui-ux-pro-max`:
- acessibilidade (alvos de 44 px, contraste, foco);
- regras de React e de performance React;
- regras de Three.js (pin de versão, addons, dispose);
- padrões de app (mobile/desktop);
- responsividade.

As outras seis sub-skills (banner, brand, logo/CIP, slides, tokens de slide) são de marketing ou branding. **Relevância baixa.**

**Recomendação: instalar no projeto só a pasta `ui-ux-pro-max`** (não o plugin, que traz as 7). É preciso corrigir os caminhos do `SKILL.md`: ele chama `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py` (SKILL.md:42 e mais 11 ocorrências), e essa variável não existe fora de um plugin. Requer Python 3 no PATH (`python`, `python3` ou `py -3`).

---

## 3. obra/superpowers

**O que é.** Plugin de **processo de desenvolvimento** (v7.0.2), com 15 skills:
- brainstorming, writing-plans, executing-plans, subagent-driven-development;
- test-driven-development, systematic-debugging, verification-before-completion;
- requesting/receiving-code-review, using-git-worktrees, finishing-a-development-branch;
- writing-skills, dispatching-parallel-agents, diagnosing-superpowers, using-superpowers.

**Como se instala e o que altera.**
- `/plugin install superpowers@claude-plugins-official` ou `@superpowers-marketplace` (README.md:62-81).
- O plugin **ativa um hook `SessionStart`** (`hooks/hooks.json:3-15`). Ele injeta o texto inteiro de `using-superpowers/SKILL.md` em toda sessão nova, `/clear` ou compactação.
- Não mexe em `settings.json`, não instala dependências e não adiciona MCP.

**Arquivos que executam código.**
- `hooks/session-start` e `hooks/run-hook.cmd`: o hook. Só lê o `SKILL.md` local e imprime JSON. Sem rede.
- `skills/brainstorming/scripts/server.cjs`, `start-server.sh`, `stop-server.sh`, `helper.js`: servidor HTTP/WebSocket local do "visual companion". Escuta em 127.0.0.1 por padrão (`server.cjs:100`), usa token aleatório (`:123-145`) e abre o navegador com `execFile`.
- `skills/executing-plans/scripts/*`, `skills/subagent-driven-development/scripts/*`: scripts bash de git e workspace.
- `skills/systematic-debugging/find-polluter.sh`: roda `npm test` arquivo a arquivo.
- `skills/writing-skills/render-graphs.js`: renderiza graphviz.
- `.opencode/`, `.pi/`, `.hermes-plugin/`, `index.js`: adaptadores para outros agentes.
- `tests/**`.

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| Médio | `hooks/session-start:49` + `skills/using-superpowers/SKILL.md:10-24` | Injeta em toda sessão um bloco `<EXTREMELY_IMPORTANT>` com regras como "se houver 1% de chance de uma skill se aplicar, você DEVE invocá-la", "invoque skills ANTES de qualquer resposta, inclusive perguntas de esclarecimento" e "brainstorming antes do plan mode". Não é malicioso, mas **sequestra o comportamento padrão** e disputa prioridade com qualquer outra skill. |
| Baixo | `skills/brainstorming/scripts/server.cjs:106-112`, `:243-249` + `README.md:398-400` | "Telemetria" do visual companion: a página carrega o logo de `primeradiant.com` com a versão na query string, o que funciona como pixel de contagem. Desliga com `SUPERPOWERS_DISABLE_TELEMETRY`, `DISABLE_TELEMETRY` ou `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Só ocorre se o usuário aceitar o companion. |
| Baixo | `skills/diagnosing-superpowers/SKILL.md:48-53`, `references/github-issues.md:30` | Lê transcripts de sessões no disco e pode abrir issue em `obra/superpowers` via `gh`. Há portões de aprovação explícitos (SKILL.md:101-102) e regras de redação de dados sensíveis. |
| Info | `skills/brainstorming/scripts/stop-server.sh:113-114` | `rm -rf` apenas de diretórios em `/tmp/*`. |

Sem exfiltração. Sem prompt injection no sentido hostil.

**Relevância: média.** `systematic-debugging` (causa raiz antes de corrigir) e `verification-before-completion` (rodar a verificação antes de dizer que terminou) servem a qualquer projeto. O resto pressupõe repositório git, worktrees, TDD obrigatório e planos executados por subagentes. O projeto **ainda não é um repositório git**, e TDD rígido para cenas 3D tem custo alto.

**Recomendação: instalar no projeto só `systematic-debugging` e `verification-before-completion`**, copiando as pastas, **sem o plugin e sem o hook**. Não instalar `using-superpowers`, `brainstorming` nem `test-driven-development` (ver conflitos). Reavaliar `writing-plans` depois que o projeto virar repositório git.

---

## 4. multica-ai/andrej-karpathy-skills

**O que é.** Uma skill de diretrizes de comportamento (`skills/karpathy-guidelines/SKILL.md`, 67 linhas). Também vem como `CLAUDE.md` e regra do Cursor. Tem quatro regras: pensar antes de codar, simplicidade primeiro, mudanças cirúrgicas e execução guiada por critério verificável. O repositório foi transferido. O README ainda cita `forrestchang/andrej-karpathy-skills` (README.md:105, 119) e faz propaganda do Multica (README.md:3).

**Como se instala e o que altera.**
- `/plugin marketplace add forrestchang/andrej-karpathy-skills` + `/plugin install andrej-karpathy-skills@karpathy-skills` (README.md:105-110). O plugin fica disponível em todos os projetos.
- Ou baixar o `CLAUDE.md` (README.md:119).
- Não altera configurações.

**Arquivos que executam código.** Nenhum. São 9 arquivos, todos Markdown e JSON.

**Riscos.** Nenhum encontrado.

**Relevância: alta.** Barato (65 linhas) e reduz retrabalho do agente em qualquer parte do projeto.

**Recomendação: instalar no projeto** como skill em `.claude/skills/karpathy-guidelines/`. Uma alternativa é colar as 4 regras no `CLAUDE.md` do projeto, que garante que sempre se aplicam.

---

## 5. pbakaus/impeccable

**O que é.** A mais completa das skills de design (v4.9.1, Apache-2.0). É uma skill com 24 comandos: `shape`, `init`, `document`, `critique`, `audit`, `polish`, `harden`, `onboard`, `adapt`, `optimize`, `typeset`, `layout`, `animate`, `live`, entre outros.

Tem um "modo" explícito para **UI de aplicativo** ("Operate": scanability e consistência acima de expressão). O detector de "anti-padrões" é um **motor binário em Rust** (código-fonte em `crates/`). O repositório inteiro tem cerca de 4.800 arquivos, mas a skill para Claude Code é só `.claude/skills/impeccable/` (63 arquivos, 2,4 MB).

**Como se instala e o que altera.**
- `npx impeccable install` (README.md:97-100) detecta os agentes, pergunta o escopo (projeto ou global) e **oferece instalar hooks**.
- Ou plugin: `/plugin marketplace add pbakaus/impeccable`. O plugin vem com hooks `SessionStart`, `PostToolUse(Edit|Write)` e `Stop` já ativos (`plugin/hooks/hooks.json:3-54`).
- **Cópia manual** (README.md:131, 155-157): `cp -r .claude/skills/impeccable <projeto>/.claude/skills/`. Não instala hooks nem subagentes.
- Na primeira execução, o launcher baixa o binário do motor (cerca de 0.1.24) de `github.com/pbakaus/impeccable/releases` para **`%USERPROFILE%\.impeccable\bin\`**, fora do projeto. Isso pode ser mudado com `IMPECCABLE_HOME`.
- Cria `PRODUCT.md`, `DESIGN.md` e `.impeccable/` no projeto.
- `/impeccable hooks on` escreve hooks em `.claude/settings.local.json`. **Se não houver skill no projeto, escreve em `~/.claude/settings.json`** (`reference/hooks.md`, seção "When there is no project Claude skill").

**Arquivos que executam código.**
- `scripts/impeccable` (sh) e `scripts/impeccable.cmd` (Windows): launcher. Procura o binário em `IMPECCABLE_BIN`, na pasta da skill, em `~/.impeccable/bin/impeccable`, no cache versionado e no PATH. Se não achar, baixa e verifica o SHA-256 contra `scripts/engine-checksums.txt`. O hash do asset Windows x64 é `c4e71217677f53beaabec1cd4823a9bb2587355615f1170cf5508e69be4587bc`.
- O binário baixado (motor): detector, contexto, `live`, conta, update.
- `scripts/live-browser*.js`, `modern-screenshot.umd.js`: injetados na página local do dev server no modo `live`. Só falam com `http://localhost:<porta>`.

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| **Alto** | `crates/live/src/copy_edit_agent.rs:1541-1554` (claude), `:1520-1530` (codex) + `README.md:72` | No modo `live`, o botão "Apply" sem chat ativo **abre `claude --print --permission-mode bypassPermissions`** (ou `codex exec --dangerously-bypass-approvals-and-sandbox`). O prompt contém HTML e texto da página e herda o ambiente. Conteúdo da página vira instrução para um agente sem aprovação: é **prompt injection levando a execução arbitrária**. Mitigação: `IMPECCABLE_LIVE_COPY_AGENT=chat` (ou `off`). O README também avisa que o Apply roda o script `impeccable:manual-edit-validate` do `package.json`. |
| Médio | `scripts/impeccable:182-300`, `impeccable.cmd:126-194` + `README.md:209` | Baixa e executa um **binário pré-compilado** na primeira execução. A integridade é verificada por SHA-256 fixado no repositório, mas não dá para provar que o binário corresponde ao código de `crates/` (não há build reprodutível). O README avisa: hooks "rodam fora da aprovação do modelo", e a primeira edição pode baixar o motor. |
| Médio | `crates/context/src/telemetry.rs:44-47`, `:598-609` + `README.md:213` | **Telemetria ligada por padrão.** Ao "rolar" direções visuais (nova tela), consulta `impeccable.style/api/roll` e envia `/api/chosen` com a escolha feita (ids do catálogo, rodada e chave de seed), com o header `X-Impeccable-Client: impeccable/<versão>`. O README diz que nome do projeto, arquivos, código e `PRODUCT.md` nunca são enviados. Desliga com `IMPECCABLE_NO_TELEMETRY=1`, `DO_NOT_TRACK=1` ou `"telemetry": false` em `.impeccable/config.json`. |
| Médio | `crates/account/src/design.rs:5`, `upload_notice.rs:16-17` | Com login numa conta Impeccable, **`DESIGN.md` e relatórios de critique sobem automaticamente** para `api.impeccable.style` (ligado por padrão). Só vale se alguém fizer login: não fazer. |
| Baixo | `crates/context/src/context_cli.rs:737-754` | Checagem de versão em `impeccable.style/api/version`. Pede ao agente que **ofereça** `npx impeccable update` e só execute se o usuário pedir (linha 759). |
| Baixo | `scripts/impeccable:153-156`, `:178-180` | Executa qualquer `impeccable` em `~/.impeccable/bin` ou no PATH que responda ao handshake `engine-probe`. Seria vetor só para quem já controla o PATH. |
| Baixo | `crates/context/src/generate_image.rs:331` | Gera "comps" (imagens) via `api.openai.com` se houver chave OpenAI no ambiente. |
| Info | `plugin/hooks/hooks.json` | Os hooks do plugin rodam o launcher em **toda** edição e em todo fim de turno (timeout de 5 s e 30 s). Em `.tsx`/`.ts` isso afeta praticamente todo o projeto. |

Sem prompt injection hostil no texto das skills. Achei regras de cautela, como "Never repair drift as a side effect" e "Ask before replacing factual copy".

**Relevância: alta.** Tem um modo específico para UI de app (Operate), `audit` (acessibilidade, performance, responsivo), `harden` (estados de erro, i18n, casos de borda), `onboard` (primeiro uso e estados vazios), `adapt` (mobile/desktop) e `polish`. `reference/craft-floor.md` traz um piso de qualidade concreto.

**Recomendação: instalar no projeto, por cópia manual de `.claude/skills/impeccable`, com mitigações obrigatórias:**
- `IMPECCABLE_LIVE_COPY_AGENT=chat`;
- telemetria desligada;
- `IMPECCABLE_HOME` dentro do projeto;
- sem login;
- sem `hooks on` na fase 1.

Se a política da empresa proibir binários não auditados, há um modo só texto: apague `scripts/impeccable*` da cópia. A skill tem um caminho previsto para "launcher indisponível" e passa a ler `PRODUCT.md`/`DESIGN.md` direto (SKILL.md:23). Perde o detector, mas mantém todas as referências.

---

## 6. Nutlope/hallmark

**O que é.** Skill de design "anti-AI-slop" (v2.0.0, "Powered by Together AI") para **sites e páginas novas**. Tem 16 regras inegociáveis ("The Floor"), mais de 40 temas e 21 "macroestruturas" de página. O próprio texto diz para **não** usá-la em design existente, salvo se o usuário a chamar pelo nome (SKILL.md:3).

**Como se instala e o que altera.**
- `npx skills add nutlope/hallmark -g` (README.md:88), que instala globalmente. Também existe o plugin (`/plugin marketplace add nutlope/hallmark`).
- Ou `node skills/hallmark/scripts/install.mjs`, que copia para `~/.claude/skills/hallmark`, `~/.agents/skills` e `~/.config/opencode/skills` (install.mjs:13-29).
- `install-hook.mjs` é opcional e acrescenta um hook `PostToolUse` em `.claude/settings.json`, ou em `~/.claude/settings.json` com `--global` (install-hook.mjs:14-16, 66-68).
- Ao usar, cria `.hallmark/`, `tokens.css` e um "stamp" na primeira linha do CSS.
- Para as checagens visuais, pede `npm i -g puppeteer-core` (README.md:91).

**Arquivos que executam código.** Todos em `skills/hallmark/scripts/`:
- `sloplint.mjs`, `sloplint-render.mjs`: lint estático e renderizado;
- `capture.mjs`, `picture.mjs`: Puppeteer achado via `npm root -g`;
- `theme.mjs`: temas e fotos do Wikimedia;
- `imagegen.mjs`: Together AI;
- `lint-hook.mjs`, `install*.mjs`, `refcheck.mjs`.

Também há `eval/*.py|*.mjs` (avaliação do autor) e `site/**` (o site do projeto).

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| Baixo | `scripts/install-hook.mjs:14-16` | Com `--global`, escreve hook em `~/.claude/settings.json`. É opt-in e grava de forma atômica (linha 56). |
| Baixo | `scripts/imagegen.mjs:6`, `:60-71` | Envia prompts para `api.together.xyz` se `TOGETHER_API_KEY` estiver definida. É opt-in. |
| Baixo | `scripts/theme.mjs:413-415` | Baixa fotos apenas de `upload.wikimedia.org` (com validação do host). |
| Info | `references/flow.md:87` | Ponto positivo: manda tratar o conteúdo de um MCP externo ("Inspo") como dado, nunca como instrução. |

Sem telemetria, sem hooks automáticos, sem prompt injection.

**Relevância: baixa.** O foco é página de marketing: hero, "cerca de 80 palavras por tela", headline e CTA acima da dobra. Há um modo "app screen" (`references/flow.md:65`), mas o impeccable cobre isso melhor.

**Recomendação: ignorar.** Opcionalmente, consultar a lista "The Floor" (SKILL.md:16-35) como checklist de CSS.

---

## 7. juliobsz/skills

**O que é.** Duas skills:
- `awwwards`: constrói "sites de nível Awwwards" (portfólios, agências, lançamentos) em Next.js ou Astro, com GSAP, WebGL e SEO.
- `jury`: dá nota a um site como um júri Awwwards, com screenshots, LCP, CLS, FPS, axe e foco de teclado.

**Como se instala e o que altera.**
- `npx skills add juliobsz/skills -g` (README.md:57), global. Também há o marketplace `.claude-plugin/marketplace.json` com 2 plugins.
- Não há hooks nem MCP.
- Para funcionar, a `jury` manda o agente instalar Playwright e axe-core **fora do projeto**, em `~/.cache/jury` (jury/SKILL.md:57).

**Arquivos que executam código.**
- `awwwards/scripts/*.mjs`:
  - `audit.mjs`: SEO e metadados do servidor local;
  - `shoot.mjs`: screenshots com Playwright;
  - `font.mjs`: baixa fontes do Fontshare/Google;
  - `photos.mjs`: picsum.photos;
  - `og.mjs`, `serve.mjs`, `browser.mjs`.
- `jury/scripts/*.mjs`: subconjunto dos mesmos scripts.
- `tests/**`: projetos Next/Astro de teste.

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| Baixo | `jury/SKILL.md:57` | Instrui `npm i -D playwright axe-core` em `~/.cache/jury`, ou seja, instala pacotes fora do projeto. |
| Baixo | `awwwards/scripts/shoot.mjs:36-45` | Baixa `axe-core` de `cdn.jsdelivr.net` e **verifica o sha384** antes de usar (boa prática). |
| Baixo | `awwwards/scripts/font.mjs:28,34`, `photos.mjs:18,53-54` | Rede para Fontshare, Google Fonts e picsum.photos (esperado). |
| Info | `awwwards/SKILL.md:248` | Sugere ao usuário instalar outra skill de terceiros (`wheresryan22/anatomy`). Só sugere, não executa. |

Sem telemetria, sem hooks, sem prompt injection.

**Relevância: baixa.** Sites de vitrine com SEO. A `jury` mede LCP, CLS, FPS e axe, o que seria útil, mas a rubrica (Design 40%, Criatividade 20%...) é de site premiado, não de ferramenta interna. `references/webgl.md` usa WebGL cru em Next/Astro, não R3F.

**Recomendação: ignorar.**

---

## 8. INSANE0777/awwwards-skills

**O que é.** Nove skills que **dependem de um servidor MCP externo, `awwwards-mcp`** (pacote npm que não está neste repositório e não foi revisado):
- `recreate`, `awwwards-inspiration`, `awwwards-section-loop`, `awwwards-motion-study`, `awwwards-design-md`;
- `awwwards-setup`, `awwwards-doctor`, `awwwards-atlas`, `motion-authoring`.

O conjunto raspa awwwards.com, captura sites ao vivo com Playwright e ffmpeg e **recria sites a partir de uma URL**.

**Como se instala e o que altera.**
- `claude mcp add awwwards -- npx -y awwwards-mcp` (README.md:47) e `npx skills add INSANE0777/awwwards-skills` (README.md:88-110).
- O MCP grava cache em `~/.awwwards-mcp`.
- Algumas skills mandam rodar `npm install -g awwwards-mcp@latest` e `npx playwright install chromium` (awwwards-doctor/SKILL.md:47, 89).

**Arquivos que executam código.**
- `scripts/skill-memory.mjs`: "memória autoaperfeiçoável".
- `scripts/validate-skills.mjs`.
- `skills/awwwards-design-md/scripts/validate-design-md.mjs`: chama `python -c` com um script fixo para validar YAML (linhas 40-51).
- O código real (raspagem e captura) está no pacote npm `awwwards-mcp`, **não revisado**.

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| Médio | `scripts/skill-memory.mjs:1-30`, `:92-105` | O comando `distill` **reescreve os `SKILL.md` instalados** (em `~/.claude/skills`, `~/.agents/skills`...) com "regras aprendidas" a partir de um diário de achados. Os achados vêm de sessões que leem sites de terceiros, então texto vindo da web pode virar **instrução persistente da skill**. É um vetor de persistência de prompt injection. |
| Médio | README.md:33-47 | Depende de `npx -y awwwards-mcp` (sempre a versão mais nova, sem pin), código não auditado aqui. |
| Baixo | `skills/awwwards-inspiration/SKILL.md:94` | Instrui `curl -o e.mp4 <video-url>` de sites de terceiros. |
| Info | `skills/recreate/SKILL.md:37`, `:95` | Reconhece a questão de direitos autorais e exige aviso de "estudo privado, não publicar". |

**Relevância: baixa.** Clonar sites premiados não tem relação com um escritório virtual interno.

**Recomendação: ignorar.**

---

## 9. img2threejs/img2threejs

**O que é.** Skill (v2.0.1) que transforma uma imagem de objeto ou personagem num **modelo Three.js procedural em código**. O processo passa por um pipeline em etapas: intake → spec → blockout → forma → material → iluminação → otimização, com checagem por visão a cada passo.

O "forge" (`forge/*.py`) é Python puro (stdlib) e controla o estado em `.img2threejs/state.json`. O "grimoire" é um conjunto de referências de Three.js: materiais de pele e tecido, padrões de geometria, SDF, rigging.

**Como se instala e o que altera.**
- `npx --yes img2threejs@latest install` (SKILL.md:29) baixa o release do GitHub para `~/.img2threejs/releases/<sha>` e cria **symlinks globais** em `~/.claude/skills/img2threejs` (bin/img2threejs.mjs:15-45, 141, 284-287).
- **Windows não é suportado** (bin/img2threejs.mjs:94; docs/INSTALL.md:8). O pipeline espera `python3` e usa `sips` do macOS para converter imagens (`forge/stage1_intake/build_detail_inventory.py:160-166`).
- Os plugins de domínio vêm de outra CLI, `npx @img2threejs/img2@latest install`, que cria `~/.img2` (docs/INSTALL.md §3).

**Arquivos que executam código.**
- `forge/**/*.py`: pipeline local.
- `bin/img2threejs.mjs`: instalador.
- `integrations/vision/reference_vision.py`: baixa modelos MediaPipe de `storage.googleapis.com` (linhas 29-33, 96) e usa torch e transformers.
- `integrations/mesh3d/generate_reference_mesh.py`: **envia as imagens de referência para um Hugging Face Space** (`trellis-community/TRELLIS`, linha 43) via `gradio_client`.
- `integrations/glb_character_pipeline/**`, `scripts/**`: CI, triagem de issues e captura com Playwright.

**Riscos.**

| Severidade | Onde | O quê |
|---|---|---|
| Médio | `integrations/mesh3d/generate_reference_mesh.py:43`, `:67-81` | Upload das imagens para um serviço de terceiros (HF Space). É opcional e documentado como externo (`grimoire/scripts.md:460-461`). Não usar com imagens internas. |
| Baixo | `integrations/vision/reference_vision.py:93-97` | Baixa modelos de ML sem verificar hash antes de usar (registra o sha256 depois). |
| Baixo | `bin/img2threejs.mjs` | Instalação global por symlink. O pin por tag ou SHA é boa prática. |

Sem hooks, sem telemetria, sem prompt injection.

**Relevância: média.** Gerar móveis e objetos do escritório como código Three.js é interessante. O gerador emite funções TypeScript que retornam `THREE.Group` (`forge/stage3_build/generate_threejs_factory.py:3456`), utilizáveis em R3F via `<primitive object={...} />`. Mas:
- não roda nativamente no Windows;
- o pipeline é pesado;
- para um escritório, modelos GLB (Blender, Kenney, Poly Pizza) ou geometria simples em R3F costumam ser mais práticos.

**Recomendação: só consultar como referência.** Vale ler `grimoire/build/geometry_patterns.md`, `threejs_texture_reference.md` e `threejs_skin_and_cloth_materials.md`, além de `grimoire/readiness/animation_contract.md` para avatares. Reavaliar se for preciso gerar muitos props a partir de fotos (rodar em WSL ou macOS).

---

## 10. AgricIDaniel/claude-seo

**O que é.** Plugin de **auditoria de SEO** (v2.6.2):
- 29 skills `seo-*` e 20 agentes;
- scripts Python para PageSpeed/CrUX, Search Console, GA4, schema JSON-LD, backlinks e SEO local.

**Como se instala e o que altera.**
- **Plugin** (README.md:203-207): ativa um hook `PostToolUse` em todo Edit/Write (`hooks/hooks.json:3-19`).
- `/seo setup` cria um venv em `%LOCALAPPDATA%\claude-seo`, faz `pip install` e baixa o Chromium do Playwright (`scripts/runtime.py:124-139`, `:366-384`).
- **Instalação manual** (`install.sh`/`install.ps1`): faz um novo `git clone` do GitHub e copia skills e agentes para **`~/.claude/skills` e `~/.claude/agents`** (escopo global), sobrescrevendo homônimos (install.sh:41-50, 74, 108-119).
- **Extensões opcionais** gravam chaves de API em texto plano em `~/.claude.json` (servidores MCP via `npx`, por exemplo `extensions/ahrefs/install.sh:70-73`) e em `~/.claude/settings.json` (env).

**Arquivos que executam código.**
- `hooks/run-python-hook.js` + `hooks/validate-schema.py`: hook local, sem rede.
- `scripts/claude-seo` + `scripts/runtime.py`: launcher com allowlist de scripts.
- 233 arquivos `.py`: fetch de URLs informadas pelo usuário (com proteção anti-SSRF em `url_safety.py`) e APIs de fornecedores com a chave do usuário (Google, Bing, Moz, DataForSEO...).
- 24 `.sh` e 14 `.ps1` de instalação.

**Riscos** (a varredura detalhada foi feita por um subagente; conferi por amostragem).

| Severidade | Onde | O quê |
|---|---|---|
| Médio | `hooks/hooks.json:3-19` + `hooks/run-python-hook.js:9` | Hook em **toda** edição de `.tsx`/`.jsx`/`.html`, em qualquer projeto, enquanto o plugin estiver ativo. Sobe node e procura Python. Se não achar Python, mostra erro em toda edição (run-python-hook.js:80-83). Não usa rede. O efeito é latência e ruído. |
| Médio | `extensions/*/install.sh` | Grava chaves de API em `~/.claude.json` e `~/.claude/settings.json` (env global, visível a todos os subprocessos). O round-trip `ConvertTo-Json` no PowerShell 5.1 pode corromper `~/.claude.json` (não testado). |
| Baixo | `scripts/sync_flow.py:19-20`, `:107-122` | Ferramenta do mantenedor: usa `gh auth token` e baixa prompts de `AgriciDaniel/flow` para dentro da skill. Só roda se invocada. |
| Baixo | `uninstall.sh:29-51` | Apaga **todos** os `~/.claude/skills/seo-*`, inclusive skills suas com esse prefixo. |
| Info | `skills/seo/SKILL.md:159-167` | Manda anexar um rodapé promocional (skool.com) após auditorias. É autopromoção. |

Sem telemetria (`PRIVACY.md:5,12`), sem `shell=True`/`eval`, sem prompt injection.

**Relevância: nenhuma.** O app é interno, não tem páginas públicas, e PageSpeed/CrUX exigem URL pública.

**Recomendação: ignorar.** Não instalar de forma alguma como plugin, por causa do hook global em `.tsx`.

---

## 11. coreyhaines31/marketingskills

**O que é.** Coleção de **53 skills de marketing** (v2.14.12): copywriting, CRO, SEO, anúncios, e-mail, pricing, onboarding, analytics, entre outras. É quase só Markdown e funciona como plugin de skills (`.claude-plugin/plugin.json` contém apenas `"skills": "./skills"`).

**Como se instala e o que altera.**
- `/plugin marketplace add` + `/plugin install marketing-skills`: só adiciona skills. Não toca em configurações nem traz hooks ou MCP.
- `npx skills add coreyhaines31/marketingskills`: a CLI de terceiros envia telemetria anônima de instalação para skills.sh, segundo o próprio repositório.
- A skill `marketing-plan` grava em `~/marketing-plans/` (`skills/marketing-plan/SKILL.md:37`), fora do projeto.

**Arquivos que executam código.** Nada roda automaticamente.
- `tools/clis/*.js` (68): CLIs de fornecedores (Mixpanel, GA4, Resend...) com a chave do usuário.
- `skills/reverse-engineer-marketing/scripts/teardown.mjs`: raspagem de concorrente.
- `skills/conversion-tracking/assets/snippets/*.js`: snippets de `dataLayer.push`.
- Scripts do mantenedor.

**Riscos** (varredura feita por um subagente; conferi por amostragem).

| Severidade | Onde | O quê |
|---|---|---|
| Baixo | `scripts/__pycache__/package_skills.cpython-312.pyc` | `.pyc` versionado por engano, de uma versão antiga do `.py` correspondente. As strings não têm nada de rede ou `exec`. Nada o importa. |
| Baixo | `tools/integrations/ploy.md:57` | Documentação de parceiro com `curl -fsSL https://ploy.ai/install.sh \| sh`. Um agente só seguiria isso se você pedisse a integração. |
| Baixo | `skills/reverse-engineer-marketing/scripts/teardown.mjs:883` | O host de uma requisição é extraído do HTML raspado (SSRF de baixo impacto, CLI local). |
| Info | vários `references/*.md` (ex.: `skills/prospecting/SKILL.md:262`) | Conteúdo patrocinado ("Verified Partner") inserido nas referências, com aviso de patrocínio. |

Sem hooks, sem telemetria no código, sem prompt injection.

**Relevância: baixa.** Exceção: `onboarding` (primeiro uso, estados vazios), `copy-editing` e `copywriting` (microcopy de UI), e `analytics` (convenção de nomes de eventos, se houver analytics interno).

**Recomendação: só consultar como referência** essas 3 ou 4 skills, quando precisar escrever onboarding ou microcopy. Não instalar o conjunto: as 53 descrições ocupariam contexto o tempo todo.

---

## 12. goabstract/Awesome-Design-Tools (lista)

**O que é.** Uma lista curada de ferramentas de design (cerca de 42 mil estrelas). **Está sem manutenção:** o último commit é de 28/09/2020, segundo a API do GitHub. Itens já mortos ou obsoletos:
- InVision (encerrado em 31/12/2024);
- Adobe XD (em modo de manutenção);
- RealtimeBoard (virou Miro);
- Flare (virou Rive);
- Feather Icons (o fork mantido é o Lucide).

Faltam ferramentas atuais como Penpot, Spline, Rive, Lucide, Tokens Studio e LottieFiles.

**Instalação e riscos.** Não se aplica (é só uma lista; não foi clonada).

**Ferramentas da lista úteis para o projeto:**

| Ferramenta | Para quê |
|---|---|
| Blender | Modelar escritório, móveis e avatares; exportar glTF/GLB para R3F |
| Vectary | Props 3D rápidos no navegador |
| Lottie (lottie-web/lottie-react) | Microanimações de UI leves: entrar/sair, reações, loading |
| GSAP | Animação de UI e câmera junto com Three.js |
| Rive (antigo Flare) | Animações interativas com state machine (avatar 2D, botões) |
| Leonardo (Adobe) | Paleta a partir de razão de contraste WCAG; temas claro e escuro |
| axe / Accessibility Insights | Testes de acessibilidade automáticos (CI) e manuais |
| Color Oracle / Toptal Color Filter | Simular daltonismo. Os status online/ocupado/ausente não podem depender só de cor |
| Coolors | Gerar paletas rapidamente |
| Storybook | Componentes React isolados e documentados |
| Figma | Telas de HUD, menus e customização de avatar (a alternativa aberta é o Penpot) |
| Excalidraw / draw.io | Planta do escritório, fluxos, arquitetura (sinalização, SFU) |
| Font Awesome / Simple Icons / SVGRepo (e Lucide, fora da lista) | Ícones de mic, câmera, tela, status |
| unDraw / Humaaans / Open Doodles | Ilustrações para estados vazios e onboarding |
| Google Fonts | Fontes livres, hospedadas no próprio servidor |
| Aseprite / Piskel | Sprites e tilesets, se o 2D for em pixel art (estilo Gather/WorkAdventure) |
| Freesound / SoundKit | Sons de entrar, sair, mensagem e "bater na porta" (atenção à licença CC) |
| VisBug | Ajuste de layout direto no navegador |

**Relevância: média**, como inventário de ferramentas.

**Recomendação: só consultar como referência**, sabendo que a lista está desatualizada.

---

## 13. penpot/penpot (integração com agentes)

**O que é.** Ferramenta de design open-source (2D e vetorial). **Existe um servidor MCP oficial**, mantido pela Penpot/Kaleidos:
- código em `penpot/penpot/tree/develop/mcp` (pacote npm `@penpot/mcp`);
- documentação em <https://help.penpot.app/mcp/> e <https://penpot.app/penpot-mcp-server>;
- o repositório separado `penpot/penpot-mcp` foi arquivado e incorporado ao monorepo.

**Como funciona e como se instala.**
- **Arquitetura:** o servidor MCP conversa via WebSocket com um plugin que roda na aba aberta do Penpot.
- **Ferramentas:** `execute_code`, `high_level_overview`, `penpot_api_info`, `export_shape` e `import_image`. Permitem ler páginas, componentes e estilos, exportar formas, criar tokens e editar camadas. Não existe ferramenta de "gerar código": quem escreve o React é o agente, a partir dos dados lidos.
- **Instalação remota** (a mais simples):
  1. No Penpot, ativar em *Your account → Integrations → MCP Server* e gerar a chave.
  2. Copiar a URL `https://<domínio>/mcp/stream?userToken=<chave>`.
  3. Adicionar no Claude Code com `claude mcp add --transport http penpot "<URL>"`, **em escopo de usuário ou local, nunca `--scope project`** (o arquivo `.mcp.json` levaria a chave para o repositório).
  4. No arquivo de design: *File → MCP Server → Connect*.
- **Instalação local:** `npx -y @penpot/mcp@stable`, que exige Node 20 ou mais.

**Riscos.**
- A chave vai na query string da URL, então pode vazar em logs, prints ou num `.mcp.json` commitado.
- `execute_code` roda JavaScript arbitrário com permissão de escrita no arquivo de design.
- Os tokens pessoais da API REST **não têm escopo**: dão acesso amplo à conta.
- Servidores da comunidade:
  - `montevive/penpot-mcp` pede usuário e senha em variável de ambiente (evitar);
  - `ancrz/penpot-mcp-server` lê direto do PostgreSQL de self-host e escuta em `0.0.0.0` (evitar).

**Relevância: baixa agora.** O Penpot não ajuda no núcleo 3D. Para um time pequeno sem designer dedicado, design system em código (tokens + Storybook) com o Claude Code implementando direto rende mais.

**Recomendação: ignorar por enquanto.** Se alguém passar a desenhar as telas (HUD, menus, customização de avatar), usar o **MCP oficial remoto**:
- conta gratuita ou self-host;
- começar com prompts só de leitura;
- chave fora do repositório.

---

## 14. donnemartin/system-design-primer (seções para tempo real com cerca de 20 usuários)

**O que é.** Guia de system design para entrevistas, mantido de forma mínima (último commit em março de 2026, correções de links). **Não cobre WebRTC, WebSocket, STUN/TURN nem SSE.** Os pontos mais próximos são a seção de UDP (VoIP e vídeo) e a de consistência fraca.

**Seções que valem a leitura.** Todas em <https://github.com/donnemartin/system-design-primer>, com a âncora indicada.

| Seção | Âncora | Por quê |
|---|---|---|
| How to approach a system design interview question | `#how-to-approach-a-system-design-interview-question` | Roteiro: casos de uso, restrições e premissas antes de desenhar |
| Back-of-the-envelope calculations | `#back-of-the-envelope-calculations` | Mostra que posições custam quase nada (20 usuários × 10 Hz × cerca de 100 B). O custo real é o vídeo |
| Latency vs throughput | `#latency-vs-throughput` | Sincronizar avatar e voz depende de latência, não de vazão |
| Latency numbers every programmer should know | `#latency-numbers-every-programmer-should-know` | Ordem de grandeza de RTT para escolher a região do servidor e do SFU |
| Transmission control protocol (TCP) | `#transmission-control-protocol-tcp` | Base do WebSocket: chat e presença |
| User datagram protocol (UDP) | `#user-datagram-protocol-udp` | "Dado atrasado é pior que perdido": mídia WebRTC e DataChannel não confiável para posições |
| Weak consistency / Eventual consistency | `#weak-consistency` · `#eventual-consistency` | Posição pode perder pacote; presença pode ser eventual; histórico de chat precisa ser durável |
| Availability in numbers / Fail-over | `#availability-in-numbers` · `#fail-over` | Para uso interno, uma instância com restart automático costuma bastar |
| Reverse proxy (web server) | `#reverse-proxy-web-server` | TLS com nginx ou Caddy. O primer não fala do upgrade de WebSocket |
| Back pressure | `#back-pressure` | Cliente lento enche o buffer do WebSocket: descartar ou juntar updates de posição |
| SQL or NoSQL | `#sql-or-nosql` | Postgres ou SQLite para usuários e histórico |
| Security | `#security` | O básico: TLS, sanitizar entrada (XSS no chat), menor privilégio |
| Additional system design interview questions | `#additional-system-design-interview-questions` | Linhas "Design a chat app like WhatsApp" e "Design an online multiplayer card game" (links antigos) |

**Pular** (exagero para 20 usuários):
- CDN e DNS em profundidade;
- load balancer, escalonamento horizontal, microsserviços e service discovery;
- replicação, federação, sharding e desnormalização;
- taxonomia de NoSQL e CAP em detalhe;
- filas (Redis pub/sub só com mais de um nó);
- quase todo o capítulo de cache;
- todos os estudos de caso (Pastebin, Twitter, crawler etc.).

**Fontes complementares** (o primer não cobre esses temas):
- MDN: [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) e [WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).
- [High Performance Browser Networking](https://hpbn.co/), capítulos 3 (UDP), 17 (WebSocket) e 18 (WebRTC).
- [WebRTC For The Curious](https://webrtcforthecurious.com/): sinalização, NAT, STUN, TURN e data channels.
- SFU:
  - [LiveKit](https://docs.livekit.io/) traz TURN embutido. Portas do self-host: 443, 80, 7881/TCP, 3478/UDP e 50000–60000/UDP.
  - Alternativas: [mediasoup](https://mediasoup.org/documentation/v3/), ou [coturn](https://github.com/coturn/coturn) se for P2P.
  - Mesh com vídeo para de escalar por volta de 3 participantes, então com 20 pessoas um SFU é necessário.
- Posição dos avatares: [Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html), de Gabriel Gambetta (interpolação e predição no cliente).

**Relevância: média**, só para as seções listadas.

**Recomendação: só consultar como referência.**

---

## Sobreposições e conflitos entre skills

### 1. Seis skills de design disputam o mesmo gatilho

taste-skill, ui-ux-pro-max, impeccable, hallmark, juliobsz/awwwards e awwwards-skills têm descrições amplas. Exemplos:
- taste: "Use this whenever you build, design, redesign...";
- hallmark: "Use when the user asks to build or design something new";
- impeccable: "Use to design, redesign, critique, audit...".

Com várias instaladas, a escolha de qual dispara fica imprevisível e as regras se contradizem.

### 2. Contradições concretas

| Tema | Conflito |
|---|---|
| Estilos | `ui-ux-pro-max/data/styles.csv` cataloga e recomenda Glassmorphism (id 3), Aurora UI (id 10) e Liquid Glass (id 14). `impeccable/.claude/skills/impeccable/reference/craft-floor.md:33-34` **proíbe** texto em gradiente e "glass e blur como decoração". O hallmark proíbe gradiente roxo-azul (SKILL.md, Floor 11). |
| Rótulos | impeccable (`craft-floor.md:27`) e hallmark (Floor 9) proíbem "eyebrow" (rótulo pequeno acima do título). Templates de landing do ui-ux-pro-max e do taste usam esse padrão. |
| Densidade | taste ("uma seção por tela", 60-80 palavras por tela) e hallmark ("cerca de 80 palavras por tela") seguem regras de página de marketing. Um escritório virtual precisa de UI densa: lista de pessoas, chat, controles de mídia. O impeccable trata isso explicitamente no modo "Operate". |
| Fonte de verdade do design | impeccable usa `PRODUCT.md` + `DESIGN.md`. hallmark usa `design.md` + `.hallmark/` + `tokens.css` + "stamp" no CSS. ui-ux-pro-max usa `design-system/<slug>/MASTER.md`. awwwards-design-md gera `DESIGN.md` no formato do Google. São quatro formatos para a mesma função. |
| Processo | superpowers `brainstorming` ("You MUST use this before any creative work") e `using-superpowers` ("invoque skills antes de qualquer pergunta") disputam com o `shape`/new-work do impeccable. Também colidem com a regra do Karpathy "se estiver confuso, pare e pergunte". `test-driven-development` ("antes de qualquer código") é pesado para cenas 3D. |
| Hooks | impeccable (PostToolUse e Stop), taste (Stop com bloqueio), claude-seo (PostToolUse), hallmark (PostToolUse opcional) e superpowers (SessionStart) podem rodar juntos. O resultado seria latência a cada edição e mais de um hook capaz de bloquear o fim do turno. |

### 3. Prioridade recomendada

1. **karpathy-guidelines**: comportamento base em qualquer tarefa.
2. **impeccable**: direção, crítica, auditoria e polimento de UI. É a **única fonte de verdade de design** (`PRODUCT.md`/`DESIGN.md`). Em conflito estético, vale `craft-floor.md`.
3. **ui-ux-pro-max**: consulta de fatos (regras de React, Three.js e acessibilidade, alvos de toque, performance). Não usar `--persist` (para não criar um segundo `MASTER.md`). Quando um estilo dele conflitar com o impeccable, prevalece o impeccable.
4. **systematic-debugging / verification-before-completion**: sob demanda, para bugs e antes de declarar algo pronto.

**Não instalar as demais skills de design**, para evitar a disputa de gatilho. Sugestão de texto para o `CLAUDE.md` do projeto:

```markdown
## Skills de design: precedência
- Fonte de verdade visual: PRODUCT.md e DESIGN.md (gerados pelo impeccable). Não criar design-system/*/MASTER.md.
- Em conflito entre skills: craft-floor do impeccable > ui-ux-pro-max. O ui-ux-pro-max é consulta de regras (stack React/Three.js, acessibilidade), não direção estética.
- Este app é UI de ferramenta (modo Operate do impeccable): densidade e clareza acima de efeitos; nada de padrões de landing page.
```

---

## Tabela-resumo

| # | Repositório | Tipo | Hooks/rede/binário | Risco | Relevância | Recomendação |
|---|---|---|---|---|---|---|
| 1 | taste-skill | Skill/plugin | Hook Stop que bloqueia; Chrome headless; Wikimedia/jsDelivr/Google Fonts | Médio | Baixa | **Ignorar** |
| 2 | ui-ux-pro-max-skill | Plugin (7 skills) | Principal: nenhum. Sub-skill `design`: lê `~/.claude/.env` e chama APIs de imagem | Baixo (principal) / Médio (`design`) | Alta (principal) | **Instalar no projeto** (só `ui-ux-pro-max`) |
| 3 | superpowers | Plugin (15 skills) | Hook SessionStart que injeta regras; pixel de telemetria opcional | Médio (hook) | Média | **Instalar no projeto** (só `systematic-debugging` e `verification-before-completion`, sem hook) |
| 4 | andrej-karpathy-skills | Skill (Markdown) | Nenhum | Nenhum | Alta | **Instalar no projeto** |
| 5 | impeccable | Skill + binário + plugin | Baixa binário; telemetria ligada por padrão; hooks opcionais; `live` com bypassPermissions | **Alto** (`live`) / Médio | Alta | **Instalar no projeto, com mitigações** |
| 6 | hallmark | Skill/plugin | Hook opcional; Together AI opcional | Baixo | Baixa | **Ignorar** |
| 7 | juliobsz/skills | 2 skills | npm fora do projeto (`jury`); fontes/fotos | Baixo | Baixa | **Ignorar** |
| 8 | awwwards-skills | 9 skills + MCP externo | MCP npm não auditado; skills que se reescrevem | Médio | Baixa | **Ignorar** |
| 9 | img2threejs | Skill + pipeline Python | Upload opcional para HF Space; download de modelos de ML | Médio (opcional) | Média | **Só consultar** (grimoire) |
| 10 | claude-seo | Plugin | Hook global em `.tsx`; instaladores em `~/.claude`; chaves em `~/.claude.json` | Médio | Nenhuma | **Ignorar** |
| 11 | marketingskills | Plugin (53 skills) | Nenhum automático | Baixo | Baixa | **Só consultar** (onboarding, copy) |
| 12 | Awesome-Design-Tools | Lista | Não se aplica | Não se aplica | Média | **Só consultar** |
| 13 | penpot | Ferramenta + MCP oficial | Chave na URL; `execute_code` | Médio (se usado) | Baixa agora | **Ignorar por enquanto** |
| 14 | system-design-primer | Documentação | Não se aplica | Não se aplica | Média (seções) | **Só consultar** |

---

## Instalação das recomendadas (escopo de projeto)

Destino: `C:\Users\PCGAMER\Desktop\WORK\.claude\skills\`. Nada é instalado globalmente e **nenhum script dos repositórios é executado** pelos comandos abaixo. O git não roda hooks de repositórios baixados.

### 1. Baixar os 4 repositórios exatamente nos commits revisados

PowerShell. Os fontes ficam em `%TEMP%\skills-src`, fora do projeto. O impeccable tem cerca de 100 MB.

```powershell
$src = "$env:TEMP\skills-src"
$dst = "C:\Users\PCGAMER\Desktop\WORK\.claude\skills"
New-Item -ItemType Directory -Force $src, $dst | Out-Null

function Get-Pinned([string]$url, [string]$sha, [string]$dir) {
  git init -q $dir
  git -C $dir fetch -q --depth 1 $url $sha
  git -C $dir -c advice.detachedHead=false checkout -q FETCH_HEAD
}

Get-Pinned https://github.com/multica-ai/andrej-karpathy-skills  2c606141936f1eeef17fa3043a72095b4765b9c2 "$src\karpathy"
Get-Pinned https://github.com/obra/superpowers                   22f0b463e7a5e579904dd6211a520321035526f7 "$src\superpowers"
Get-Pinned https://github.com/nextlevelbuilder/ui-ux-pro-max-skill efd98221354918762b54a5079b39554c3f546f7 "$src\uupm"
Get-Pinned https://github.com/pbakaus/impeccable                  2b86d9c07b97d4bed7de23583e1bd1e58dd2baae "$src\impeccable"
```

### 2. Copiar só as pastas recomendadas

```powershell
Copy-Item -Recurse "$src\karpathy\skills\karpathy-guidelines"               "$dst\karpathy-guidelines"
Copy-Item -Recurse "$src\superpowers\skills\systematic-debugging"           "$dst\systematic-debugging"
Copy-Item -Recurse "$src\superpowers\skills\verification-before-completion" "$dst\verification-before-completion"
Copy-Item -Recurse "$src\uupm\.claude\skills\ui-ux-pro-max"                 "$dst\ui-ux-pro-max"
Copy-Item -Recurse "$src\impeccable\.claude\skills\impeccable"              "$dst\impeccable"

# Testes do ui-ux-pro-max não são necessários em uso
Remove-Item -Recurse -Force "$dst\ui-ux-pro-max\scripts\tests"
```

### 3. Corrigir os caminhos do ui-ux-pro-max

O `SKILL.md` aponta para `${CLAUDE_PLUGIN_ROOT}`, que só existe quando a skill vem de um plugin. O comando abaixo troca para `${CLAUDE_SKILL_DIR}` (pasta da própria skill) e grava em UTF-8 **sem BOM**, para não quebrar o frontmatter.

```powershell
$f = "$dst\ui-ux-pro-max\SKILL.md"
$t = [IO.File]::ReadAllText($f)
$t = $t.Replace('${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/', '${CLAUDE_SKILL_DIR}/')
[IO.File]::WriteAllText($f, $t, (New-Object System.Text.UTF8Encoding($false)))
```

Se a sua versão do Claude Code não expandir `${CLAUDE_SKILL_DIR}`, use `.claude/skills/ui-ux-pro-max/` no lugar (caminho relativo à raiz do projeto).

### 4. Mitigações do impeccable (obrigatórias)

**a) Criar `C:\Users\PCGAMER\Desktop\WORK\.claude\settings.json`** com o conteúdo abaixo (se o arquivo já existir, acrescente só as chaves de `env`).

```json
{
  "env": {
    "IMPECCABLE_NO_TELEMETRY": "1",
    "IMPECCABLE_LIVE_COPY_AGENT": "chat",
    "IMPECCABLE_HOME": "C:/Users/PCGAMER/Desktop/WORK/.impeccable-home"
  }
}
```

O que cada variável faz:
- `IMPECCABLE_NO_TELEMETRY`: desliga o registro de escolhas enviado a impeccable.style.
- `IMPECCABLE_LIVE_COPY_AGENT=chat`: impede que o modo `live` abra `claude`/`codex` com bypass de permissões.
- `IMPECCABLE_HOME`: mantém o binário do motor dentro do projeto em vez de `%USERPROFILE%\.impeccable`.

**b) Criar `C:\Users\PCGAMER\Desktop\WORK\.impeccable\config.json`**, para que a telemetria fique desligada também em execuções fora do Claude Code:

```json
{ "telemetry": false }
```

**c) Acrescentar ao `.gitignore` do projeto:**

```
.impeccable-home/
.impeccable/config.local.json
```

**d) Regras de uso:**
- não rodar `npx impeccable install`, `/impeccable hooks on` nem `impeccable login`;
- só usar `/impeccable live` com a variável do item (a) ativa.

Na primeira execução, o launcher baixa `impeccable-windows-x64.exe` (motor 0.1.24) de `github.com/pbakaus/impeccable/releases/download/engine-v0.1.24/`. Ele recusa o arquivo se o SHA-256 não for `c4e71217677f53beaabec1cd4823a9bb2587355615f1170cf5508e69be4587bc`.

**Alternativa sem binário:** apague `$dst\impeccable\scripts\impeccable` e `impeccable.cmd`. A skill passa ao caminho "launcher indisponível" e usa só as referências.

### 5. Conferir

- Abrir o Claude Code no projeto e confirmar que aparecem 5 skills: `karpathy-guidelines`, `systematic-debugging`, `verification-before-completion`, `ui-ux-pro-max` e `impeccable`.
- Confirmar que `.claude/settings.json` **não tem** a chave `hooks`.
- `systematic-debugging` cita `superpowers:test-driven-development`, que não foi instalada de propósito. A referência é inofensiva.
- Apagar `%TEMP%\skills-src` depois da cópia, se quiser.

### Não instalar

taste-skill, hallmark, juliobsz/skills, awwwards-skills (e o MCP `awwwards-mcp`), claude-seo, marketingskills (como pacote), img2threejs e o plugin completo do superpowers ou do ui-ux-pro-max.

---

## Limites desta revisão

- Não executei nada, então o comportamento em tempo de execução foi inferido do código e da documentação.
- O binário do impeccable foi avaliado pelo código-fonte em `crates/`, que pode não corresponder exatamente ao binário publicado.
- Não revisei: o pacote npm `awwwards-mcp`, as CLIs `skills`/`skillkit` (vercel-labs) e os pacotes npm/PyPI que os instaladores puxam.
- Também não revisei os plugins de domínio do img2threejs nem o plugin `seo-cockpit` do claude-seo (está em outro branch).
- Nos repositórios com centenas de scripts (claude-seo, marketingskills, impeccable), a leitura foi dirigida por busca, não linha a linha. claude-seo e marketingskills foram varridos por um subagente, e conferi suas citações por amostragem.
- Os itens 12 a 14 vêm de pesquisa web. As observações sobre itens obsoletos da Awesome-Design-Tools (Flare→Rive, Feather→Lucide) são conhecimento prévio, não verificado nesta rodada.
