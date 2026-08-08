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

## Estado atual / próximos passos

- Código escrito e `npx tsc --noEmit` passa sem erros.
- **Ainda não testado em dispositivo físico** — próximo passo é rodar
  `npx react-native run-android` num Android real na mesma rede Wi-Fi,
  validar `GET /state` via `curl` de outro dispositivo na rede, depois
  abrir a URL num navegador de desktop antes de partir para a Roku (ver
  seção "Testando na TV" do README).
- Usuário ainda não comprou o Roku Streaming Stick — quando comprar,
  testar o navegador disponível na Channel Store dele especificamente
  (varia por região/modelo).

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
