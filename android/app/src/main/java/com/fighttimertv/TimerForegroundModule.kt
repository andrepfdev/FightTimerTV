package com.fighttimertv

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Ponte JS -> Android pro TimerForegroundService. Chamado de
 * TimerScreen.tsx via `NativeModules.TimerForeground.start()/stop()`
 * enquanto a tela "run" está ativa (ver useEffect correspondente lá).
 *
 * start()/stop() retornam Promise (em vez de "fire and forget") só pra
 * conseguir mostrar o erro de verdade na tela do app quando algo falha —
 * uma primeira versão com try/catch mudo escondeu um erro real (o
 * serviço falhava silenciosamente, sem notificação nenhuma) e isso
 * custou um ciclo de depuração inteiro sem conseguir ver o motivo.
 */
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
            // Não derruba o app (o app continua funcionando normalmente,
            // só sem a proteção extra de foreground service), mas o erro
            // de verdade chega até o JS pra poder ser mostrado na tela.
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
