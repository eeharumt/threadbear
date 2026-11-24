package com.mikerosoft.threadbear.kit

import java.time.Instant
import kotlinx.serialization.json.JsonObject

/**
 * One model an account offers (backend API 20), as the Mac's model picker
 * lists it: `id` is what a new thread sends.
 */
data class PhoneModelChoice(
    val id: String,
    val title: String,
    val effortLevels: List<String>? = null,
    val defaultEffort: String? = null,
) {
    companion object {
        fun read(o: JsonObject) = PhoneModelChoice(
            id = o.needStr("id"),
            title = o.needStr("title"),
            effortLevels = o.strings("effortLevels"),
            defaultEffort = o.str("defaultEffort"),
        )
    }
}

/**
 * A row of phone:accounts: a login on one of the runners. Only what the
 * new thread pickers need; the rest of the row is left alone.
 */
data class PhoneAccount(
    val id: String,
    val runnerId: String? = null,
    val provider: String,
    val title: String,
    val models: List<PhoneModelChoice> = emptyList(),
    val email: String? = null,
) {
    companion object {
        fun read(o: JsonObject): PhoneAccount {
            val id = o.needStr("id")
            return PhoneAccount(
                id = id,
                runnerId = o.str("runnerId"),
                provider = o.str("provider") ?: "claude",
                title = o.str("title") ?: id,
                // A backend before API 20 has no models: no pickers, not a broken row.
                models = o.arr("models")?.lossy { PhoneModelChoice.read(it as JsonObject) } ?: emptyList(),
                email = o.str("email"),
            )
        }
    }
}

/**
 * What a new thread from the phone can name. Null is the runner's usual.
 * A login keeps the thread on it; without one the runner picks a login with
 * room (runner.ts, pickForNew).
 */
data class NewThreadSettings(val model: String? = null, val effort: String? = null, val accountId: String? = null)

/** An agent a new thread can start on: one login on the chosen runner, as the website's Agent menu lists it. */
data class AgentChoice(
    val id: String,
    val label: String,
    val provider: String,
    val email: String?,
    val models: List<PhoneModelChoice>,
)

/**
 * What's picked. [runnerId] is the runner its login is on, as a login's id
 * only means something there; null before a runner is known.
 */
data class ThreadPick(
    val runnerId: String? = null,
    val accountId: String? = null,
    val modelId: String? = null,
    val effort: String? = null,
)

/** A pick as it stands on one runner, with the efforts it can have. */
data class ResolvedPick(val agent: AgentChoice?, val efforts: List<String>, val pick: ThreadPick)

/** An agent's models: those with a plain id, then the rest by the part of their id before the first slash. */
data class ModelGroups(val plain: List<PhoneModelChoice>, val groups: List<Pair<String, List<PhoneModelChoice>>>)

/**
 * The new thread screen's runner, agent, model and effort pickers, from the
 * mirrored runners and accounts. The agent picker is the website's
 * (web/src/new-thread-choices.ts); the iPhone has none yet.
 */
object NewThreadChoices {
    /**
     * Where a new thread starts unless Mike picks another: the first runner
     * online of those he's placed in his order (phone:runners lists them in
     * it), or else the main Mac, to wait for. A runner he hasn't placed is
     * never picked for him, so a Mac with a runner key only gets his words
     * when he's said so. Null with neither, which leaves it to the backend
     * (phone:create's own choice). Draining ones are passed over.
     */
    fun runner(runners: List<PhoneRunner>, now: Instant): PhoneRunner? =
        runners.firstOrNull { it.placed == true && it.isOnline(now) && it.draining != true }
            ?: runners.firstOrNull { it.main == true }

    /**
     * The agents on one runner: its own logins (a row with no runner is
     * anyone's), Claude's and Codex's first. None while the runner isn't
     * known or its logins haven't come up yet.
     */
    fun agents(accounts: List<PhoneAccount>, runnerId: String?): List<AgentChoice> {
        if (runnerId == null) return emptyList()
        val here = accounts.filter { it.runnerId == null || it.runnerId == runnerId }
        return here
            .map { AgentChoice(it.id, agentLabel(it, here), it.provider, it.email?.trim()?.lowercase()?.ifEmpty { null }, it.models) }
            .sortedWith(compareBy<AgentChoice>({ a -> PROVIDER_ORDER.indexOf(a.provider).let { if (it < 0) PROVIDER_ORDER.size else it } }, { it.label.lowercase() }))
    }

    /** The agent's name, with its login only when several share that name. */
    private fun agentLabel(account: PhoneAccount, accounts: List<PhoneAccount>): String {
        val name = PROVIDER_NAMES[account.provider] ?: return account.title
        val peers = accounts.filter { it.provider == account.provider }
        if (peers.size == 1) return name
        if (account.title == name) return "$name · ${account.id}"
        // A Codex title already starts with its name (runner/src/accounts.ts, codexTitle).
        val login = if (account.title.startsWith("$name · ")) account.title else "$name · ${account.title}"
        return if (peers.any { it.id != account.id && it.title == account.title }) "$login (${account.id})" else login
    }

    fun modelGroups(models: List<PhoneModelChoice>): ModelGroups {
        val (plain, slashed) = models.partition { it.id.indexOf('/') <= 0 }
        return ModelGroups(plain, slashed.groupBy { it.id.substringBefore('/') }.toList())
    }

    /**
     * A pick made on one runner, as it stands on [runnerId]: what that
     * runner doesn't offer goes. Moved to another runner, the agent stays
     * only where exactly one login there is the same one (provider and
     * email), and never becomes someone else's.
     */
    fun resolve(accounts: List<PhoneAccount>, runnerId: String?, pick: ThreadPick): ResolvedPick {
        val agents = agents(accounts, runnerId)
        val moved = pick.runnerId != null && pick.runnerId != runnerId
        val agent = if (moved) sameLogin(agents, agents(accounts, pick.runnerId).firstOrNull { it.id == pick.accountId })
            else agents.firstOrNull { it.id == pick.accountId }
        val model = agent?.models?.firstOrNull { it.id == pick.modelId }
        val efforts = when {
            model != null -> model.effortLevels.orEmpty().filter { it in TITLES }
            agents.any { it.models.isNotEmpty() } -> DEFAULT_LEVELS
            else -> emptyList()
        }
        val lost = pick.accountId != null && agent == null
        return ResolvedPick(agent, efforts, ThreadPick(runnerId, agent?.id, model?.id, pick.effort?.takeIf { !lost && it in efforts }))
    }

    private fun sameLogin(agents: List<AgentChoice>, previous: AgentChoice?): AgentChoice? {
        if (previous?.email == null || previous.provider.isEmpty()) return null
        return agents.singleOrNull { it.provider == previous.provider && it.email == previous.email }
    }

    fun effortTitle(level: String): String =
        TITLES[level] ?: level.replaceFirstChar { it.uppercase() }

    /**
     * "Mac offline since 10:42" when no runner has checked in for three
     * minutes (AppModel.offlineText). Things done meanwhile wait until it's back.
     */
    fun offlineText(runners: List<PhoneRunner>, now: Instant): String? {
        if (runners.isEmpty() || runners.any { it.isOnline(now) }) return null
        val newest = runners.maxBy { it.lastSeenAt }
        val name = if (runners.size == 1) "Mac" else newest.name
        return "$name offline since ${RelativeTime.clock(newest.lastSeenAt, now)}"
    }

    /** With a runner picked, whether that one's asleep. */
    fun offlineText(runner: PhoneRunner, now: Instant): String? =
        if (runner.isOnline(now)) null else "${runner.name} offline since ${RelativeTime.clock(runner.lastSeenAt, now)}"

    private val PROVIDER_ORDER = listOf("claude", "codex")
    // As runner/src/providers.ts names them.
    private val PROVIDER_NAMES = mapOf(
        "claude" to "Claude", "codex" to "Codex", "cursor" to "Cursor", "opencode" to "OpenCode", "grok" to "Grok", "antigravity" to "Gemini",
    )
    private val DEFAULT_LEVELS = listOf("low", "medium", "high", "xhigh", "max")
    private val TITLES = mapOf(
        "low" to "Low", "medium" to "Medium", "high" to "High", "xhigh" to "Extra high", "max" to "Max", "ultra" to "Ultra",
    )
}
