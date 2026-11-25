package com.mikerosoft.threadbear.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mikerosoft.threadbear.android.LocalModel
import com.mikerosoft.threadbear.android.LocalSnackbar
import com.mikerosoft.threadbear.kit.CommandKey
import com.mikerosoft.threadbear.kit.PendingCommand
import com.mikerosoft.threadbear.kit.PhoneSchedule
import com.mikerosoft.threadbear.kit.RelativeTime
import com.mikerosoft.threadbear.kit.ScheduleAction
import com.mikerosoft.threadbear.kit.ScheduleSections
import java.time.Instant

/**
 * Every runner's schedules, as the website's Scheduled page: tap one for its
 * message and last run, to pause or resume it, or to run it now.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchedulesScreen(back: () -> Unit, openThread: (String) -> Unit) {
    val model = LocalModel.current
    val rows by model.schedules.collectAsStateWithLifecycle()
    val now = rememberNow(15_000)
    var opened by rememberSaveable { mutableStateOf<String?>(null) }
    var doneOpen by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        snackbarHost = { SnackbarHost(LocalSnackbar.current) },
        topBar = {
            TopAppBar(
                navigationIcon = { IconButton(onClick = back) { Icon(Line.Back, "Back", Modifier.size(22.dp)) } },
                title = { Text("Schedules") },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { inner ->
        val sections = rows?.let { ScheduleSections.build(it) }
        when {
            sections == null -> Box(Modifier.padding(inner).fillMaxWidth()) {
                LinearProgressIndicator(Modifier.fillMaxWidth().height(1.dp), color = MaterialTheme.colorScheme.outline)
            }
            sections.isEmpty -> Column(
                Modifier.padding(inner).fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
            ) {
                Icon(Line.Clock, null, Modifier.size(40.dp), tint = LocalSignals.current.faint)
                Spacer(Modifier.height(12.dp))
                Text("Nothing scheduled", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                Text("Ask a thread to do something later.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(Modifier.padding(inner).fillMaxSize()) {
                val list = { items: List<PhoneSchedule>, right: (PhoneSchedule) -> String ->
                    items(items, key = { it.id }) { s ->
                        ScheduleRow(s, right(s), s.id == opened, now, openThread) { opened = if (opened == s.id) null else s.id }
                    }
                }
                if (sections.active.isNotEmpty()) {
                    item(key = "#active") { Heading("Active", sections.active.size) }
                    list(sections.active) { ScheduleSections.until(it.nextRunAt, now) }
                }
                if (sections.paused.isNotEmpty()) {
                    item(key = "#paused") { Heading("Paused", sections.paused.size) }
                    list(sections.paused) { "Paused" }
                }
                if (sections.done.isNotEmpty()) {
                    item(key = "#done") { Heading("Done", sections.done.size, doneOpen) { doneOpen = !doneOpen } }
                    if (doneOpen) list(sections.done) { s -> s.finishedAt?.let { RelativeTime.short(it, now) }.orEmpty() }
                }
            }
        }
    }
}

@Composable
private fun Heading(title: String, count: Int, open: Boolean = true, toggle: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().then(if (toggle != null) Modifier.clickable(onClickLabel = if (open) "Fold" else "Show", onClick = toggle) else Modifier)
            .heightIn(min = 48.dp).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("$title · $count", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        if (toggle != null) Icon(if (open) Line.ChevronDown else Line.ChevronRight, null, Modifier.size(16.dp), tint = LocalSignals.current.faint)
    }
}

@Composable
private fun ScheduleRow(s: PhoneSchedule, right: String, open: Boolean, now: Instant, openThread: (String) -> Unit, toggle: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 2.dp).clip(RoundedCornerShape(14.dp))
            .background(if (open) colors.surfaceContainer else colors.background),
    ) {
        Row(Modifier.fillMaxWidth().clickable(onClick = toggle).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(s.title, style = MaterialTheme.typography.bodyLarge, maxLines = if (open) 4 else 1, overflow = TextOverflow.Ellipsis)
                Text(s.whenText, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(12.dp))
            Text(right, style = MaterialTheme.typography.labelLarge, color = colors.onSurfaceVariant)
        }
        if (open) ScheduleDetail(s, now, openThread)
    }
}

@Composable
private fun ScheduleDetail(s: PhoneSchedule, now: Instant, openThread: (String) -> Unit) {
    val model = LocalModel.current
    val colors = MaterialTheme.colorScheme
    val runners by model.runners.collectAsStateWithLifecycle()
    val pending by model.commands.entries.collectAsStateWithLifecycle()
    val entry = pending[CommandKey.Schedule(s.id)]
    val state = entry?.state ?: PendingCommand.Idle
    Column(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (s.text.isNotBlank()) Text(s.text, style = MaterialTheme.typography.bodyMedium, maxLines = 12, overflow = TextOverflow.Ellipsis)
        val facts = listOfNotNull(
            s.nextRunAt?.takeIf { s.finishedAt == null && !s.paused }?.let { "Next ${RelativeTime.clock(it, now)}" },
            s.lastRun?.let { "Last ${RelativeTime.clock(it.at, now)}" + (it.note?.let { n -> ", $n" } ?: "") },
            "Runs ${s.runs}",
            runners.firstOrNull { it.runnerId == s.runnerId }?.name ?: s.runnerId,
        )
        Text(facts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        if (s.finishedAt == null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (action in listOf(s.toggle, ScheduleAction.RUN)) {
                OutlinedButton(onClick = { model.schedule(s.id, action) }, enabled = !state.locked) {
                    if (state.locked && entry?.value == action.wire) {
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(when (action) { ScheduleAction.PAUSE -> "Pause"; ScheduleAction.RESUME -> "Resume"; ScheduleAction.RUN -> "Run now" })
                }
            }
        }
        state.timedOutNote?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = LocalSignals.current.failed) }
        val thread = s.threadId ?: s.lastRun?.threadId
        if (thread != null) TextButton(onClick = { openThread(thread) }) { Text(if (s.threadId != null) "Open its thread" else "Open the last run") }
    }
}
