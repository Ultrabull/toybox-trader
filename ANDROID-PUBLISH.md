# Building & publishing the Android app — from your phone

No computer needed. GitHub builds the app in the cloud; you drive it from the
GitHub app or website on your phone.

## A. Test the app on your phone now (no setup, no fees)

Easiest way — tap-to-install from a Release:

1. In your phone browser, open **github.com** → your repo → **Actions** tab.
2. Choose **"Build Android app"** → **Run workflow** → run it on `main`.
3. Wait ~5–10 min for the green check.
4. Go to the repo's **Releases** (right-hand side / repo home) → open
   **"Toybox Trader — latest Android test build"**.
5. Tap **`toybox-trader-test.apk`** → it downloads → tap it to install.
   (Android will ask you to allow installing from this source — normal for a
   test build.)

That's the real native app running on your phone. 🎉 Every time you re-run the
build, that same Release updates with the newest APK.

> Tip: the GitHub **mobile app** is handy for watching the build and getting a
> notification when it finishes, but use the **browser** for "Run workflow" and
> for downloading the APK.

## B. Publish to the Google Play Store (when ready)

You need a **Google Play Developer account** (one-time **$25**, sign up in a phone
browser at play.google.com/console) and the signing secrets added to GitHub.

### One-time: add the signing secrets
GitHub app/site → your repo → **Settings → Secrets and variables → Actions →
New repository secret**. Add these four (values were provided to you separately —
keep them private):

| Secret name | What it is |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 text of your upload keystore |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Once these exist, every build also produces a **signed release bundle**.

### Each release
1. **Actions → Build Android app → Run workflow.**
2. Download the **`toybox-release-aab`** artifact → `app-release.aab`.
3. In the **Play Console**, create the app (first time), then **Production →
   Create release → upload the .aab**, fill in the store listing, and submit.
4. Enable **Play App Signing** when prompted (recommended) — Google manages the
   final signing key; your uploaded keystore is just the "upload key."

### Bumping the version for each update
Edit `android/app/build.gradle`: increase `versionCode` (whole number, must go up
every upload) and set a new `versionName` (e.g. "1.1"). Then run the build again.
(Ask me and I'll bump these for you.)

## Notes
- **Keep your keystore safe.** If you lose the upload key you can ask Google to
  reset it (with Play App Signing), but back it up anyway.
- **Native push** inside the store app is a later add-on (needs Firebase) — see
  `CAPACITOR.md`.
- The first cloud build is the real test of this setup; if a step fails, open the
  run log, copy the red error, and send it to me — I'll fix the workflow.
