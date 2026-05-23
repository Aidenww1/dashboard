package com.dashboard.healthbridge

import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.runBlocking

class HealthServer(private val reader: HealthReader) : NanoHTTPD(8765) {

    override fun serve(session: IHTTPSession): Response {
        val cors = fun(r: Response): Response {
            r.addHeader("Access-Control-Allow-Origin", "*")
            r.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
            r.addHeader("Access-Control-Allow-Headers", "Content-Type")
            return r
        }

        if (session.method == Method.OPTIONS) {
            return cors(newFixedLengthResponse(""))
        }

        return cors(
            when (session.uri) {
                "/ping" -> newFixedLengthResponse(
                    Response.Status.OK, "application/json",
                    """{"status":"ok","app":"health-bridge"}"""
                )
                "/data" -> {
                    val json = runBlocking {
                        try { reader.readAll().toString() }
                        catch (e: Exception) { """{"error":"${e.message?.replace("\"", "'")}"}""" }
                    }
                    newFixedLengthResponse(Response.Status.OK, "application/json", json)
                }
                else -> newFixedLengthResponse(
                    Response.Status.NOT_FOUND, "application/json", """{"error":"not found"}"""
                )
            }
        )
    }
}
