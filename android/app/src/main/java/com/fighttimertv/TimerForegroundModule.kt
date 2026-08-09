package com.fighttimertv

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
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
 * Melhoria de confiabilidade, não essencial: mesmo se o serviço falhar
 * em algum aparelho, o app continua funcionando normalmente (o modelo de
 * relógio de parede em src/server/timerServer.ts já garante o tempo
 * certo independente de o processo ficar suspenso). start()/stop()
 * retornam Promise só pra poder mostrar o erro real na tela se algo
 * falhar, em vez de engolir silenciosamente.
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
        try {
            val context = reactApplicationContext
            val intent = Intent(context, TimerForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            // Dá um tempo pro serviço tentar startForeground() antes de
            // resolver — se falhar, ele reporta via reportServiceError()
            // e capturamos aqui.
            Handler(Looper.getMainLooper()).postDelayed({
                val err = consumeServiceError()
                if (err != null) {
                    promise.reject("foreground_start_failed", err)
                } else {
                    promise.resolve(null)
                }
            }, 800)
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
