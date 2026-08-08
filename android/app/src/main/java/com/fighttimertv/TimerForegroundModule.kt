package com.fighttimertv

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Ponte JS -> Android pro TimerForegroundService. Chamado de
 * TimerScreen.tsx via `NativeModules.TimerForeground.start()/stop()`
 * enquanto a tela "run" está ativa (ver useEffect correspondente lá).
 */
class TimerForegroundModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TimerForeground"

    @ReactMethod
    fun start() {
        // Melhoria de confiabilidade, não essencial — nunca pode derrubar
        // o app (já aconteceu de verdade numa primeira versão).
        try {
            val context = reactApplicationContext
            val intent = Intent(context, TimerForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            // Ignora: o app continua funcionando normalmente, só sem a
            // proteção extra de foreground service nesse aparelho.
        }
    }

    @ReactMethod
    fun stop() {
        try {
            val context = reactApplicationContext
            context.stopService(Intent(context, TimerForegroundService::class.java))
        } catch (e: Exception) {
            // Ignora, mesmo motivo do start().
        }
    }
}
