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
2. Instalar via `curl` (substitui a versão sideloaded anterior):
   ```bash
   curl --user rokudev:<senha> --anyauth -sS \
     -F "mysubmit=Install" -F "archive=@ct-timer-roku-standalone.zip" -F "passwd=" \
     http://<ip-da-roku>/plugin_install
   ```
   (ou pelo navegador: abrir `http://<ip-da-roku>` e subir o `.zip` pela
   interface do Development Application Installer.)
3. Pode instalar os dois zips na mesma Roku — aparecem como dois canais
   separados ("CT Timer" e "CT Timer Standalone").

**Publicação sem Developer Mode (Beta App)**: dá pra empacotar como
`.pkg` assinado e distribuir por código de acesso, sem precisar ativar
Developer Mode em cada TV — processo completo documentado no
[README.md](README.md), seção "Canal Roku nativo".

## 2. Android TV / Google TV — `ct-timer.apk`

Mesmo APK do celular — detecta automaticamente que está rodando numa TV
(`Platform.isTV`) e mostra a tela standalone (configuração + corrida
pelo controle remoto), sem servidor nem QR code.

**Instalação:**
1. Habilitar "Fontes desconhecidas": Configurações → Sistema → Sobre →
   clicar 7x no número da versão (ativa Opções do Desenvolvedor) →
   Privacidade/Segurança → Aplicativos desconhecidos → permitir pelo
   app que vai instalar o APK.
2. Transferir o `ct-timer.apk` pra TV — por app de transferência via
   Wi-Fi (ex: "Send Files to TV"), pendrive, ou `adb install
   ct-timer.apk` se a TV tiver depuração USB/rede ativada.
3. Abrir o gerenciador de arquivos na TV, selecionar o `.apk`, instalar.
4. O app aparece na lista de apps com banner próprio (ícone/banner de TV
   já embutidos no APK).

## 3. Fire TV (Fire OS) — mesmo `ct-timer.apk`

Fire OS é fork do Android, aceita o mesmo APK.

**Instalação:**
1. Habilitar apps de fontes desconhecidas: Configurações → Minha Fire TV
   → Sobre → clicar 7x no nome do dispositivo → voltar em Opções do
   Desenvolvedor → ativar "Instalar apps desconhecidos".
2. Instalar o app **Downloader** (Amazon Appstore) na própria Fire TV.
3. Hospedar o `ct-timer.apk` em algum lugar com URL direta (ex: um link
   de download simples) e digitar essa URL no Downloader.
4. Abrir o app instalado — como não foi publicado na Amazon Appstore,
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
