package com.mikerosoft.threadbear.kit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class QuickPhrasesTest {
    @Test
    fun `starts with the phone's language and keeps what was saved`() {
        assertEquals("続けて", QuickPhrases.load(null, "ja")[1].title)
        assertEquals("Carry on", QuickPhrases.load(null, "en")[1].title)
        val mine = listOf(QuickPhrase("\"引用\"", "1行目\n2行目"))
        assertEquals(mine, QuickPhrases.load(QuickPhrases.save(mine), "ja"))
    }

    @Test
    fun `all removed stays empty, and something unreadable goes back to the defaults`() {
        assertEquals(emptyList(), QuickPhrases.load(QuickPhrases.save(emptyList()), "ja"))
        assertEquals(QuickPhrases.defaults("ja"), QuickPhrases.load("{oops", "ja"))
        assertEquals(listOf(QuickPhrase("a", "b")), QuickPhrases.load("""[{"title":"a","text":"b"},{"title":"x"},3,{"title":"y","text":" "}]""", "ja"))
    }

    @Test
    fun `a phrase needs a message, and is named by its first line without a title`() {
        assertNull(QuickPhrases.phrase("Title", "  \n "))
        assertEquals(QuickPhrase("Check it", "Check it\nthen stop"), QuickPhrases.phrase(" ", " Check it\nthen stop "))
        assertTrue(QuickPhrases.phrase("x".repeat(90), "y")!!.title.length == QuickPhrases.MAX_TITLE)
    }

    @Test
    fun `goes after what's already typed`() {
        assertEquals("half\nCarry on.", QuickPhrases.added("half \n", QuickPhrase("Carry on", "Carry on.")))
    }
}
