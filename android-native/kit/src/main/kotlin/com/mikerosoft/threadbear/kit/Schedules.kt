package com.mikerosoft.threadbear.kit

import java.time.Duration
import java.time.Instant
import kotlinx.serialization.json.JsonObject

/** A row of phone:schedules: a message an agent or Mike set to go later, once or on a cron. */
data class PhoneSchedule(
    val id: String,
    val runnerId: String,
    val title: String,
    val text: String,
    val whenText: String,
    val paused: Boolean,
    val runs: Int,
    val nextRunAt: Instant? = null,
    val finishedAt: Instant? = null,
    /** The thread it messages, or null for a new one each time. */
    val threadId: String? = null,
    val cwd: String? = null,
    val lastRun: LastRun? = null,
) {
    data class LastRun(val at: Instant, val threadId: String?, val note: String?)

    /** What its first button does. */
    val toggle: ScheduleAction get() = if (paused) ScheduleAction.RESUME else ScheduleAction.PAUSE

    companion object {
        fun read(o: JsonObject) = PhoneSchedule(
            id = o.needStr("id"),
            runnerId = o.needStr("runnerId"),
            title = o.needStr("title"),
            text = o.str("text").orEmpty(),
            whenText = o.str("whenText").orEmpty(),
            paused = o.needBool("paused"),
            runs = o.num("runs")?.wholeCount() ?: 0,
            nextRunAt = o.date("nextRunAt"),
            finishedAt = o.date("finishedAt"),
            threadId = o.str("threadId"),
            cwd = o.str("cwd"),
            lastRun = o.obj("lastRun")?.let { r -> r.date("at")?.let { LastRun(it, r.str("threadId"), r.str("note")) } },
        )
    }
}

/** What phone:schedule (backend API 45) can ask of a schedule's runner. */
enum class ScheduleAction(val wire: String) { PAUSE("pause"), RESUME("resume"), RUN("run") }

/**
 * Schedules as the website groups them (web/src/view-logic.ts,
 * scheduleSections): active soonest first, paused by name, done newest first.
 * A one-off that has run is done even if it was paused first.
 */
data class ScheduleSections(val active: List<PhoneSchedule>, val paused: List<PhoneSchedule>, val done: List<PhoneSchedule>) {
    val isEmpty get() = active.isEmpty() && paused.isEmpty() && done.isEmpty()

    companion object {
        fun build(rows: List<PhoneSchedule>): ScheduleSections {
            val byName = compareBy<PhoneSchedule> { it.title.lowercase() }
            val (done, left) = rows.partition { it.finishedAt != null }
            val (paused, active) = left.partition { it.paused }
            return ScheduleSections(
                active.sortedWith(compareBy<PhoneSchedule> { it.nextRunAt ?: Instant.MAX }.then(byName)),
                paused.sortedWith(byName),
                done.sortedByDescending { it.finishedAt },
            )
        }

        /** "in 3h", or "due" once its time has come. */
        fun until(at: Instant?, now: Instant): String {
            if (at == null) return ""
            val left = Duration.between(now, at)
            return when {
                left.isNegative || left.isZero -> "due"
                left.toMinutes() < 1 -> "in <1m"
                left.toHours() < 1 -> "in ${left.toMinutes()}m"
                left.toDays() < 1 -> "in ${left.toHours()}h"
                else -> "in ${left.toDays()}d"
            }
        }
    }
}
