package com.fighttimertv

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

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
@ReactModule(name = TimerForegroundModule.NAME)
class TimerForegroundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "TimerForeground"
        private var lastServiceError: String? = null

        fun reportServiceError(msg: String) {
            lastServiceError = msg
        }

        fun consumeServiceError(): String? = lastServiceError?.also { lastServiceError = null }
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun start(promise: Promise) {
        Toast.makeText(reactApplicationContext, "⏱ TimerForeground.start() chamado", Toast.LENGTH_SHORT).show()
        try {
            val context = reactApplicationContext
            val intent = Intent(context, TimerForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            Toast.makeText(reactApplicationContext, "⏱ startForegroundService() retornou, aguardando serviço", Toast.LENGTH_SHORT).show()
            // Dar 800ms pro serviço tentar startForeground() antes de resolver.
            // Se startForeground() falhar, o serviço loga o erro via
            // reportServiceError() e chamamos stopSelf() — captamos aqui.
            Handler(Looper.getMainLooper()).postDelayed({
                val err = consumeServiceError()
                if (err != null) {
                    Toast.makeText(reactApplicationContext, "⏱ Serviço falhou: $err", Toast.LENGTH_LONG).show()
                    promise.reject("foreground_start_failed", err)
                } else {
                    Toast.makeText(reactApplicationContext, "⏱ Serviço OK", Toast.LENGTH_SHORT).show()
                    promise.resolve(null)
                }
            }, 800)
        } catch (e: Exception) {
            Toast.makeText(reactApplicationContext, "⏱ ERRO no start: ${e.message}", Toast.LENGTH_LONG).show()
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
