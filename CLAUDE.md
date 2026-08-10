# Fight Timer TV — contexto do projeto

Cronômetro em React Native (CLI puro, TypeScript) que transmite o tempo em
tempo real para uma Smart TV via **servidor HTTP embutido no próprio
celular** (sem Google Cast, sem WebSocket, sem login, sem persistência).
Ver [README.md](README.md) para a explicação funcional e o guia de teste
por TV — este arquivo é sobre **decisões e histórico**, para não perder
contexto entre sessões.

**Nome visível ao usuário final: "CT Timer"** (ver 12ª decisão) — pasta do
repositório, `package.json`, identificadores internos e este documento
continuam usando `FightTimerTV`/"Fight Timer TV" por conveniência de
código, mas o app RN, o canal Roku com celular e o canal Roku standalone
mostram "CT Timer" pro usuário.

## Origem

Este projeto nasceu de um app anterior, **`ct-timer`**
(`/home/andre/Dev/ct-timer`), que é um app **Capacitor 8 + HTML/CSS/JS
puro** (não React Native) já publicado como APK Android. O usuário decidiu
**migrar para React Native do zero** para poder transmitir o cronômetro
para uma Smart TV. O `ct-timer` original continua intacto — este é um
projeto novo e separado, não uma modificação daquele.

## Decisões de arquitetura (e por quê)

1. **Servidor HTTP local no celular, não Google Cast.**
   O Google Cast SDK só funciona em dispositivos "Cast-receiver"
   (Chromecast, Android TV/Google TV, alguns Samsung/LG recentes). O
   usuário pretende comprar um **Roku Streaming Stick**, e **Roku não é
   Cast-receiver** — instalar um navegador pela Roku Channel Store não
   muda isso, o protocolo simplesmente não roda lá. Por isso a solução é
   100% HTTP: a TV abre uma URL no navegador dela e faz polling.

2. **Polling HTTP (~300ms), não WebSocket.**
   Bibliotecas RN de WebSocket server embutido são frágeis, e navegadores
   "sideloaded" de Roku costumam ter engines JS mais fracas/antigas.
   Polling HTTP simples via `fetch` é mais robusto e portátil. Para um
   cronômetro (granularidade de 1s), o delay é imperceptível.

3. **`react-native-http-bridge-refurbished`, não `react-native-http-bridge`
   nem `react-native-http-bridge-v2`.**
   O pacote `react-native-http-bridge-v2` (citado no prompt original do
   usuário) **não existe no npm** — foi verificado e descartado. O
   `react-native-http-bridge` original está sem manutenção há mais de um
   ano. `react-native-http-bridge-refurbished` é o fork mantido, com API
   `BridgeServer` + `res.html()`/`res.json()` (ver
   [src/server/timerServer.ts](src/server/timerServer.ts)).

4. **RN CLI puro, não Expo.**
   Pesquisado e confirmado: o Expo Go não roda módulos nativos fora do
   Expo SDK (o servidor HTTP embutido é um deles), então exigiria Expo Dev
   Client — que dá o mesmo trabalho de build nativo que `npx react-native
   run-android` no CLI puro, sem ganho real aqui. Decisão do usuário:
   manter CLI puro.

5. **Sem login, sem persistência.**
   Todo o estado do timer vive em memória (`TimerServer` em
   [src/server/timerServer.ts](src/server/timerServer.ts)) enquanto o app
   está aberto. Nada é salvo em disco, não há conta de usuário — pedido
   explícito do usuário.

## Estrutura

```
App.tsx                        — entry point, monta <TimerScreen/>
src/screens/TimerScreen.tsx    — motor de rounds/intervalo (setup + run,
                                  idêntico em comportamento ao index.html
                                  original), IP local + QR code. Tempo
                                  sempre derivado de Date.now() (ver 8ª
                                  decisão) — o tick de 500ms só re-renderiza
src/screens/TVTimerScreen.tsx  — timer standalone pra Android TV/Google TV/
                                  Fire TV (mesmo APK, ver 13ª decisão):
                                  sem servidor/HTTP/QR code, configurado e
                                  controlado 100% por D-pad + AsyncStorage
src/screens/timerEngine.ts     — lógica pura testável: advancePhase() (algo
                                  clássico) + buildSchedulePhases()/
                                  phaseAtElapsedMs() que derivam a fase a
                                  partir de quanto tempo de luta JÁ PASSOU
                                  (ver 8ª decisão e timerEngine.test.ts)
src/server/timerServer.ts      — servidor HTTP embutido (porta 8080),
                                  GET / (página da TV) e GET /state (JSON:
                                  seconds/elapsedMs/serverNowMs/schedule/…).
                                  O estado é ancorado em Date.now() — cada
                                  resposta deriva a fase na hora
src/receiver/receiverHtml.ts   — HTML/CSS/JS estático servido para a TV:
                                  layout + sino (Web Audio) copiados quase
                                  1:1 do index.html original, dirigidos por
                                  polling em /state (300ms) + relógio de
                                  parede local: guarda schedule+elapsedMs em
                                  cache e segue contando sozinho (ver 8ª)
src/receiver/bebasNeueFont.ts  — fonte Bebas Neue embutida em base64
                                  (copiada de ct-timer/fonts/); mesmo .ttf
                                  também linkado nativamente em
                                  android/app/src/main/assets/fonts/ e
                                  roku/fonts/ (ver 10ª decisão)
android/…, ios/…               — permissões já configuradas (ver README.md);
                                  TimerForegroundService.kt/Module.kt/
                                  Package.kt em android/app/src/main/java/
                                  com/fighttimertv/ (ver 9ª decisão); ícone
                                  custom em mipmap-*/ic_launcher*.png
roku/                          — canal Roku nativo com celular (BrightScript/
                                  SceneGraph), testado em hardware real (ver
                                  7ª decisão e a seção "Canal Roku nativo"
                                  do README.md)
roku-standalone/               — segundo canal Roku, sem celular: configurado
                                  e controlado 100% pelo controle remoto,
                                  cronograma de rounds montado localmente
                                  (ver 11ª decisão). Testado em hardware
                                  real, bug de CLng() já corrigido
eas.json, app.json              — config do EAS Build pra compilar iOS na
                                  nuvem sem precisar de Mac (ver 10ª decisão)
```

## 6ª decisão: layout copiado do `ct-timer` original

O usuário pediu explicitamente para reaproveitar o layout do
`index.html` do `ct-timer` (fundo escuro, Bebas Neue, número gigante
amarelo, indicador de round, barra de progresso, overlay "FIM") — está
"quase idêntico" por pedido dele, não por economia de esforço. O sino
metálico (Web Audio) também foi copiado quase literalmente, mas passou a
tocar **na TV**, não no celular, porque é a caixa de som que todo mundo na
sala ouve — decisão de engenharia minha, documentada aqui para não ser
revertida sem querer numa sessão futura. O motor de rounds/intervalo do
`TimerScreen.tsx` também foi reescrito para espelhar a lógica original
(`beginPhase`/`tick` do index.html), que antes era só uma contagem
regressiva simples.

## 7ª decisão: canal Roku nativo além (não em vez) da página HTML

O usuário testou em dispositivo real e as duas TVs dele são Roku — que
não é Cast-receiver (decisão #1) e depende de um navegador "sideloaded"
de terceiros pra abrir `receiverHtml.ts`, o que na prática se mostrou um
obstáculo (nenhum navegador built-in). Em vez de insistir num navegador
de terceiros frágil, construímos um **canal Roku nativo em BrightScript/
SceneGraph** (`roku/`) que fala HTTP direto com `GET /state`, sem
navegador nenhum.

**Importante: isso não substitui a página HTML — as duas coisas
convivem.** `GET /` continua servindo `receiverHtml.ts` normalmente, e
continua sendo o caminho pra **qualquer outra Smart TV com navegador**
(Samsung Tizen, LG webOS, Android TV/Google TV, Fire TV) — só a Roku
ganhou um canal dedicado porque é o caso onde o navegador não é uma
opção confiável.

**Testado em hardware real com sucesso** nesta sessão (Roku TV AOC,
`192.168.0.18`) — polling, timer, sons de início/fim distintos, fonte
Bebas Neue embutida, spinners de configuração de IP. Ver seção "Canal
Roku nativo" do README.md para a estrutura completa e o passo a passo de
instalação/empacotamento — inclui um **kit de depuração remota** (console
de debug via telnet, simulação de controle remoto via ECP) que valeu a
pena documentar em detalhe, porque foi assim que os bugs abaixo foram
encontrados sem acesso físico à TV.

### Bugs reais encontrados e corrigidos no canal Roku (não reintroduzir)
1. **Campo `visible` redeclarado como custom** num componente filho
   colidia com o campo nativo já existente em todo nó SceneGraph — o
   `onChange` simplesmente não disparava. Nunca redeclarar `visible`;
   usar outro nome de campo pra qualquer coisa "ligada" a mostrar/esconder.
2. **`setFocus()` chamado durante `init()` da cena sempre falha**
   silenciosamente (retorna `false`/o nó nunca fica com foco de verdade)
   porque `roSGScreen.show()` só roda depois, em `main.brs`. Corrigido
   com um `Timer` de disparo único que adia a primeira tentativa de foco.
3. **Roteamento de tecla pra dentro de um componente customizado
   aninhado (`IpEntry`) não é confiável**, mesmo com foco confirmado via
   `hasFocus()` retornando `true` — eventos de tecla real do controle só
   chegavam de forma consistente na `MainScene` (cena raiz). Solução:
   abandonar o componente filho separado e gerenciar a tela de IP
   inteira dentro da própria `MainScene`, com destaque manual de cor em
   vez de depender do sistema de foco nativo por nó.
4. **Teclado alfanumérico pra digitar `IP:porta` trocava "." por ":"**
   de forma consistente (bug de índice, não de digitação do usuário) —
   abandonado de vez o teclado; virou **4 spinners numéricos (0-255)**
   pros octetos do IP + porta `8080` fixa (nunca editável, já que o app
   RN sempre usa essa porta) — sugestão do usuário, eliminou a classe
   inteira de bug.
5. **Fontes customizadas sem `uri` de verdade (só `size`, ou nomes
   `font:...` de sistema) renderizaram como "tofu" (quadrados vazios)**
   em teste real — confirmado visualmente. Corrigido embutindo a fonte
   Bebas Neue de verdade (`roku/fonts/BebasNeue-Regular.ttf`) via
   `<Font role="font" uri="pkg:/fonts/BebasNeue-Regular.ttf" size="..."/>`
   dentro de cada `<Label>`. É o mesmo `.ttf` usado no receiver HTML e
   agora também no app RN (ver 10ª decisão).
6. **`foregroundServiceType="connectedDevice"` no Android crashava o
   app** (não é bug da Roku, é o outro lado do sistema) — ver 9ª decisão.

### Kit de depuração remota da Roku (documentar pra não redescobrir)
- **Console de debug ao vivo**: `telnet <ip-roku> 8085` (ou
  `exec 3<>/dev/tcp/<ip>/8085; cat <&3` em bash puro) — mostra os
  `print` do BrightScript e stack traces de erro em tempo real. Conectar
  ANTES de reinstalar pra não perder o boot log (a conexão só mostra
  daí pra frente, não tem replay completo do histórico).
- **ECP (External Control Protocol)**, porta 8060, sem autenticação:
  - `curl -d '' http://<ip>:8060/keypress/<Tecla>` simula um botão do
    controle remoto (`Up`, `Down`, `Left`, `Right`, `Select`, `Back`,
    `Info` etc.) — dá pra automatizar navegação sem controle físico.
    **Cuidado**: útil pra testes gerais, mas não confie cegamente nele
    pra depurar timing fino (esse projeto teve um caso real de resultado
    diferente entre ECP e controle físico por causa de velocidade de
    disparo, não era bug de app).
  - `curl http://<ip>:8060/query/active-app` confirma qual canal está
    rodando.
- **Sideload via `curl`** (ver README) sempre substitui a versão anterior
  e reinicia o canal — mas se o `.zip` for **idêntico** ao já instalado,
  a Roku responde "Identical to previous version -- not replacing." e
  NÃO reinstala. Mudar o `build_version` no `roku/manifest` a cada
  iteração garante que sempre reinstala de verdade.
- **Gerar chave de assinatura + `.pkg`** (pra Beta App, ver README): usa
  **porta 8080 por telnet** (`genkey`) — não confundir com a porta 8085
  do console de debug, nem com a 8060 do ECP. Três portas, três
  finalidades diferentes.

## 8ª decisão: tempo derivado de relógio de parede, não de contador

Uma tentativa anterior nesta mesma sessão foi **compensar tempo via
`AppState`** — "avançar X segundos ao voltar do background" — o que
funcionava mal em transições de fase e ainda deixava a TV congelada
enquanto o app estava minimizado (só corrigia o estrago depois). A
solução definitiva, **testada em hardware real com sucesso** (celular em
2º plano + TV sincronizada, aprovado pelo usuário), foi abandonar a
contagem decrementada por `setInterval` inteiramente:

- **`TimerScreen.tsx` e `timerServer.ts`** guardam apenas **âncoras de
  relógio** (`startedAtMs` + tempo já acumulado; pause congela a âncora e
  resume move-a). Cada `GET /state` é respondido **na hora**, derivando
  `seconds`/`phase`/`currentRound` de `Date.now()` — se o JS do celular
  congelar por 3 minutos, uma resposta que consiga sair já volta correta.
- O `TimerScreen` nem precisa de compensação: o tick de 500ms só força
  re-render e lê `Date.now()`; ao voltar do background o cálculo (função
  pura `phaseAtElapsedMs`) cai direto na coordenada certa do cronograma.
- **`receiverHtml.ts` e canal Roku** guardam um **cache local**
  (`schedule` + `elapsedMs` + relógio local) e continuam contando pelo
  próprio relógio mesmo que o polling do celular pare — o sino (Web Audio
  na página, WAV no Roku) dispara localmente pela mesma derivação.

**Não reverter para contador** sem entender: a "solução" anterior de
compensar segundos na volta (`AppState` listener + `advancePhase` manual)
foi tentada e **abandonada** por resolver ~metade do problema. A forma
correta é sempre derivar de `Date.now()` — ver `phaseAtElapsedMs()` e como
o receiver cacheids o cronograma.

**O foreground service (ver 9ª decisão) não foi abandonado** — continua
existindo como camada extra de confiabilidade (mantém o processo com
prioridade alta, o que ajuda o servidor HTTP a continuar respondendo
rápido em background), só deixou de ser a *fonte da correção* do tempo
em si. As duas coisas convivem.

## 9ª decisão: foreground service Android como reforço (não a correção em si)

Mesmo com o relógio de parede (8ª decisão) garantindo que o **tempo**
sempre bate, um foreground service ajuda o **servidor HTTP** a continuar
respondendo com prioridade normal em segundo plano (sem ele, o Android
pode limitar tanto a ponto do processo nem processar a request de
`/state` a tempo). Implementado em
[android/app/src/main/java/com/fighttimertv/TimerForegroundService.kt](android/app/src/main/java/com/fighttimertv/TimerForegroundService.kt)
+ `TimerForegroundModule.kt` (ponte pro RN, com `Promise` em vez de
fire-and-forget — importante pra poder mostrar erro real na tela em vez
de falha silenciosa) + `TimerForegroundPackage.kt`, ligado a
`screen === 'run'` em `TimerScreen.tsx`.

**Bug real encontrado e corrigido**: a primeira versão usava
`android:foregroundServiceType="connectedDevice"`, que no Android 14+
tem pré-requisitos de Bluetooth/companion device que o app não atende —
lançava uma exceção não tratada dentro de `startForeground()` e
**derrubava o app inteiro** ao apertar "INICIAR" (confirmado em teste
real: "abre e fecha sozinho"). Trocado para
`android:foregroundServiceType="specialUse"` (tipo genérico documentado,
sem pré-requisitos de hardware) + `try/catch` em toda parte arriscada —
esse recurso **nunca pode derrubar o app**, é melhoria de confiabilidade,
não algo essencial.

Um segundo problema apareceu depois (app não crashava mais, mas também
não mostrava a notificação nem erro nenhum): investigado com
`Promise.reject()` propagando a mensagem real de exceção pra tela do
app (em vez de engolir com try/catch mudo) — método útil de diagnosticar
sem `adb logcat`, que não estava disponível nessa sessão (celular só
conectado via Wi-Fi, nunca por cabo USB nesta máquina).

## 10ª decisão: Bebas Neue e ícone também no app do celular

Até aqui a fonte Bebas Neue só existia embutida no HTML da TV
(`src/receiver/bebasNeueFont.ts`). Pedido do usuário: "nem toda TV usa
Roku" — as correções visuais precisam valer pro app RN também, não só
pro receptor da TV. Copiado o mesmo `.ttf` pra
`android/app/src/main/assets/fonts/` (convenção de autolink do RN
≥0.60, sem precisar de `react-native.config.js`) e aplicado via
`fontFamily: 'BebasNeue-Regular'` nos estilos de `TimerScreen.tsx`. iOS
recebeu a entrada `UIAppFonts` no `Info.plist`, mas **ainda precisa que
alguém arraste o `.ttf` pro projeto Xcode manualmente** (não dá pra
editar o `.pbxproj` com segurança só por fora) — pendente até o primeiro
build em macOS.

O ícone do app também foi trocado do placeholder padrão do template RN
(robozinho verde do Android) para um ícone customizado gerado com
Pillow/Python (`android/app/src/main/res/mipmap-*/ic_launcher*.png`):
cronômetro amarelo em fundo **preto sólido, edge-to-edge** — importante
que o fundo preencha o quadrado inteiro sem transparência/padding, senão
alguns launchers (confirmado num Samsung One UI) desenham um quadrado
branco atrás do ícone.

**Complemento (2ª ocorrência do mesmo sintoma, sessão posterior)**: o
quadrado branco atrás do ícone voltou a aparecer num Samsung One UI real
mesmo com os PNGs legados já 100% opacos borda-a-borda (confirmado por
inspeção de pixel — não era mais transparência). A causa raiz dessa vez
era outra: **faltava um ícone adaptativo declarado** (`mipmap-anydpi-v26/`,
API 26+). Sem essa declaração, o launcher trata o PNG legado como
"não-adaptativo" e sintetiza um backplate branco por conta própria antes
de aplicar a máscara do sistema. Corrigido com
`android/app/src/main/res/values/colors.xml`
(`ic_launcher_background = #1A1A1A`, mesma cor do fundo do ícone) +
`mipmap-anydpi-v26/ic_launcher.xml` e `ic_launcher_round.xml`
(`<adaptive-icon>` com esse background sólido + foreground = cópia do PNG
legado em cada densidade, `ic_launcher_foreground.png`). Moral: "fundo
opaco no PNG" e "ícone adaptativo declarado" são dois requisitos
independentes — os dois já foram vistos causando esse mesmo sintoma em
launchers Samsung reais nesta sessão de trabalho.

## 11ª decisão: segundo canal Roku standalone, sem celular

Depois de ver um concorrente (Sensei Timer) que também resolve
cronômetro de treino pra TV de academia, o usuário perguntou se dava pra
ter uma versão do canal Roku que não depende do celular como servidor —
configurada e controlada 100% pelo controle remoto. Confirmado
explicitamente: **um canal Roku separado** (pacote/instalação própria),
**não** um modo alternável dentro do canal existente — `roku/` continua
100% como estava, sem nenhuma mudança de lógica (só o texto do `title`
mudou, ver 12ª decisão).

Criado `roku-standalone/`, cópia estrutural de `roku/` (mesmos
manifest/components/fonts/audio/images), mas:
- **sem** `PollTask`/rede nenhuma — não existe servidor pra consultar.
- **sem** tela de IP — não há endereço nenhum pra configurar.
- **com** uma tela de setup por spinners (ROUNDS, TEMPO DE ROUND,
  INTERVALO — mesmos limites/passos de `TimerScreen.tsx`: 1-99 passo 1,
  30-3600s passo 30, 0-3600s passo 15) como única tela de configuração,
  seguindo literalmente o padrão do `ipEntryGroup` original (destaque
  manual por cor, sem `setFocus()` nativo por campo, tudo dentro da
  própria `MainScene` — nunca em componente filho, ver bug #3 da 7ª
  decisão).
- **com** `buildSchedulePhases()` portado de
  [src/screens/timerEngine.ts](src/screens/timerEngine.ts) pra
  BrightScript (função pura, sem API JS específica, direto de portar) —
  é esse canal que monta o cronograma agora, e alimenta o mesmo
  `m.cache = { state, rxSec }` que o canal original usa, então
  `deriveState()`/`lookupPhase()`/`applyState()`/`maybePlayBell()` são
  cópias quase literais (mesmo contrato de dados, só muda a origem do
  `schedule`: local em vez de vir de `/state`).

Controle 100% pelo remoto: `play` alterna pausa/retomada (mesma âncora
de `TimerServer.pause()/resume()` — pausar congela `elapsedMs` calculado
na hora, retomar reancora o relógio mantendo o elapsed acumulado);
`replay` reseta pra tela de setup; `back` **não é interceptado**
(mantém sair do canal, comportamento padrão do sistema). Última
configuração persistida em `roRegistrySection("FightTimerTVStandalone")`
— seção de registro própria, não colide com `serverAddress` do canal
original — pra não precisar reconfigurar toda vez que a TV liga.

Todos os bugs documentados na 7ª decisão (nunca redeclarar `visible`,
`setFocus()` só via Timer adiado, roteamento de tecla só na `MainScene`
raiz, fontes com `uri` real) foram respeitados desde o primeiro rascunho
do novo canal.

**Testado em hardware real numa sessão posterior** (mesma Roku TV AOC,
`192.168.0.18`) — sideload funcionou lado a lado com `roku/`
(confirmado: dois canais distintos, "CT Timer" e "CT Timer Standalone").

### Bug real encontrado e corrigido: `CLng()` não existe em BrightScript

Primeira versão de `buildSchedulePhases()`/`computeElapsedMs()` usava
`CLng(x)` como função de conversão pra `LongInteger` — isso existe em
Visual Basic, **não em BrightScript**. Como `CLng` não está declarado,
o BrightScript trata o identificador como `Invalid` e tentar "chamá-lo"
(`CLng(0)`) lança `Function Call Operator ( ) attempted on non-function
(runtime error &he0)`. Isso acontecia **dentro do handler de tecla OK**
(`onKeyEvent → startFight → buildSchedulePhases`), então o crash travava
a thread de script da cena inteira — sintoma no controle remoto: app
trava por completo ao apertar OK pra iniciar a luta, nenhuma tecla
(nem Back) responde mais depois disso.

**Como foi diagnosticado**: `query/active-app` (ECP) confirmou que o
canal continuava "ativo" (não caiu pra Home sozinho — não era um crash
que o sistema recuperasse), then conectar o console de debug (`telnet
8085`) **antes** de reproduzir o problema via ECP
(`curl -d '' http://<ip>:8060/keypress/Select`) capturou o stack trace
real, incluindo a linha exata e as variáveis locais no momento do erro —
muito mais rápido que adivinhar por leitura estática do código (que não
achou a causa sozinha).

**Correção**: trocar `CLng(x)` pelo sufixo `&` de literal LongInteger, a
forma correta em BrightScript — `CLng(0)` → `0&`, `CLng(roundTimeSec) *
1000` → `roundTimeSec * 1000&` (o `&` no literal `1000&` já promove a
expressão inteira pra LongInteger, sem precisar de função de conversão
nenhuma). **Não reintroduzir `CLng()`** em nenhum `.brs` deste projeto —
nem no canal `roku/` original (que não usa essa função, então não tem
esse bug), nem em código novo.

## 12ª decisão: rebranding do nome visível para "CT Timer"

Pedido do usuário: o nome mostrado ao usuário final deve ser **"CT
Timer"** — referência direta ao app original `ct-timer` que deu origem a
este projeto (ver seção "Origem" no topo deste arquivo). Confirmado
explicitamente que é rebranding de **projeto inteiro** (app RN + os dois
canais Roku), mas **só o nome visível** — pasta do repositório,
`package.json` (`name` interno), identificadores de bundle/pacote e todo
o código continuam `FightTimerTV`/`fighttimertv`. Trocar esses
identificadores internos teria custo/risco desproporcional (bundle ID
mudado invalida reinstalação como app já existente nas lojas/EAS Build)
por um ganho puramente cosmético.

Trocado em 5 lugares: `app.json` (`displayName`), `android/app/src/main/
res/values/strings.xml` (`app_name`, nome embaixo do ícone no launcher),
`ios/FightTimerTV/Info.plist` (`CFBundleDisplayName`), `roku/manifest`
(`title`, + `build_version` subiu pra forçar reinstalação real) e o
label "logo" na tela do canal Roku original
(`roku/components/MainScene.xml`, texto "FIGHT TIMER" → "CT TIMER"). O
canal novo (`roku-standalone/`, ver 11ª decisão) já nasceu com "CT
Timer"/"CT TIMER" desde o primeiro commit, sem precisar de migração.

## 13ª decisão: mesmo APK vira timer standalone em Android TV/Google TV/Fire TV

Depois do canal Roku standalone (11ª decisão), o usuário pediu o mesmo
conceito — timer configurado e controlado 100% pelo controle remoto, sem
celular — para as plataformas de TV que aceitam instalação direta de
`.apk`: **Android TV/Google TV** e **Fire OS** (Amazon Fire TV, fork do
Android). Diferente da Roku, aqui não foi preciso portar nada pra outra
linguagem: `buildSchedulePhases()`/`phaseAtElapsedMs()` em
[src/screens/timerEngine.ts](src/screens/timerEngine.ts) já são
TypeScript puro e foram reaproveitados direto.

**Mesmo APK dos dois mundos, detecção em runtime.** `Platform.isTV` do
RN core (não depende de `react-native-tvos`, que é mais voltado a tvOS)
é resolvido pelo Android via `UiModeManager` reportando
`UI_MODE_TYPE_TELEVISION` — é runtime, não build-time, e `false` em
qualquer celular normal. `App.tsx` decide entre `<TimerScreen/>`
(celular, servidor HTTP + QR code, intocado) e
`<TVTimerScreen/>` (novo, [src/screens/TVTimerScreen.tsx](src/screens/TVTimerScreen.tsx))
sem precisar de build separado nem product flavor — o mesmo `.apk`
gerado por `assembleRelease` funciona como app de celular ou como timer
standalone dependendo de onde é aberto.

`TVTimerScreen.tsx` é uma tela **irmã**, não uma variante de
`TimerScreen.tsx`: não instancia `TimerServer`/HTTP/QR code/`NetworkInfo`
— zero rede, 100% local ao processo, mesmo mecanismo de relógio de
parede (âncoras de `Date.now()`, nunca `setInterval` decrementando, ver
8ª decisão) copiado do padrão já validado, não abstraído num hook
compartilhado (evita risco na tela de celular já validada em produção).

**Persistência da última config (rounds/tempo/intervalo)** via
`@react-native-async-storage/async-storage` — mesma exceção pontual à
filosofia "sem persistência" já aberta pro canal Roku standalone (sem
celular por perto, reconfigurar do zero toda vez que a TV liga seria
atrito real).

**Navegação por D-pad em RN puro, sem `react-native-tvos`**: confirmado
por leitura do código-fonte do RN 0.86.2 que `hasTVPreferredFocus` e
`nextFocusUp/Down/Left/Right` **só existem tipados em
`TouchableOpacity`**, não em `Pressable`, nesta versão — por isso
`TVTimerScreen.tsx` usa `TouchableOpacity` em vez de `Pressable` (que é
o padrão usado em `TimerScreen.tsx`) especificamente pra essa tela. O
destaque visual de foco é manual via `onFocus`/`onBlur` guardando uma
`focusedKey` em estado (o atalho `state.focused` do `Pressable` também
não está tipado nesta versão). `nextFocus*` recebem `number`
(`reactTag` via `findNodeHandle`), não uma ref direta — montados num
`useEffect` após todos os refs existirem. `TVEventHandler` não existe
no RN core (só no fork `react-native-tvos`) e não faz falta: OK/Select
do controle já mapeia nativamente pra clique no elemento focado.

**Armadilha real evitada, não reintroduzir**: sem um listener em
`BackHandler.addEventListener('hardwareBackPress', ...)`, apertar Back
no controle remoto durante a corrida do timer **fecha o app inteiro**
(RN chama `BackHandler.exitApp()` por padrão). `TVTimerScreen.tsx`
registra esse listener só na tela de "run" (consome o evento, volta pro
setup); na tela de "setup" o Back "vaza" de propósito, pra permitir sair
do app normalmente — comportamento esperado de qualquer app leanback
bem-comportado.

**Manifest aditivo, não exclusivo**: `AndroidManifest.xml` ganhou
`<uses-feature android:name="android.software.leanback"
android:required="false"/>`, idem pra `android.hardware.touchscreen`,
`android:banner="@drawable/tv_banner"` na `<application>`, e uma
segunda categoria `LEANBACK_LAUNCHER` no `intent-filter` da
`MainActivity` (mantendo `LAUNCHER`). `required="false"` nas duas
`uses-feature` garante que nada disso vira exigência que esconderia o
app de celulares comuns — launcher de celular ignora
`LEANBACK_LAUNCHER`, launcher de TV usa especificamente ela.

**Fire OS**: mesmo `.apk` funciona via sideload sem nenhuma mudança de
código (`UiModeManager` também resolve TV lá, `Platform.isTV` ativa a
tela certa sozinho) — mas a Fire TV **não usa `LEANBACK_LAUNCHER`** pra
listar apps na home; apps sideloaded (sem publicação formal na Amazon
Appstore, fora de escopo por decisão do usuário) só ficam acessíveis via
"Aplicativos > [Nome]" no menu de apps instalados, não na fileira
principal. É só limitação de descoberta, não de funcionamento.

**Banner 320x180** gerado via `scripts/gen_tv_banner.py` (Pillow),
reaproveitando a paleta `#C8F400`/`#1a1a1a` e a fonte Bebas Neue já
usadas em todo o projeto — salvo em
`android/app/src/main/res/drawable/tv_banner.png`.

**Ainda não testado em hardware/emulador real** (implementado sem
acesso a Android TV/Fire TV físicos nesta sessão) — próximo passo é
validar em emulador Android TV (AVD "Television") antes de sideload
real, cobrindo especificamente: navegação D-pad completa, Back não
fechando o app durante a corrida, banner aparecendo no launcher.

## Estado atual / próximos passos

- **Testado em Android físico com sucesso**: build release
  (`assembleRelease`, standalone, JS embutido) instalada e rodando;
  rotação livre (`fullSensor`), link "reiniciar configuração" durante o
  run, app minimizado em background continua contando e a TV fica
  sincronizada, foreground service sem crashar, fonte Bebas Neue e ícone
  customizado aplicados.
- **Canal Roku testado em hardware real com sucesso** (ver 7ª decisão) —
  sideload, polling, timer, sons, teclado de configuração, tudo
  validado. **Empacotado como `.pkg` assinado** (chave de assinatura
  gerada via `genkey`, guardada com o usuário — Dev ID
  `f11c8f0748fd3410ffe7cc89e45a85e98ec42166`) pronto pra publicar como
  Beta App no Roku Developer Dashboard — falta só o usuário criar a
  conta e fazer o upload (ver README).
- **iOS**: `Info.plist` com landscape + `UIAppFonts` configurados, mas
  **nunca testado em dispositivo** (sem Mac disponível nesta máquina).
  Projeto **vinculado ao EAS Build** (`eas.json` +
  `extra.eas.projectId` em `app.json`, conta Expo `andrepfdev` já
  logada nesta máquina) pra buildar na nuvem sem precisar de Mac — mas
  o primeiro build trava numa etapa que só o usuário pode fazer:
  autenticação interativa com Apple ID (login + 2FA), que não dá pra
  automatizar. Comando que o usuário precisa rodar uma vez:
  `npx eas-cli build --platform ios --profile preview`. Depois da
  primeira vez, as credenciais ficam salvas e builds futuros não devem
  precisar de interação.
- Página HTML (`receiverHtml.ts`) pra outras Smart TVs (Samsung, LG,
  Android TV, Fire TV) **nunca foi validada em TV real** ainda — só o
  canal Roku e o app Android foram testados fisicamente até agora.

## Ideias futuras: monetização (não iniciado, só registrado pra não perder contexto)

O usuário mencionou um plano pra uma **versão futura** — ainda não é
uma tarefa em andamento, não começar a implementar sem pedido explícito
depois:

- **Stack pretendida**: API própria em **Express**, hospedada na
  **Vercel**, banco de dados **Neon** (Postgres serverless), pagamento
  via **Stripe**.
- **Modelo de acesso**: sem cadastro de usuário (sem login/senha) — a
  pessoa paga no Stripe e recebe um **código** que digita no app/TV pra
  desbloquear, no estilo "license key" avulsa em vez de conta. Isso
  preserva o espírito "sem login" que já rege o projeto hoje (5ª
  decisão) — a mudança é só cobrar pelo acesso, não introduzir conta de
  usuário.

**Pesquisa sobre o concorrente** (Sensei Timer, `senseitimer.com.br`,
ver também a análise comparativa feita numa sessão anterior): o
pagamento deles passa por **Cakto** (`pay.cakto.com.br`, plataforma de
checkout brasileira, não é Stripe direto), e a página tem indícios de
ser **login/conta tradicional** (botão "Entrar", menção a "faça login
com a mesma conta do celular") — **nenhuma menção** a código de
ativação/chave de licença foi encontrada no conteúdo público da página.
Não dá pra confirmar 100% sem acesso ao checkout de verdade, mas a
inferência é que o modelo deles é diferente do que o usuário quer fazer
(conta em vez de código avulso) — vale essa pesquisa só como referência
de mercado, não como modelo a seguir.

## Skills relevantes do Claude Code para este projeto

- **`run`** — usar para efetivamente rodar/buildar o app RN e ver a
  mudança funcionando (`npx react-native run-android`), em vez de só
  typecheck estático.
- **`code-review`** — rodar antes de builds de release, especialmente
  para revisar o servidor HTTP embutido (superfície de rede exposta) e a
  lógica de estado do timer.
- **`security-review`** — o app expõe um servidor HTTP sem autenticação
  na rede local por design (é o objetivo: qualquer TV na rede acessa o
  timer); vale rodar esse skill ao menos uma vez para confirmar que não
  há endpoint além de `/` e `/state`, e que não há dados sensíveis
  trafegando.
- **`artifact-design`/`dataviz`** — não se aplicam a este projeto (não há
  Artifacts nem dashboards de dados aqui).
