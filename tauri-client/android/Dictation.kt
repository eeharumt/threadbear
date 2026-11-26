package io.github.eeharumt.threadbear.tauri

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * Dictation for the page (phone/src/dictation.ts), as the native app's
 * Dictation.kt: the phone's own SpeechRecognizer, on the device where it has
 * the model (Android 12+), else the system's, asked to stay offline where it
 * can. A WebView has no speech recognition of its own.
 *
 * The page calls start() and stop() on window.threadbearDictation and hears
 * back through a "threadbear-dictation" event, whose detail is
 * { kind: "words", said, final }, { kind: "end" } once the mic is off, or
 * { kind: "problem", text }. Android ends a session at each pause, so while
 * the mic's on each one that ends starts the next; the page keeps what
 * the ones before said.
 */
class Dictation(private val activity: WryActivity, private val webView: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    /** The on-device recognizer wouldn't start (no language pack, say): the system's from here on. */
    private var onDeviceBroken = false

    @JavascriptInterface
    fun start() {
        main.post { begin() }
    }

    @JavascriptInterface
    fun stop() {
        main.post {
            if (!listening) return@post
            listening = false
            // Its last words come as results; if none do, the mic's off anyway.
            recognizer?.stopListening()
            main.postDelayed({ if (!listening) finish() }, 3000)
        }
    }

    private fun begin() {
        if (listening) return
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            listen()
            return
        }
        activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO)) { granted ->
            if (granted == true) listen() else problem("Allow the microphone in the app's settings to dictate.")
        }
    }

    private fun listen() {
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            problem("This phone has no speech recognition.")
            return
        }
        listening = true
        session()
    }

    private fun session() {
        recognizer?.destroy()
        val onDevice = !onDeviceBroken && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)
        val r = if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(activity) else SpeechRecognizer.createSpeechRecognizer(activity)
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onPartialResults(results: Bundle) = words(results, false)
            override fun onResults(results: Bundle) {
                words(results, true)
                if (listening) session() else finish()
            }
            override fun onError(error: Int) {
                when {
                    onDevice && (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) -> {
                        onDeviceBroken = true
                        if (listening) session() else finish()
                    }
                    // A pause with nothing said: carry on listening.
                    error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> if (listening) session() else finish()
                    error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> problem("Allow the microphone in the app's settings to dictate.")
                    error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> problem("Dictation needs the network on this phone.")
                    else -> if (listening) problem("Dictation stopped.") else finish()
                }
            }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        r.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true),
        )
    }

    private fun words(results: Bundle, final: Boolean) {
        val said = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
        emit(JSONObject().put("kind", "words").put("said", said).put("final", final))
    }

    private fun problem(text: String) {
        listening = false
        finish()
        emit(JSONObject().put("kind", "problem").put("text", text))
    }

    /** Once per session: Stop's timeout and the last results can both get here. */
    private fun finish() {
        val r = recognizer ?: return
        r.destroy()
        recognizer = null
        emit(JSONObject().put("kind", "end"))
    }

    private fun emit(detail: JSONObject) {
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('threadbear-dictation',{detail:$detail}))", null)
    }
}
