package com.mikerosoft.threadbear.kit

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest

class SchedulesTest {
    private val now = Instant.parse("2026-11-25T12:00:00Z")

    private fun s(id: String, title: String = id, paused: Boolean = false, next: String? = null, finished: String? = null) =
        PhoneSchedule(id, "r", title, "go", "daily", paused, 0, next?.let(Instant::parse), finished?.let(Instant::parse))

    @Test fun groupsAsTheWebsiteDoes() {
        val sections = ScheduleSections.build(listOf(
            s("later", next = "2026-11-27T00:00:00Z"), s("never"), s("soon", next = "2026-11-25T13:00:00Z"),
            s("p2", "beta", paused = true), s("p1", "Alpha", paused = true),
            s("old", finished = "2026-11-01T00:00:00Z"), s("new", paused = true, finished = "2026-11-20T00:00:00Z"),
        ))
        assertEquals(listOf("soon", "later", "never"), sections.active.map { it.id })
        assertEquals(listOf("p1", "p2"), sections.paused.map { it.id })
        assertEquals(listOf("new", "old"), sections.done.map { it.id })
    }

    @Test fun saysWhenItRuns() {
        val until = { text: String -> ScheduleSections.until(Instant.parse(text), now) }
        assertEquals("due", until("2026-11-25T12:00:00Z"))
        assertEquals("in <1m", until("2026-11-25T12:00:30Z"))
        assertEquals("in 59m", until("2026-11-25T12:59:59Z"))
        assertEquals("in 23h", until("2026-11-26T11:59:00Z"))
        assertEquals("in 2d", until("2026-11-27T13:00:00Z"))
        assertEquals("", ScheduleSections.until(null, now))
    }

    @Test fun readsRowsAndAsksItsRunner() = runTest {
        val t = FakeTransport()
        t.subscriptions = { _, _ -> listOf(
            """[{"id":"s1","runnerId":"r","title":"Report","text":"Sum up","whenText":"Every day at 9:00","paused":false,"runs":3,"nextRunAt":"2026-11-26T00:00:00Z","lastRun":{"at":"2026-11-25T00:00:00Z","outcome":"ok","threadId":"t1"}},{"id":"bad"}]""",
        ) }
        val b = PhoneBackend(t, "tok")
        val row = b.schedules().first().single()
        assertEquals("phone:schedules", t.calls.last().first)
        assertEquals("t1", row.lastRun?.threadId)
        assertNull(row.finishedAt)
        assertEquals(ScheduleAction.PAUSE, row.toggle)
        assertEquals(ScheduleAction.RESUME, row.copy(paused = true).toggle)
        t.mutations = { _, _ -> "\"c1\"" }
        assertEquals("c1", b.schedule("s1", ScheduleAction.RUN))
        assertEquals("phone:schedule", t.calls.last().first)
        assertEquals("\"run\"", t.calls.last().second["action"].toString())
        assertEquals("\"s1\"", t.calls.last().second["scheduleId"].toString())
    }
}
