package com.dashboard.healthbridge

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

class HealthReader(context: Context) {
    private val client = HealthConnectClient.getOrCreate(context)

    suspend fun readAll(): JSONObject {
        val now = Instant.now()
        val range30 = TimeRangeFilter.between(now.minus(30, ChronoUnit.DAYS), now)
        val range7 = TimeRangeFilter.between(now.minus(7, ChronoUnit.DAYS), now)
        return JSONObject().apply {
            try { put("steps", readSteps(range30)) } catch (_: Exception) {}
            try { put("heartRate", readHeartRate(range7)) } catch (_: Exception) {}
            try { put("sleep", readSleep(range30)) } catch (_: Exception) {}
            try { put("calories", readCalories(range30)) } catch (_: Exception) {}
            try { put("weight", readWeight(range30)) } catch (_: Exception) {}
            try { put("oxygenSat", readOxygenSat(range7)) } catch (_: Exception) {}
            try { put("exercises", readExercises(range30)) } catch (_: Exception) {}
            put("syncTime", now.toEpochMilli())
        }
    }

    private suspend fun readSteps(range: TimeRangeFilter): JSONArray {
        val zone = ZoneId.systemDefault()
        val byDay = mutableMapOf<String, Long>()
        client.readRecords(ReadRecordsRequest(StepsRecord::class, range)).records.forEach { r ->
            val date = r.startTime.atZone(zone).toLocalDate().toString()
            byDay[date] = (byDay[date] ?: 0L) + r.count
        }
        return JSONArray().also { arr ->
            byDay.entries.sortedBy { it.key }.forEach { (date, count) ->
                arr.put(JSONObject().put("date", date).put("steps", count))
            }
        }
    }

    private suspend fun readHeartRate(range: TimeRangeFilter): JSONArray {
        return JSONArray().also { arr ->
            client.readRecords(ReadRecordsRequest(HeartRateRecord::class, range)).records.forEach { r ->
                r.samples.forEach { s ->
                    arr.put(JSONObject().put("time", s.time.toEpochMilli()).put("bpm", s.beatsPerMinute))
                }
            }
        }
    }

    private suspend fun readSleep(range: TimeRangeFilter): JSONArray {
        return JSONArray().also { arr ->
            client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range)).records.forEach { r ->
                val hours = (r.endTime.toEpochMilli() - r.startTime.toEpochMilli()) / 3_600_000.0
                arr.put(
                    JSONObject()
                        .put("start", r.startTime.toEpochMilli())
                        .put("end", r.endTime.toEpochMilli())
                        .put("hours", Math.round(hours * 10) / 10.0)
                )
            }
        }
    }

    private suspend fun readCalories(range: TimeRangeFilter): JSONArray {
        val zone = ZoneId.systemDefault()
        val byDay = mutableMapOf<String, Double>()
        client.readRecords(ReadRecordsRequest(TotalCaloriesBurnedRecord::class, range)).records.forEach { r ->
            val date = r.startTime.atZone(zone).toLocalDate().toString()
            byDay[date] = (byDay[date] ?: 0.0) + r.energy.inKilocalories
        }
        return JSONArray().also { arr ->
            byDay.entries.sortedBy { it.key }.forEach { (date, kcal) ->
                arr.put(JSONObject().put("date", date).put("kcal", Math.round(kcal)))
            }
        }
    }

    private suspend fun readWeight(range: TimeRangeFilter): JSONArray {
        return JSONArray().also { arr ->
            client.readRecords(ReadRecordsRequest(WeightRecord::class, range)).records.forEach { r ->
                arr.put(JSONObject().put("time", r.time.toEpochMilli()).put("kg", r.weight.inKilograms))
            }
        }
    }

    private suspend fun readOxygenSat(range: TimeRangeFilter): JSONArray {
        return JSONArray().also { arr ->
            client.readRecords(ReadRecordsRequest(OxygenSaturationRecord::class, range)).records.forEach { r ->
                arr.put(JSONObject().put("time", r.time.toEpochMilli()).put("pct", r.percentage.value))
            }
        }
    }

    private suspend fun readExercises(range: TimeRangeFilter): JSONArray {
        return JSONArray().also { arr ->
            client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records.forEach { r ->
                val durMin = (r.endTime.toEpochMilli() - r.startTime.toEpochMilli()) / 60_000
                arr.put(
                    JSONObject()
                        .put("start", r.startTime.toEpochMilli())
                        .put("type", r.exerciseType)
                        .put("title", r.title ?: "")
                        .put("durationMin", durMin)
                )
            }
        }
    }
}
