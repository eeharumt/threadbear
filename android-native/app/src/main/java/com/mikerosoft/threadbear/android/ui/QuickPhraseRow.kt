package com.mikerosoft.threadbear.android.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mikerosoft.threadbear.android.ThreadExtras
import com.mikerosoft.threadbear.kit.QuickPhrase
import com.mikerosoft.threadbear.kit.QuickPhrases

/**
 * The phone's quick phrases over the reply box: a tap is `tap`'s to send or
 * add to what's typed, holding one changes it, and the plus adds one.
 */
@Composable
fun QuickPhraseRow(extras: ThreadExtras, tap: (QuickPhrase) -> Unit) {
    val phrases by extras.quickPhrases.collectAsStateWithLifecycle()
    val colors = MaterialTheme.colorScheme
    // The phrase being changed, or phrases.size for a new one.
    var editing by rememberSaveable { mutableStateOf<Int?>(null) }
    // A double tap would send it twice.
    var tappedAt by remember { mutableLongStateOf(0L) }
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        phrases.forEachIndexed { i, phrase ->
            Chip(
                onClickLabel = "Send", onLongClick = { editing = i },
                onClick = {
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (now - tappedAt > 1_000) { tappedAt = now; tap(phrase) }
                },
            ) { Text(phrase.title, Modifier.widthIn(max = 200.dp), style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        if (phrases.size < QuickPhrases.MAX) {
            Chip(onClickLabel = "Add a quick phrase", onClick = { editing = phrases.size }) {
                Icon(Line.Plus, "Add a quick phrase", Modifier.size(15.dp), tint = colors.onSurfaceVariant)
            }
        }
    }
    editing?.let { i ->
        QuickPhraseDialog(
            phrases.getOrNull(i),
            save = { p -> extras.setQuickPhrases(if (i < phrases.size) phrases.toMutableList().also { it[i] = p } else phrases + p); editing = null },
            delete = { extras.setQuickPhrases(phrases.filterIndexed { at, _ -> at != i }); editing = null },
            close = { editing = null },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Chip(onClickLabel: String, onClick: () -> Unit, onLongClick: (() -> Unit)? = null, content: @Composable () -> Unit) {
    Box(
        Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .combinedClickable(onClickLabel = onClickLabel, onLongClickLabel = onLongClick?.let { "Change" }, onLongClick = onLongClick, onClick = onClick)
            .heightIn(min = 36.dp).padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun QuickPhraseDialog(phrase: QuickPhrase?, save: (QuickPhrase) -> Unit, delete: () -> Unit, close: () -> Unit) {
    var title by rememberSaveable { mutableStateOf(phrase?.title.orEmpty()) }
    var text by rememberSaveable { mutableStateOf(phrase?.text.orEmpty()) }
    val made = QuickPhrases.phrase(title, text)
    AlertDialog(
        onDismissRequest = close,
        title = { Text(if (phrase == null) "New quick phrase" else "Quick phrase") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Button") }, singleLine = true)
                OutlinedTextField(text, { text = it }, label = { Text("Message it sends") }, minLines = 2, maxLines = 6)
            }
        },
        confirmButton = { TextButton(onClick = { made?.let(save) }, enabled = made != null) { Text("Save") } },
        dismissButton = {
            Row {
                if (phrase != null) TextButton(onClick = delete) { Text("Delete", color = LocalSignals.current.failed) }
                TextButton(onClick = close) { Text("Cancel") }
            }
        },
    )
}
