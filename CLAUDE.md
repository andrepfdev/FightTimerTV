# Fight Timer TV — contexto do projeto

Cronômetro em React Native (CLI puro, TypeScript) que transmite o tempo em
tempo real para uma Smart TV via **servidor HTTP embutido no próprio
celular** (sem Google Cast, sem WebSocket, sem login, sem persistência).
Ver [README.md](README.md) para a explicação funcional e o guia de teste
por TV — este arquivo é sobre **decisões e histórico**, para não perder
contexto entre sessões.

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
                                  original), IP local + QR code
src/screens/timerEngine.ts     — advancePhase() extraído como função pura
                                  testável (ver src/screens/timerEngine.test.ts)
src/server/timerServer.ts      — servidor HTTP embutido (porta 8080),
                                  GET / (página da TV) e GET /state (JSON:
                                  seconds/totalTime/phase/currentRound/…)
src/receiver/receiverHtml.ts   — HTML/CSS/JS estático servido para a TV:
                                  layout + sino (Web Audio) copiados quase
                                  1:1 do index.html original, dirigidos por
                                  polling em /state a cada 300ms
src/receiver/bebasNeueFont.ts  — fonte Bebas Neue embutida em base64
                                  (copiada de ct-timer/fonts/)
android/…, ios/…               — permissões já configuradas (ver README.md)
roku/                          — canal Roku nativo (BrightScript/SceneGraph),
                                  ver 7ª decisão abaixo e a seção "Canal Roku
                                  nativo" do README.md
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
opção confiável. Ver seção "Canal Roku nativo" do README.md para
estrutura, instalação (sideload/dev mode) e o caminho de distribuição
"final" via Beta App do Roku Developer Dashboard, sem depender de
Developer Mode permanente nas TVs.

Detalhes técnicos que valem registrar: como SceneGraph não tem Web Audio
API, o sino/aviso sonoro do canal Roku são tons sintetizados via
`ffmpeg` (`roku/audio/bell.wav`/`tick.wav`) — não é o mesmo sintetizador
metálico do `receiverHtml.ts`, é um placeholder. E como a Roku não tem
câmera pra ler QR code, o canal pede o `IP:porta` do celular digitado
numa tela própria (`roku/components/IpEntry.*`), salvo em
`roRegistrySection` pra não perguntar de novo — reabre com o botão `*`
do controle.

## Estado atual / próximos passos

- **Testado em Android físico com sucesso**: build release (`assembleRelease`,
  standalone, JS embutido) instalada e rodando; rotação livre
  (`fullSensor`) e o link "reiniciar configuração" durante o run também
  validados nessa sessão.
- iOS: só landscape liberado no `Info.plist`, **nunca testado** em
  dispositivo (usuário só tem Android à mão até agora).
- Canal Roku (`roku/`) está **escrito mas ainda não sideloaded/testado**
  em hardware real — precisa do IP + senha de dev de uma Roku do usuário
  pra eu instalar via `curl` e iterar (ver seção do README). Primeira
  rodada de testes reais é o próximo passo natural.
- Página HTML (`receiverHtml.ts`) pra outras Smart TVs (Samsung, LG,
  Android TV, Fire TV) **nunca foi validada em TV real** ainda — só o
  canal Roku e o app Android foram testados fisicamente até agora.

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
