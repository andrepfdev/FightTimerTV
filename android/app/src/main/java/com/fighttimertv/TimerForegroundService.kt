package com.fighttimertv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Serviço de foreground puro (sem lógica própria — o cronômetro e o
 * servidor HTTP continuam vivendo inteiramente no JS/TimerScreen.tsx).
 * A única função dele é dar ao processo prioridade de "foreground" pro
 * Android enquanto uma luta está rodando, pra não ser suspenso/limitado
 * quando o usuário minimiza o app de propósito — problema real
 * confirmado em teste: sem isso, o tick do timer e o servidor HTTP
 * embutido perdem sincronia assim que o app sai de primeiro plano.
 *
 * Ligado/desligado por TimerForegroundModule.start()/stop(), chamado do
 * TimerScreen.tsx enquanto screen === 'run' (ver TimerScreen.tsx).
 */
class TimerForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "fight_timer_running"
        private const val NOTIFICATION_ID = 1
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Isso é uma melhoria de confiabilidade, não algo essencial pro
        // app funcionar — nunca pode derrubar o app inteiro. Já
        // aconteceu de verdade (tipo "connectedDevice" lançava exceção
        // não tratada em Android 14+ e fechava o app ao apertar
        // "INICIAR"); com "specialUse" isso não deveria mais acontecer,
        // mas o try/catch fica como rede de segurança permanente.
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
