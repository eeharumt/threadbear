package com.mikerosoft.threadbear.kit

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** A button over the reply box: what it's called, and the message it sends. */
data class QuickPhrase(val title: String, val text: String)

/**
 * The phone's own quick phrases, kept on the phone and sent as any message
 * is. Not a folder's patch actions, which stay on the Mac (docs/parity.md).
 */
object QuickPhrases {
    const val MAX = 12
    const val MAX_TITLE = 40
    const val MAX_TEXT = 4000

    /** What the row starts with, until it's first changed. */
    fun defaults(language: String): List<QuickPhrase> =
        if (language == "ja") listOf(
            QuickPhrase("進捗をまとめて", "ここまでの進捗と、次にやることを短くまとめて。"),
            QuickPhrase("続けて", "続けて。"),
            QuickPhrase("Gitの状態", "作業フォルダーのGitの状態(ブランチ、未コミットの変更、最近のコミット)を、何も変更せずに一覧で見せて。"),
        ) else listOf(
            QuickPhrase("Sum up", "Sum up where this is and what's next, briefly."),
            QuickPhrase("Carry on", "Carry on."),
            QuickPhrase("Git status", "List this folder's git status (branch, uncommitted changes, recent commits), changing nothing."),
        )

    /** Saved phrases, or the defaults when none were ever saved. One that can't be read is skipped. */
    fun load(saved: String?, language: String): List<QuickPhrase> {
        val rows = saved?.let { runCatching { parseJson(it).asArray() }.getOrNull() } ?: return defaults(language)
        return rows.lossy { row ->
            val o = row.asObject() ?: throw BadRow("Not an object")
            phrase(o.needStr("title"), o.needStr("text")) ?: throw BadRow("Empty")
        }.take(MAX)
    }

    fun save(phrases: List<QuickPhrase>): String = buildJsonArray {
        for (p in phrases) add(buildJsonObject { put("title", p.title); put("text", p.text) })
    }.toString()

    /** What was typed as a phrase, or null with no message. With no title, it's the message's first line. */
    fun phrase(title: String, text: String): QuickPhrase? {
        val message = text.trim().take(MAX_TEXT)
        if (message.isEmpty()) return null
        val name = title.trim().ifEmpty { message.lineSequence().first().trim() }
        return QuickPhrase(name.replace('\n', ' ').take(MAX_TITLE), message)
    }

    /** The message box after a tap with something already in it: nothing is sent, as it may be half-written. */
    fun added(draft: String, phrase: QuickPhrase): String = draft.trimEnd() + "\n" + phrase.text
}
