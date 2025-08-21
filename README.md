# Chrome-Extension-Real-Time-Audio-Transcription
A Chrome extension that captures audio from the current tab, streams/transcribes in 30‑second chunks (with a 3‑second overlap), and displays live results in a Side Panel. Includes multi‑tab capture, channel labeling (Tab vs Mic), offline buffering, and robust UX/error handling.

---

## ✨ Features

- Capture audio from **audible tabs** and optionally **microphone** at the same time.
- Rolling **30s segments with 3s overlap** to avoid word loss between chunks.
- **Live tab add/remove** while recording — toggle checkboxes to start/stop channels.
- **Status & timer** UI; **Copy / Download (.txt & .json)** exports.
- Resilient **retry queue** for transient network issues (e.g., brief disconnects).
- Uses **Google Gemini (gemini-1.5-flash-latest)** via the Generative Language API.

---

## 🧱 Project Architecture
### -/extension
- manifest.json: MV3 manifest; permissions; sidepanel entry; service worker.
- service-worker.js: Opens sidepanel; can help orchestrate background tasks.
- sidepanel.html / sidepanel.css: UI layout and styles.
- sidepanel.js: Capture manager, chunking, provider calls, retries, exports.
- icons
  - icon16.png
  - icon48.png
  - icon128.png
- eslintrc.json / eslintignore / package.json: ESLint config (code quality)

###  Configure API Key

1. Open the extension side panel in Chrome.
2. Enter your *Google Gemini API key* in the input box.
3. Click *Save Key*. (Stored securely in chrome.storage.local).

---

## 🖥️ Installation (Local Testing)

1. Open chrome://extensions/ in Chrome.
2. Enable *Developer mode* (top right).
3. Click *Load unpacked*.
4. Select the project folder containing manifest.json.
5. Click the extension icon in the toolbar → *Side Panel opens*.
6. Enter your API key → *Start Recording*.

---

## 🧪 Usage

1. Open a tab with audio (YouTube / Meet).
2. Open *TwinMind Transcriber* side panel.
3. Choose audible tab(s), enable mic if needed.
4. Click *Start Recording*.

   * Transcript updates every *30s*.
   * Queue + retry works if offline.
   * Multiple tabs are supported.
5. Stop recording → *Export transcript*.

## Demo Video

