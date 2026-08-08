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
   `{ seconds, totalTime, running, paused, phase, currentRound, totalRounds, soundOn, formatted }`,
   onde `phase` é `idle | round | rest | done`.
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
  (placeholder do template RN, controlado no `build.gradle`). Como o servidor
  é HTTP puro (sem HTTPS — não faz sentido gerar certificado para um IP local
  dinâmico), **confirme que esse placeholder resolve para `true`** também em
  builds de release, senão o Android bloqueia a conexão da TV.

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

## Testando na TV

### Roku (Streaming Stick)
A Roku não tem navegador nativo, mas dá pra instalar um pela Channel Store:
1. Na Roku, vá em **Streaming Channels → Search Channels** e procure por um
   navegador (ex.: o canal "Web Browser" ou o que você mencionou como
   "Cast"/similares — a disponibilidade varia por região).
2. Abra o navegador instalado e digite manualmente a URL mostrada no app
   (ex.: `http://192.168.0.42:8080`) — a maioria desses navegadores de Roku
   não lê QR code pela câmera da TV, então a URL de texto é o caminho mais
   confiável.
3. Deixe a página aberta em tela cheia; ela vai reconectar sozinha (mensagem
   "Sem conexão com o celular") se o app fechar e reabrir.

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
a mesma URL.

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
