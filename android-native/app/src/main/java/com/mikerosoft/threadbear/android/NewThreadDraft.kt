package com.mikerosoft.threadbear.android

import com.mikerosoft.threadbear.kit.ThreadPick

/** What the new thread screen had in it when Start was tapped, for trying again if it fails (ShellModel.retryStarting). */
class NewThreadDraft(
    /** The words, photos' chips as marks. */
    val text: String,
    val photos: List<PickedPhoto>,
    /** Null when the backend picks (only one runner). */
    val runnerId: String? = null,
    val pick: ThreadPick = ThreadPick(),
)
