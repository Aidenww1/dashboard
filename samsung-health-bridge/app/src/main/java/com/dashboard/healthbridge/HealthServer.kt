package com.dashboard.healthbridge

import kotlinx.coroutines.runBlocking
import java.net.InetAddress
import java.net.ServerSocket

class HealthServer(private val reader: HealthReader) {
    private var serverSocket: ServerSocket? = null
    private var thread: Thread? = null

    fun start() {
        // The web dashboard reaches this bridge from the same device. Keeping the
        // listener on loopback prevents health data from being exposed to the LAN.
        serverSocket = ServerSocket(8765, 50, InetAddress.getLoopbackAddress())
        thread = Thread {
            while (!Thread.currentThread().isInterrupted) {
                try {
                    val socket = serverSocket?.accept() ?: break
                    Thread { handleClient(socket) }.start()
                } catch (_: Exception) {
                    break
                }
            }
        }.also { it.isDaemon = true; it.start() }
    }

    fun stop() {
        thread?.interrupt()
        serverSocket?.close()
    }

    private fun handleClient(socket: java.net.Socket) {
        try {
            val reader2 = socket.getInputStream().bufferedReader()
            val requestLine = reader2.readLine() ?: return
            val parts = requestLine.split(" ")
            val method = parts.getOrNull(0) ?: "GET"
            val path = parts.getOrNull(1) ?: "/"
            while (reader2.readLine()?.isNotEmpty() == true) {}

            val (statusCode, body) = if (method == "OPTIONS") {
                "200 OK" to ""
            } else when (path) {
                "/ping" -> "200 OK" to """{"status":"ok","app":"health-bridge"}"""
                "/data" -> {
                    val json = runBlocking {
                        try { reader.readAll().toString() }
                        catch (e: Exception) { """{"error":"${e.message?.replace("\"", "'")}"}""" }
                    }
                    "200 OK" to json
                }
                else -> "404 Not Found" to """{"error":"not found"}"""
            }

            val bodyBytes = body.toByteArray()
            val response = buildString {
                append("HTTP/1.1 $statusCode\r\n")
                append("Content-Type: application/json\r\n")
                append("Access-Control-Allow-Origin: *\r\n")
                append("Access-Control-Allow-Methods: GET, OPTIONS\r\n")
                append("Access-Control-Allow-Headers: Content-Type\r\n")
                append("Content-Length: ${bodyBytes.size}\r\n")
                append("Connection: close\r\n")
                append("\r\n")
            }
            socket.getOutputStream().also {
                it.write(response.toByteArray())
                it.write(bodyBytes)
                it.flush()
            }
        } finally {
            socket.close()
        }
    }
}
