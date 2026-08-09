# Fight Timer TV

Cronômetro em React Native (Android/iOS) que transmite o tempo em tempo real
para **qualquer Smart TV com navegador** (Roku via canal de navegador, Android
TV/Google TV, Samsung Tizen, LG webOS, Fire TV) através de um **servidor HTTP
embutido no próprio celular** — sem login, sem conta, sem nada salvo em disco
(todo o estado do timer vive em memória enquanto o app está aberto).

## Por que essa arquitetura (e não Google Cast)?

O Google Cast SDK só funciona em dispositivos "Cast-receiver" (Chromecast,
Android TV/Google TV, alguns Samsung/LG recentes). **A Roku não é um
dispositivo Cast-receiver** — instalar um navegador da Roku Store não muda
isso, o protocolo Google Cast simplesmente não roda lá. Por isso a solução
aqui é 100% baseada em HTTP: o celular sobe um mini servidor web, a TV abre
essa página no navegador dela e fica dando polling no estado do timer a cada
~300ms. Isso funciona em qualquer TV com um navegador instalado, incluindo os
navegadores "sideloaded" disponíveis na Roku Channel Store.

## Como funciona

1. O app RN inicia um servidor HTTP na porta `8080` assim que abre
   ([src/server/timerServer.ts](src/server/timerServer.ts)).
2. `GET /` retorna a página estática da TV
   ([src/receiver/receiverHtml.ts](src/receiver/receiverHtml.ts)).
3. `GET /state` retorna o estado atual do timer em JSON:
   `{ seconds, totalTime, running, paused, phase, currentRound, totalRounds, soundOn, formatted, elapsedMs, serverNowMs, schedule, roundTimeSec, breakTimeSec }`,
   onde `phase` é `idle | round | rest | done`. **Importante**: `seconds`/
   `phase`/`currentRound` são sempre *derivados* de `elapsedMs` +
   `Date.now()` no instante da resposta — não são uma variável
   decrementada por `setInterval` (ver "Relógio de parede" abaixo). O
   `schedule` é o cronograma completo da luta (todos os rounds/intervalos
   como offsets absolutos), pra quem consome `/state` conseguir continuar
   contando sozinho mesmo que o polling pare de vir por um tempo.
4. A página da TV faz `fetch('/state')` a cada 300ms e atualiza a tela —
   não é WebSocket, é polling HTTP simples (mais robusto em navegadores de
   TV com engines mais fracas, como os da Roku).
5. A tela do app ([src/screens/TimerScreen.tsx](src/screens/TimerScreen.tsx))
   mostra o IP local + um QR code apontando para `http://<IP>:8080`.

### Layout e som idênticos ao `ct-timer` original

O visual da TV ([src/receiver/receiverHtml.ts](src/receiver/receiverHtml.ts))
foi copiado quase 1:1 da tela "run" + overlay "FIM" do `index.html` do
projeto `ct-timer` (fundo escuro, fonte Bebas Neue, número gigante em
amarelo, indicador de round, barra de progresso, cor cinza no intervalo e
vermelha nos últimos 10s). A fonte Bebas Neue vai embutida em base64
([src/receiver/bebasNeueFont.ts](src/receiver/bebasNeueFont.ts), licença
SIL OFL em [src/receiver/assets/OFL.txt](src/receiver/assets/OFL.txt)) —
assim a página não depende de acesso à internet nem de uma rota extra no
servidor.

O sino metálico (sintetizado via Web Audio API, mesmo código do
`index.html`) toca **na própria TV**, não no celular — faz mais sentido
numa academia, já que é a caixa de som da TV que todo mundo ouve. A página
da TV detecta as transições de estado (início de round, aviso aos 10s, fim
de round, fim do treino) comparando cada resposta de `/state` com a
anterior, e tem um botão de mudo próprio (local à TV, independente do
celular).

### Relógio de parede: por que o timer não trava se o celular for minimizado

O tempo **nunca** é uma variável decrementada por `setInterval` — isso foi
tentado e trocado depois de testar em dispositivo real e ver o cronômetro
travar assim que o app saía de primeiro plano. Em vez disso:

- `TimerServer`/`TimerScreen` guardam só **âncoras de relógio**
  (`Date.now()` de quando a fase atual começou + tempo já acumulado
  antes dela). Cada leitura de tempo (`GET /state`, ou o tick de exibição
  do próprio celular) **deriva** `seconds`/fase/round na hora, a partir
  de `Date.now()` — nunca soma "mais 1 segundo" a uma variável.
- Isso significa que, mesmo que o JS do celular fique **minutos**
  suspenso em segundo plano (o Android faz isso por economia de bateria),
  a primeira resposta que conseguir sair depois já volta com o valor
  certo — não precisa de nenhuma "compensação" ao voltar.
- `receiverHtml.ts` e o canal Roku levam isso um passo adiante: guardam
  um **cache local** do último `/state` (o `schedule` completo da luta +
  `elapsedMs` + o relógio próprio deles no momento do recebimento) e
  continuam contando **sozinhos**, pelo próprio relógio, mesmo que o
  polling no celular pare de responder por um tempo — só voltam a
  confiar no celular quando ele responder de novo.
- Um **Android foreground service** nativo (`TimerForegroundService.kt`)
  continua existindo como reforço — mantém o processo com prioridade
  alta em segundo plano, o que ajuda o servidor HTTP a responder mais
  rápido — mas não é mais a fonte da correção em si, é só uma camada
  extra de confiabilidade.

## Rodando o projeto

```bash
npm install
# Android
npx react-native run-android
# iOS (precisa rodar `cd ios && pod install` antes, em um Mac)
cd ios && pod install && cd ..
npx react-native run-ios
```

> Use um **dispositivo físico** (não emulador/simulador) — o IP de Wi-Fi real
> só existe em um aparelho conectado à mesma rede da TV.

## Permissões nativas já configuradas

### Android — [android/app/src/main/AndroidManifest.xml](android/app/src/main/AndroidManifest.xml)
- `INTERNET` — já vinha no template, necessária para o servidor HTTP.
- `ACCESS_WIFI_STATE` / `ACCESS_NETWORK_STATE` — para ler o IP/SSID do Wi-Fi
  (usado para montar a URL e o QR code).
- O manifest usa `android:usesCleartextTraffic="${usesCleartextTraffic}"`
  (placeholder do template RN), resolvido para `true` em
  [android/app/build.gradle](android/app/build.gradle) via
  `manifestPlaceholders`. Como o servidor é HTTP puro (sem HTTPS — não faz
  sentido gerar certificado para um IP local dinâmico), isso vale tanto para
  debug quanto para release.

### iOS — [ios/FightTimerTV/Info.plist](ios/FightTimerTV/Info.plist)
- `NSLocalNetworkUsageDescription` — obrigatório desde iOS 14 para qualquer
  app que rode um servidor acessível por outros dispositivos na rede local;
  sem isso o iOS nem deixa a TV conectar (a Apple mostra um alerta de
  permissão de rede local na primeira execução).
- `NSBonjourServices` com `_http._tcp` — o motor HTTP embutido usa Bonjour
  internamente no iOS (GCDWebServer); sem declarar o serviço o alerta de
  permissão às vezes nem aparece.
- `NSAllowsLocalNetworking` já vinha `true` no template — necessário para o
  próprio app falar HTTP (não HTTPS) com a rede local.

## Canal Roku nativo (`roku/`)

Como Roku não é Cast-receiver e depender de um navegador "sideloaded"
de terceiros é frágil (motores JS antigos/instáveis), o projeto inclui
um **canal Roku nativo** em BrightScript/SceneGraph
([roku/](roku/)) que fala HTTP diretamente com `GET /state` — sem
navegador nenhum no meio. **Testado em hardware real** (Roku TV).

### Estrutura
- [roku/manifest](roku/manifest) — metadados do canal. **Suba o
  `build_version` a cada reinstalação** — se o `.zip` for idêntico ao já
  instalado, a Roku recusa reinstalar ("Identical to previous version").
- [roku/source/main.brs](roku/source/main.brs) — entry point.
- [roku/components/MainScene.xml](roku/components/MainScene.xml) /
  `.brs` — UI inteira (timer gigante, indicador de round, barra de
  progresso, overlay "FIM", banner de offline), a tela de configuração
  de IP (4 spinners numéricos + porta fixa `8080`, sem teclado), o cache
  de relógio de parede (ver seção acima), e a lógica de aplicar o estado
  recebido, espelhando `applyState()`/`maybePlayBell()` de
  [src/receiver/receiverHtml.ts](src/receiver/receiverHtml.ts). Tudo
  numa cena só de propósito — ver nota no topo do arquivo sobre por que
  um componente filho separado pra tela de IP não funcionou de forma
  confiável.
- [roku/components/PollTask.xml](roku/components/PollTask.xml) / `.brs`
  — Task SceneGraph que faz o polling em `/state` a cada 300ms numa
  thread própria (obrigatório pra rede em SceneGraph).
- [roku/fonts/BebasNeue-Regular.ttf](roku/fonts/BebasNeue-Regular.ttf)
  — mesma fonte do app/receptor HTML, embutida de verdade (`uri="pkg:/
  fonts/..."` nos nós `Font`) — fontes sem `uri` real viravam "tofu"
  (quadrados vazios) em teste real.
- [roku/audio/bell_start.wav](roku/audio/bell_start.wav) (início de
  round), [roku/audio/bell_end.mp3](roku/audio/bell_end.mp3) (fim de
  round/luta — som de sino de boxe de verdade, achado pelo usuário) e
  [roku/audio/tick.wav](roku/audio/tick.wav) (aviso aos 10s). Trocar
  qualquer um desses arquivos e reempacotar é suficiente pra mudar o som.

### Kit de depuração remota (sem precisar de controle físico nem tela)
- **Console de debug ao vivo** (`print`/erros do BrightScript):
  `telnet <ip-roku> 8085`
- **Simular controle remoto** (sem autenticação):
  `curl -d '' http://<ip-roku>:8060/keypress/<Tecla>` (`Up`, `Down`,
  `Left`, `Right`, `Select`, `Back`, `Info`...)
- **Ver canal ativo**: `curl http://<ip-roku>:8060/query/active-app`

### Instalar (sideload, 100% rede local)
1. Habilite o Developer Mode na Roku: no controle físico, **Home×3,
   Cima×2, Direita, Esquerda, Direita, Esquerda, Direita**. A tela
   mostra o IP da Roku e pede uma senha (usuário fixo `rokudev`).
2. Empacote: `cd roku && zip -r ../fighttimer-roku.zip .`
3. Instale via `curl` (substitui a versão sideloaded anterior):
   ```bash
   curl --user rokudev:<senha> --anyauth -sS \
     -F "mysubmit=Install" -F "archive=@fighttimer-roku.zip" -F "passwd=" \
     http://<ip-da-roku>/plugin_install
   ```
   (ou abra `http://<ip-da-roku>` no navegador e suba o `.zip` pela
   interface do Development Application Installer.)
4. Abra o canal, ajuste os 4 números do IP do celular com as setas e
   aperte OK pra confirmar (porta `8080` já vem fixa).

### Empacotar como Beta App (distribuir sem Developer Mode permanente)
Processo testado e usado de verdade neste projeto — gera um `.pkg`
assinado que vira instalável em **qualquer** Roku via código de acesso,
sem precisar de Developer Mode em cada TV:

1. **Gerar a chave de assinatura** (só na primeira vez — guarde a senha
   gerada, não tem como recuperar depois; uma chave nova não serve pra
   atualizar um pacote já publicado com a chave antiga):
   ```bash
   # telnet <ip-roku> 8080, digite "genkey" e aguarde — devolve
   # "Password: ..." e "DevID: ...". Em bash puro, sem telnet instalado:
   exec 3<>/dev/tcp/<ip-roku>/8080
   echo -e "genkey\r" >&3
   cat <&3
   ```
2. **Empacotar** (com o canal já sideloaded/rodando na Roku):
   ```bash
   PKG_TIME=$(($(date +%s) * 1000))
   curl --user rokudev:<senha-dev> --digest -sS \
     -F "mysubmit=Package" \
     -F "app_name=Fight Timer TV/1.0" \
     -F "passwd=<senha-da-chave-do-genkey>" \
     -F "pkg_time=$PKG_TIME" \
     http://<ip-roku>/plugin_package
   ```
   A resposta é um JSON com `"pkgPath": "pkgs/P....pkg"`.
3. **Baixar o `.pkg`**:
   ```bash
   curl --user rokudev:<senha-dev> --digest -sS \
     -o fighttimer-roku.pkg \
     "http://<ip-roku>/<pkgPath-da-resposta-acima>"
   ```
4. Crie uma conta gratuita em [developer.roku.com](https://developer.roku.com),
   vá em **Manage My Channels → Add a new channel** (fluxo **Beta**), e
   suba o `.pkg`. Isso gera um **código de acesso** que qualquer Roku
   instala via **Streaming Channels → "Add Channel with a code"** — sem
   Developer Mode, sem digitar IP/senha por TV. Válido por até 120 dias
   (renovável).

## Confiabilidade em segundo plano

**Pode minimizar o app durante a luta** — testado em dispositivo real.
O tempo é sempre derivado de relógio de parede (`Date.now()`), não de um
contador que só anda enquanto o JS está rodando (ver seção "Relógio de
parede" acima), então mesmo com o celular minimizado por um tempo, o
cronômetro volta certo sozinho e a TV/Roku (que guardam cache próprio)
continuam contando por conta própria enquanto isso.

Como reforço extra (Android), o app também sobe um **foreground service**
nativo (`TimerForegroundService.kt`) enquanto uma luta está rodando —
mantém o processo com prioridade alta, ajudando o servidor HTTP a
responder mais rápido em segundo plano. Se ele falhar por algum motivo
num aparelho específico, o app mostra o erro na tela (não falha
silenciosamente) e continua funcionando normalmente mesmo assim, já que
o relógio de parede não depende dele pra estar correto. `useKeepAwake`
continua impedindo a tela de apagar sozinha, como camada adicional.

No iOS ainda não existe foreground service equivalente (nem foi
testado em dispositivo até agora), mas o relógio de parede sozinho já
cobre a maior parte do problema.

## Testando na TV

### Roku (TV ou Streaming Stick — mesma plataforma)
Use o **canal nativo** em [roku/](roku/) — não precisa de navegador
nenhum. Ver seção "Canal Roku nativo" acima para instalar (sideload) ou
distribuir via Beta App. Um navegador de terceiros da Channel Store
(alternativa que existia antes do canal nativo) continua tecnicamente
possível, mas não é mais o caminho recomendado — motores JS antigos e
instáveis eram justamente o motivo de termos construído o canal nativo.

### Android TV / Google TV
Abra o Chrome (ou o navegador padrão), aponte para a mesma URL. Você também
pode escanear o QR code se o navegador tiver acesso à câmera de um controle
com câmera, ou digitar manualmente.

### Samsung (Tizen) / LG (webOS)
Ambas têm um app de navegador nativo ("Internet"). Abra e digite a URL do
celular. Como essas TVs normalmente são mais recentes, o navegador tende a
lidar bem com `fetch` e CSS moderno.

### Fire TV
Instale o navegador "Silk" (ou "Firefox") pela Amazon Appstore e aponte para
a mesma URL. **Não confundir com Roku Streaming Stick** — Fire TV é
plataforma da Amazon (Fire OS/Android), diferente do Roku OS; o canal
nativo em `roku/` não se aplica aqui, só o caminho de navegador acima.

## Ícone do app (Android)

Substituído o robozinho verde padrão do template RN por um ícone
customizado (cronômetro amarelo em fundo preto), gerado com Python/Pillow
em `android/app/src/main/res/mipmap-*/ic_launcher*.png`. Importante: o
fundo precisa preencher o quadrado inteiro **sem transparência/padding**
— alguns launchers (confirmado num Samsung One UI) desenham um quadrado
branco atrás de ícones com bordas transparentes.

## Build iOS via EAS Build (sem precisar de Mac)

Como este ambiente de desenvolvimento é Linux (Xcode só roda em macOS),
o projeto está configurado pra buildar iOS **na nuvem** via
[EAS Build](https://docs.expo.dev/build/introduction/) — funciona com
projetos RN CLI puro ("bare"), não precisa migrar pra Expo.

- `eas.json` — perfis de build (`preview` gera build de distribuição
  interna, instalável direto num iPhone sem passar pela App Store).
- `app.json` → `extra.eas.projectId` — projeto já vinculado
  (`npx eas-cli init`), conta Expo `andrepfdev` associada.

**Passo que só o usuário pode fazer** (autenticação com Apple ID exige
2FA interativo, não dá pra automatizar): rodar
```bash
npx eas-cli build --platform ios --profile preview
```
Isso pede login da conta Apple (e, se você tiver conta paga de
desenvolvedor Apple — US$99/ano —, registra automaticamente o iPhone de
teste). Sem conta paga, só gera build pra simulador. Depois da primeira
vez, as credenciais ficam salvas nos servidores da Expo e builds futuros
não devem pedir interação de novo.

## Troubleshooting

- **TV não conecta / timeout**: celular e TV precisam estar na **mesma rede
  Wi-Fi** (mesmo SSID). Redes de convidado ("Guest") costumam ter *client
  isolation* ativado, que bloqueia dispositivo-a-dispositivo — nesse caso
  use a rede principal.
- **iOS pediu permissão de rede local e eu neguei sem querer**: vá em
  Ajustes → Privacidade e Segurança → Rede Local e reative para o app.
- **Firewall do roteador**: alguns roteadores com "AP isolation" bloqueiam
  tráfego entre dispositivos Wi-Fi mesmo na mesma rede — sintoma idêntico ao
  de rede de convidado.
