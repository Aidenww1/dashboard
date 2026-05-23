package com.dashboard.healthbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class HealthService : Service() {
    private lateinit var server: HealthServer

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Health Bridge")
            .setContentText("Serving health data on port 8765")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true)
            .build()
        startForeground(1, notification)

        server = HealthServer(HealthReader(this))
        server.start()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::server.isInitialized) server.stop()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "Health Bridge", NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "health_bridge"
    }
}
