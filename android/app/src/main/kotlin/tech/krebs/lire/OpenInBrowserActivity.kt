package tech.krebs.lire

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle

// Receives lire-open://open?url=<link>&browser=<package> from the page and opens the link in that
// browser as a plain tab. Without the browser, or with an unknown one, the system default takes it.
class OpenInBrowserActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val data = intent.data
        val url = data?.getQueryParameter("url")
        if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
            open(Uri.parse(url), data.getQueryParameter("browser"))
        }
        finish()
    }

    private fun open(url: Uri, browser: String?) {
        val view = Intent(Intent.ACTION_VIEW, url)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (browser != null && tryStart(Intent(view).setPackage(browser))) return
        tryStart(view)
    }

    private fun tryStart(intent: Intent): Boolean =
        try {
            startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
}
