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
        val context = reactApplicationContext
        val intent = Intent(context, TimerForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    @ReactMethod
    fun stop() {
        val context = reactApplicationContext
        context.stopService(Intent(context, TimerForegroundService::class.java))
    }
}
