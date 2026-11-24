package com.mikerosoft.threadbear.kit

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

class NewThreadChoicesTest {
    @Test fun accountsReadWithAndWithoutModels() {
        val json = """
        [{"id":"claude-3","provider":"claude","title":"three@example.com","usage":{"windows":[],"readAt":"x","source":"live"},
          "models":[{"id":"opus","title":"Opus 5.5","effortLevels":["low","high","max"]}],"defaultEffort":"high"},
         {"id":"codex-main","provider":"codex","title":"Codex · me"},
         {"title":"no id"}]
        """
        val accounts = parseJson(json).lossyList(PhoneAccount::read)
        assertEquals(listOf("claude-3", "codex-main"), accounts.map { it.id })
        assertEquals(listOf(PhoneModelChoice("opus", "Opus 5.5", listOf("low", "high", "max"))), accounts[0].models)
        assertTrue(accounts[1].models.isEmpty())
        // Only the id is needed: the rest falls back.
        val bare = PhoneAccount.read(parseJson("""{"id":"x"}""") as JsonObject)
        assertEquals(PhoneAccount("x", null, "claude", "x"), bare)
    }

    // The website's own cases (web/src/new-thread-choices.test.ts).
    private val opus = PhoneModelChoice("opus", "Opus", listOf("high"))
    private val astra = PhoneModelChoice("astra", "Astra", listOf("low", "ultra", "future"))
    private val sonnet = PhoneModelChoice("claude/region/sonnet", "Sonnet", listOf("medium"))
    private val haiku = PhoneModelChoice("claude/haiku", "Haiku")
    private val auto = PhoneModelChoice("auto", "Auto")
    private val solo = PhoneModelChoice("solo", "Solo")
    private val accounts = listOf(
        PhoneAccount("cx", "two", "codex", "Codex", listOf(astra)),
        PhoneAccount("cc", "one", "claude", "Claude", listOf(opus), "same@example.test"),
        PhoneAccount("cursor", "two", "cursor", "Cursor", listOf(auto)),
        PhoneAccount("cc", "two", "claude", "Claude", listOf(opus, sonnet, haiku), "same@example.test"),
        PhoneAccount("alt", "two", "claude", "Other Claude", listOf(opus)),
        PhoneAccount("legacy", "two", "", "legacy"),
        PhoneAccount("plain", "two", "claude", "Plain only", listOf(solo)),
    )
    private val claudeLevels = listOf("low", "medium", "high", "xhigh", "max")

    @Test fun agentsFollowTheRunnerAndIncludeThoseWithoutModels() {
        assertEquals(
            listOf(
                Triple("cc", "Claude · cc", listOf("opus", "claude/region/sonnet", "claude/haiku")),
                Triple("alt", "Claude · Other Claude", listOf("opus")),
                Triple("plain", "Claude · Plain only", listOf("solo")),
                Triple("cx", "Codex", listOf("astra")),
                Triple("cursor", "Cursor", listOf("auto")),
                Triple("legacy", "legacy", emptyList()),
            ),
            NewThreadChoices.agents(accounts, "two").map { a -> Triple(a.id, a.label, a.models.map { it.id }) },
        )
        // A runner with no logins mirrored yet offers none, rather than another Mac's.
        assertTrue(NewThreadChoices.agents(accounts, "missing").isEmpty())
        assertTrue(NewThreadChoices.agents(accounts, null).isEmpty())
        // A row with no runner is anyone's.
        val anyones = listOf(PhoneAccount("claude-1", null, "claude", "me", listOf(opus)))
        assertEquals(listOf("claude-1"), NewThreadChoices.agents(anyones, "two").map { it.id })
    }

    @Test fun agentsAreNamedForTheirProviderWithTheLoginOnlyWhenSeveralShareIt() {
        fun row(id: String, provider: String, title: String, runner: String = "one") = PhoneAccount(id, runner, provider, title)
        fun labels(vararg rows: PhoneAccount) = NewThreadChoices.agents(rows.toList(), "one").map { it.label }
        assertEquals(
            listOf("Claude", "Codex", "Cursor", "Future agent", "OpenCode"),
            labels(
                row("cc", "claude", "me@example.test"), row("cx", "codex", "Codex · me@example.test"), row("cu", "cursor", "me@example.test"),
                row("oc", "opencode", "OpenCode account"), row("new", "future", "Future agent"), row("elsewhere", "claude", "other@example.test", "two"),
            ),
        )
        assertEquals(
            listOf("Claude · a@example.test", "Claude · b@example.test", "Codex · x@example.test", "Codex · y@example.test"),
            labels(
                row("a", "claude", "a@example.test"), row("b", "claude", "b@example.test"),
                row("x", "codex", "Codex · x@example.test"), row("y", "codex", "Codex · y@example.test"),
            ),
        )
        assertEquals(
            listOf("Claude · same@example.test (main)", "Claude · same@example.test (spare)"),
            labels(row("main", "claude", "same@example.test"), row("spare", "claude", "same@example.test")),
        )
    }

    @Test fun modelsAreTheChosenAgentsOwn() {
        fun picked(model: String) = NewThreadChoices.resolve(accounts, "two", ThreadPick("two", "cc", model)).pick.modelId
        assertEquals("opus", picked("opus"))
        assertNull(picked("astra"))
    }

    @Test fun slashedModelsGroupByWhatsBeforeTheFirstSlash() {
        assertEquals(ModelGroups(listOf(opus), listOf("claude" to listOf(sonnet, haiku))), NewThreadChoices.modelGroups(listOf(opus, sonnet, haiku)))
        assertEquals(ModelGroups(listOf(solo), emptyList()), NewThreadChoices.modelGroups(listOf(solo)))
        assertEquals(listOf("claude", "strata"), NewThreadChoices.modelGroups(listOf(sonnet, PhoneModelChoice("strata/flash", "Flash"))).groups.map { it.first })
    }

    @Test fun aModelKeepsOnlyTheEffortsItSupports() {
        val codex = NewThreadChoices.resolve(accounts, "two", ThreadPick("two", "cx", "astra", "ultra"))
        assertEquals(listOf("low", "ultra"), codex.efforts)
        assertEquals(ThreadPick("two", "cx", "astra", "ultra"), codex.pick)
        val cursor = NewThreadChoices.resolve(accounts, "two", ThreadPick("two", "cursor", "auto", "ultra"))
        assertTrue(cursor.efforts.isEmpty())
        assertEquals(ThreadPick("two", "cursor", "auto"), cursor.pick)
        // No agent or no model picked: Claude's levels, without Ultra.
        assertEquals(claudeLevels, NewThreadChoices.resolve(accounts, "two", ThreadPick("two")).efforts)
        assertEquals(ThreadPick("two"), NewThreadChoices.resolve(accounts, "two", ThreadPick("two", effort = "ultra")).pick)
        assertEquals(ThreadPick("two", effort = "high"), NewThreadChoices.resolve(accounts, "two", ThreadPick("two", effort = "high")).pick)
        assertEquals(ThreadPick("two", "cc", null, "high"), NewThreadChoices.resolve(accounts, "two", ThreadPick("two", "cc", null, "high")).pick)
        assertEquals("Extra high", NewThreadChoices.effortTitle("xhigh"))
        assertEquals("Turbo", NewThreadChoices.effortTitle("turbo"))
    }

    @Test fun changingRunnerKeepsTheSameLoginAndDropsAModelItDoesntHave() {
        assertEquals(ThreadPick("two", "cc", "opus", "high"), NewThreadChoices.resolve(accounts, "two", ThreadPick("one", "cc", "opus", "high")).pick)
        assertEquals(ThreadPick("one", "cc", null, "medium"), NewThreadChoices.resolve(accounts, "one", ThreadPick("two", "cc", sonnet.id, "medium")).pick)
        val renamed = accounts.map { if (it.id == "cc" && it.runnerId == "two") it.copy(id = "cc-2") else it }
        assertEquals("cc-2", NewThreadChoices.resolve(renamed, "two", ThreadPick("one", "cc", "opus", "high")).pick.accountId)
    }

    @Test fun changingRunnerNeverMovesAPickToAnotherLogin() {
        val cleared = ThreadPick("one")
        assertEquals(cleared, NewThreadChoices.resolve(accounts, "one", ThreadPick("two", "alt", "opus", "high")).pick)
        assertEquals(ThreadPick("two"), NewThreadChoices.resolve(accounts, "two", cleared).pick)
        val replaced = accounts.map { if (it.runnerId == "one") it.copy(email = "different@example.test") else it }
        assertEquals(cleared, NewThreadChoices.resolve(replaced, "one", ThreadPick("two", "cc", "opus", "high")).pick)
        val ambiguous = accounts + accounts[1].copy(id = "other")
        assertEquals(cleared, NewThreadChoices.resolve(ambiguous, "one", ThreadPick("two", "cc", "opus", "high")).pick)
    }

    @Test fun aLoginThatsGoneTakesItsModelAndEffortWithIt() {
        assertEquals(ThreadPick("two"), NewThreadChoices.resolve(accounts, "two", ThreadPick("two", "nope", "opus", "high")).pick)
        assertEquals(ResolvedPick(null, emptyList(), ThreadPick("two")), NewThreadChoices.resolve(emptyList(), "two", ThreadPick("two", "cc", "opus", "high")))
    }

    private val now: Instant = Instant.ofEpochSecond(1_000_000)
    private fun runner(id: String, name: String, secondsAgo: Long = 0, draining: Boolean? = null, placed: Boolean? = null, main: Boolean? = null) =
        PhoneRunner(id, name, lastSeenAt = now.minusSeconds(secondsAgo), draining = draining, placed = placed, main = main)

    /**
     * The Mac asleep on 6 Nov left the phone with nowhere to start a thread:
     * the picker starts on the first runner online in Mike's order.
     */
    @Test fun runnerIsTheFirstOnlineInOrder() {
        val asleep = runner("laptop", "Laptop", secondsAgo = 600, placed = true, main = true)
        val draining = runner("build-box", "Build box", draining = true, placed = true)
        val mini = runner("mac-mini", "Mac mini", placed = true)
        assertEquals("mac-mini", NewThreadChoices.runner(listOf(asleep, draining, mini), now)?.runnerId)
        assertEquals("mac-mini", NewThreadChoices.runner(listOf(mini, asleep), now)?.runnerId)
        // None online: the main Mac, to wait for.
        assertEquals("laptop", NewThreadChoices.runner(listOf(asleep, draining), now)?.runnerId)
        assertNull(NewThreadChoices.runner(emptyList(), now))
    }

    /**
     * A Mac with a runner key only gets Mike's words when he's put it in his
     * order (Codex's review): with no order, the main Mac, asleep or not.
     */
    @Test fun anUnplacedRunnerIsNeverPickedForHim() {
        val asleep = runner("laptop", "Laptop", secondsAgo = 600, main = true)
        val mini = runner("mac-mini", "Mac mini")
        assertEquals("laptop", NewThreadChoices.runner(listOf(mini, asleep), now)?.runnerId)
        // No main Mac known: nothing picked, so the backend decides.
        assertNull(NewThreadChoices.runner(listOf(mini, runner("laptop", "Laptop")), now))
    }

    @Test fun offlineSpeaksUpOnlyWhenEveryRunnerIs() {
        val zone = java.time.ZoneId.systemDefault()
        val clock = RelativeTime.clock(now.minusSeconds(600), now, zone)
        assertNull(NewThreadChoices.offlineText(emptyList(), now))
        assertEquals("Mac offline since $clock", NewThreadChoices.offlineText(listOf(runner("laptop", "Laptop", 600)), now))
        assertEquals("Mac mini offline since $clock", NewThreadChoices.offlineText(listOf(runner("laptop", "Laptop", 900), runner("mac-mini", "Mac mini", 600)), now))
        assertNull(NewThreadChoices.offlineText(listOf(runner("laptop", "Laptop", 900), runner("mac-mini", "Mac mini")), now))
        assertEquals("Laptop offline since $clock", NewThreadChoices.offlineText(runner("laptop", "Laptop", 600), now))
        assertNull(NewThreadChoices.offlineText(runner("laptop", "Laptop"), now))
    }
}

class ProviderInfoTest {
    @Test fun builtInsAndStrangers() {
        Providers.reset()
        assertEquals("Claude Code", Providers.info("claude").cliName)
        assertEquals("claude", Providers.info("").id)
        assertEquals("codex", Providers.info("codex").effort)
        // Never heard of: its id for a name, and nothing it might not have.
        val odd = Providers.info("gemini")
        assertEquals("Gemini", odd.name)
        assertEquals("none", odd.effort)
        assertFalse(odd.rewind)
        assertNull(Providers.known("gemini"))
    }

    @Test fun aRunnerSaysWhatItsProvidersAre() {
        Providers.reset()
        val told = (parseJson("""[{"id":"gemini","name":"Gemini","effort":"claude","rewind":true,"sandbox":"yes"},{"name":"no id"}]""") as JsonArray)
            .lossy { ProviderInfo.read(it as JsonObject) }
        assertEquals(1, told.size)
        // A wrong type reads as absent.
        assertFalse(told[0].sandbox)
        assertEquals("gemini", told[0].cliName)
        Providers.update(told)
        assertEquals("claude", Providers.info("gemini").effort)
        assertTrue(Providers.info("gemini").rewind)
        Providers.reset()
    }
}
