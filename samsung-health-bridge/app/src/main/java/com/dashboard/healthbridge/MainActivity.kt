package com.dashboard.healthbridge

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    )

    private lateinit var statusText: TextView
    private lateinit var connectBtn: Button

    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        if (granted.containsAll(PERMISSIONS)) {
            startHealthService()
        } else {
            statusText.text = "Some permissions were denied.\nTap Connect and allow all permissions."
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        connectBtn = findViewById(R.id.connectBtn)

        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_UNAVAILABLE -> {
                statusText.text = "Health Connect not installed.\nInstall it from the Play Store."
                connectBtn.isEnabled = false
                return
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                statusText.text = "Health Connect needs an update.\nUpdate it in the Play Store."
                connectBtn.isEnabled = false
                return
            }
        }

        connectBtn.setOnClickListener {
            lifecycleScope.launch {
                val client = HealthConnectClient.getOrCreate(this@MainActivity)
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.containsAll(PERMISSIONS)) {
                    startHealthService()
                } else {
                    requestPermissions.launch(PERMISSIONS)
                }
            }
        }

        // Auto-start if already have all permissions
        lifecycleScope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(this@MainActivity)
                if (client.permissionController.getGrantedPermissions().containsAll(PERMISSIONS)) {
                    startHealthService()
                }
            } catch (_: Exception) {}
        }
    }

    private fun startHealthService() {
        statusText.text = "Server running on port 8765\n\nOpen your dashboard on this phone\nand tap Watch > Sync Now."
        connectBtn.text = "Restart Server"
        startForegroundService(Intent(this, HealthService::class.java))
    }
}
