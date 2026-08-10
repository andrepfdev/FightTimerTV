# CT Timer — dispositivos suportados e como instalar

Documento de referência rápida: quais TVs/dispositivos o app já
atende hoje, com qual artefato, e o passo a passo de instalação de
cada um. Para o histórico de decisões por trás de cada escolha, ver
[CLAUDE.md](CLAUDE.md); para o funcionamento interno, ver
[README.md](README.md).

## Resumo

| Dispositivo | Como funciona | Artefato | Precisa do celular? |
|---|---|---|---|
| Roku (TV ou Streaming Stick) | Canal nativo BrightScript | `ct-timer-roku-standalone.zip` (recomendado) ou `ct-timer-roku.zip` | Não / Sim (respectivamente) |
| Android TV / Google TV | App nativo (mesmo APK do celular) | `ct-timer.apk` | Não |
| Fire TV (Amazon Fire OS) | Mesmo APK do Android TV, via sideload | `ct-timer.apk` | Não |
| Celular (Android/iOS) | App RN completo, com servidor HTTP embutido | Instalado via `run-android`/EAS Build (iOS) | — (é o próprio celular) |
| Samsung (Tizen) / LG (webOS) / qualquer TV com navegador | Página HTML servida pelo celular | Nenhum instalador — só abrir a URL no navegador da TV | **Sim** |

## 1. Roku — dois canais à escolha

O Roku não aceita `.apk` nem instalação "normal" — só canais nativos
BrightScript, sideloaded via Developer Mode.

### 1a. `ct-timer-roku-standalone.zip` (recomendado, sem celular)
Timer configurado e controlado 100% pelo controle remoto da própria
Roku. Sem servidor, sem rede entre dispositivos.

### 1b. `ct-timer-roku.zip` (modo celular)
A TV só exibe — o celular com o app roda o servidor e controla
tudo (rounds, pausa, etc.), a TV faz polling em `/state`.

**Instalação (mesma pra qualquer um dos dois zips):**
1. Ativar o Developer Mode na Roku (controle físico): **Home×3, Cima×2,
   Direita, Esquerda, Direita, Esquerda, Direita**. A tela mostra o IP
   da Roku e pede senha (usuário fixo `rokudev`).
2. Instalar via `curl`:
   ```bash
   curl --user rokudev:<senha> --anyauth -sS \
     -F "mysubmit=Install" -F "archive=@ct-timer-roku-standalone.zip" -F "passwd=" \
     http://<ip-da-roku>/plugin_install
   ```
   (ou pelo navegador: abrir `http://<ip-da-roku>` e subir o `.zip` pela
   interface do Development Application Installer.)

**⚠️ Só dá pra ter UM dos dois instalado por vez.** Diferente do que uma
versão anterior deste documento dizia, o Developer Mode da Roku mantém
só **um slot de canal "Dev"** — instalar o outro `.zip` **substitui** o
que já estava lá (mesmo canal, conteúdo trocado), não cria um segundo
ícone. Pra ter os dois de verdade instalados ao mesmo tempo, como dois
canais separados na lista, só publicando os dois como Beta App (abaixo)
com códigos de acesso diferentes — sideload não permite isso.

**Publicação sem Developer Mode (Beta App)**: dá pra empacotar como
`.pkg` assinado e distribuir por código de acesso, sem precisar ativar
Developer Mode em cada TV — processo completo documentado no
[README.md](README.md), seção "Canal Roku nativo". Esse é o único
caminho pra ter os dois canais (celular e standalone) instalados ao
mesmo tempo na mesma Roku.

**⚠️ Protetor de tela**: não existe API pra um canal Roku comum impedir
o protetor de tela do sistema (confirmado testando/pesquisando — ver
CLAUDE.md, 14ª decisão). Se a TV entrar em descanso de tela durante uma
luta longa, ajuste **nas Configurações da própria Roku**: Configurações
→ Sistema → Protetor de tela → aumentar o tempo (ou desativar).

## 2. Android TV / Google TV — `ct-timer.apk`

Mesmo APK do celular — detecta automaticamente que está rodando numa TV
(`Platform.isTV`) e mostra a tela standalone (configuração + corrida
pelo controle remoto), sem servidor nem QR code.

**Instalação:**
1. Habilitar "Fontes desconhecidas": Configurações → Sistema → Sobre →
   clicar 7x no número da versão (ativa Opções do Desenvolvedor) →
   Privacidade/Segurança → Aplicativos desconhecidos → permitir pelo
   app que vai instalar o APK.
2. Transferir o `ct-timer.apk` pra TV — três jeitos, escolher um:
   - **Pendrive (USB)** — ver seção "Instalar via pendrive" abaixo.
   - App de transferência via Wi-Fi (ex: "Send Files to TV").
   - `adb install ct-timer.apk` se a TV tiver depuração USB/rede ativada.
3. Abrir o gerenciador de arquivos na TV, selecionar o `.apk`, instalar.
4. O app aparece na lista de apps com banner próprio (ícone/banner de TV
   já embutidos no APK).

### Instalar via pendrive (USB)
Funciona em qualquer Android TV/Google TV **com entrada USB-A física**
— a maioria das TVs com Android TV embutido (TCL, Philips, Sony, Aiwa,
Philco, Semp) e boxes como Nvidia Shield e Mi Box têm. Streaming sticks
menores (Chromecast com Google TV) geralmente **não têm** USB-A
utilizável pra isso — nesse caso usar transferência por Wi-Fi ou `adb`.

1. Copiar `ct-timer.apk` pro pendrive, formatado em **FAT32 ou exFAT**
   (praticamente todo Android TV lê os dois; NTFS é mais hit-or-miss
   dependendo do fabricante).
2. Plugar o pendrive na porta USB da TV/box.
3. Se a TV não tiver um gerenciador de arquivos nativo visível, instalar
   um pela Play Store — ex: **"File Commander"** ou **"X-plore File
   Manager"** (ambos leem USB automaticamente).
4. Abrir o gerenciador de arquivos, navegar até o pendrive (aparece
   como um dispositivo de armazenamento externo/USB), selecionar
   `ct-timer.apk`, tocar em instalar.

## 3. Fire TV (Fire OS) — mesmo `ct-timer.apk`

Fire OS é fork do Android, aceita o mesmo APK.

**Instalação:**
1. Habilitar apps de fontes desconhecidas: Configurações → Minha Fire TV
   → Sobre → clicar 7x no nome do dispositivo → voltar em Opções do
   Desenvolvedor → ativar "Instalar apps desconhecidos".
2. Transferir o `ct-timer.apk` — dois jeitos, escolher um:
   - **Pendrive (USB)**: só o **Fire TV Cube** tem porta USB-A completa
     nativamente; **Fire TV Stick** (qualquer geração) não tem USB-A —
     só uma porta micro-USB/USB-C de energia, que só vira utilizável
     pra pendrive com um **adaptador OTG** (USB-C/micro-USB fêmea →
     USB-A fêmea, barato, do tipo "OTG"), e mesmo assim alguns modelos
     de Stick têm suporte instável a isso — nem sempre funciona.
     Com porta disponível (Cube, ou Stick + OTG): plugar o pendrive
     (FAT32/exFAT) e usar um gerenciador de arquivos (ver Downloader
     abaixo, ele também navega USB) pra achar e instalar o `.apk`.
   - **App Downloader** (mais confiável, funciona em qualquer Fire TV
     sem depender de porta USB): hospedar o `ct-timer.apk` em algum
     lugar com URL direta de download e digitar essa URL dentro do
     Downloader — ele baixa e abre o instalador sozinho.
3. Abrir o app instalado — como não foi publicado na Amazon Appstore,
   ele **não aparece na fileira principal da home**; fica acessível via
   "Aplicativos" → lista de apps instalados. Funciona normalmente a
   partir daí.

## 4. Celular (Android/iOS) — app completo

O próprio app RN, com servidor HTTP embutido — esse é o "hub" que
alimenta o modo celular do Roku (1b) e a página HTML (item 5).
Instalação via build nativo (`npx react-native run-android` ou EAS
Build pra iOS) — ver README.md, seção "Rodando o projeto".

## 5. Qualquer TV com navegador (Samsung, LG, Fire TV via navegador, etc.)

Não precisa instalar nada na TV — o celular (rodando o app do item 4)
serve uma página HTML (`GET /`) que qualquer navegador de TV abre
direto. **Depende do celular estar aberto e na mesma rede Wi-Fi.**

**Uso:**
1. Abrir o app no celular, ele mostra um IP + QR code.
2. Na TV, abrir o navegador (Samsung/LG já vêm com um navegador nativo
   chamado "Internet") e digitar a URL mostrada (ou escanear o QR code
   se o controle da TV tiver câmera).
3. A página atualiza sozinha via polling — nenhuma instalação
   necessária.

**Ainda não validado em TV real** (Samsung/LG) — só testado
funcionalmente via código; vale confirmar na prática quando houver
acesso a uma dessas TVs.

## Fora de escopo por enquanto

- **Samsung Tizen / LG webOS como app nativo** (`.tpk`/`.ipk`): exigem
  SDK e conta de desenvolvedor própria de cada fabricante, incompatível
  com o stack atual (RN + BrightScript). O caminho de navegador (item 5)
  já cobre essas TVs sem precisar de app nativo.
- **VIDAA** (Toshiba/Hisense): mesma limitação — só loja própria/HTML5
  proprietário. Também coberto pelo caminho de navegador.
- **Publicação formal na Amazon Appstore** (Fire TV com ícone na home):
  decisão consciente de ficar só no sideload por enquanto (ver CLAUDE.md,
  13ª decisão).
