# Contexto: foreground service Android não está funcionando

## App
React Native CLI puro (não Expo), **RN 0.86.2**, **New Architecture
ativada** (`newArchEnabled=true`), **Hermes ativado**. Pacote Android:
`com.fighttimertv`. App: cronômetro que roda um servidor HTTP embutido
(`react-native-http-bridge-refurbished`) na porta 8080 pra uma Smart TV
consumir via polling.

## Problema
Quando o usuário minimiza o app (Home ou troca de app) enquanto um
timer está rodando, o `setInterval` do JS e/ou o servidor HTTP param de
responder — o timer "trava" até o app voltar pro primeiro plano.

## Tentativa de correção: Android Foreground Service
Criei um `Service` Android nativo que deveria manter o processo com
prioridade de foreground enquanto a tela "run" está ativa, via um
módulo React Native (`NativeModules.TimerForeground.start()/stop()`).

**Sintoma atual**: depois de instalar, ao apertar "INICIAR":
- **Nenhuma notificação aparece** na barra de notificações (esperado:
  "Fight Timer TV — Cronômetro ativo").
- **Nenhum erro aparece na tela do app**, mesmo depois de eu trocar o
  módulo pra retornar uma `Promise` que deveria rejeitar com a mensagem
  de exceção real em caso de falha (ver `TimerForegroundModule.kt`
  abaixo) e o `TimerScreen.tsx` capturar isso e mostrar na tela.
- O app não crasha (crashava antes com `foregroundServiceType`
  `connectedDevice`; troquei pra `specialUse` e parou de crashar).

**Hipótese não confirmada**: como nem o erro nem a notificação aparecem
(ausência total de sinal, não uma rejeição capturada), suspeito que
`NativeModules.TimerForeground` esteja `undefined` em tempo de execução
— ou seja, o módulo nem está sendo encontrado pelo bridge, e
`NativeModules.TimerForeground?.start()` (optional chaining) está
silenciosamente virando no-op. Não consegui confirmar isso ainda porque
não tenho acesso a `adb logcat` nesta sessão (o celular de teste não
está conectado por cabo USB a este ambiente, só testo via instalar o
APK manualmente e pedir feedback visual pro usuário).

Só reforça essa hipótese: em RN 0.86 com New Architecture, pode ser que
módulos "legados" (`ReactContextBaseJavaModule` simples, sem spec de
Codegen/TurboModule) precisem de alguma configuração adicional pra
serem expostos em `NativeModules` (interop layer), que pode não estar
acontecendo aqui — não tenho certeza do mecanismo exato nessa versão.

## Arquivos relevantes (conteúdo atual)

### `android/app/src/main/java/com/fighttimertv/MainApplication.kt`
```kotlin
package com.fighttimertv

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(TimerForegroundPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
```

### `android/app/src/main/java/com/fighttimertv/TimerForegroundPackage.kt`
```kotlin
package com.fighttimertv

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class TimerForegroundPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(TimerForegroundModule(reactContext))
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()
}
```

### `android/app/src/main/java/com/fighttimertv/TimerForegroundModule.kt`
```kotlin
package com.fighttimertv

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class TimerForegroundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TimerForeground"

    @ReactMethod
    fun start(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, TimerForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("foreground_service_start_failed", e.message ?: e.toString(), e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            val context = reactApplicationContext
            context.stopService(Intent(context, TimerForegroundService::class.java))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("foreground_service_stop_failed", e.message ?: e.toString(), e)
        }
    }
}
```

### `android/app/src/main/java/com/fighttimertv/TimerForegroundService.kt`
```kotlin
package com.fighttimertv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

class TimerForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "fight_timer_running"
        private const val NOTIFICATION_ID = 1
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            startForeground(NOTIFICATION_ID, buildNotification())
        } catch (e: Exception) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Cronômetro ativo",
                NotificationManager.IMPORTANCE_LOW,
            )
            channel.description = "Mantém o cronômetro rodando e transmitindo pra TV em segundo plano"
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }
        builder
            .setContentTitle("Fight Timer TV")
            .setContentText("Cronômetro ativo — transmitindo para a TV")
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)

        return builder.build()
    }
}
```

### `android/app/src/main/AndroidManifest.xml` (trechos relevantes)
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />

<application ...>
  ...
  <service
    android:name=".TimerForegroundService"
    android:exported="false"
    android:foregroundServiceType="specialUse">
    <property
      android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
      android:value="Mantém o cronômetro e o servidor HTTP local transmitindo para a TV enquanto o app está minimizado" />
  </service>
</application>
```

### `src/screens/TimerScreen.tsx` (trecho relevante)
```tsx
import { NativeModules, Platform, ... } from 'react-native';

// dentro do componente:
useEffect(() => {
  if (Platform.OS !== 'android' || screen !== 'run') return;
  NativeModules.TimerForeground?.start()
    .then(() => setForegroundServiceError(null))
    .catch((err: Error) => setForegroundServiceError(err.message));
  return () => {
    NativeModules.TimerForeground?.stop().catch(() => {});
  };
}, [screen]);
```
E na renderização da tela "run":
```tsx
{foregroundServiceError && (
  <Text style={styles.errorText}>
    Proteção de segundo plano falhou: {foregroundServiceError}
  </Text>
)}
```

## O que já foi tentado
1. `foregroundServiceType="connectedDevice"` → **crashava o app** ao
   apertar "INICIAR" (exceção não tratada, confirmado por sintoma —
   sem logcat também nessa vez, só pelo comportamento "abre e fecha
   sozinho quando clico em iniciar").
2. Trocado pra `foregroundServiceType="specialUse"` + `try/catch` em
   toda parte arriscada + `Promise` no lugar de fire-and-forget pra
   propagar erro real pro JS → **app para de crashar**, mas **nem
   notificação nem erro aparecem** — nenhum sinal de que o código do
   módulo/serviço sequer está sendo executado.

## O que preciso descobrir
- `NativeModules.TimerForeground` está `undefined` no runtime? (Isso
  explicaria ausência total de notificação E de erro, já que
  `undefined?.start()` não faz nada e não lança.)
- Se estiver definido, o `Promise` de fato resolve/rejeita? Alguma
  chance do bridge com New Architecture engolir a Promise/exceção antes
  de chegar no JS?
- Existe algo específico do RN 0.86 + New Architecture (bridgeless
  mode) que exige um passo extra pra um `ReactContextBaseJavaModule`
  "legado" (sem TurboModule spec/Codegen) ser exposto corretamente em
  `NativeModules`?

Sem `adb logcat` disponível neste ambiente (só instalação manual do
APK + feedback visual do usuário) — se conseguir rodar com log
conectado, isso resolveria a dúvida na hora.
