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
-manifest.json: MV3 manifest; permissions; sidepanel entry; service worker.
-service-worker.js: Opens sidepanel; can help orchestrate background tasks.
-sidepanel.html / sidepanel.css: UI layout and styles.
-sidepanel.js: Capture manager, chunking, provider calls, retries, exports.
-icons
  -icon16.png
  -icon16.png
  -icon16.png


manifest.json — MV3 manifest; permissions; sidepanel entry; service worker.

service-worker.js — Opens sidepanel; can help orchestrate background tasks.

sidepanel.html / sidepanel.css — UI layout and styles.

sidepanel.js — Capture manager, chunking, provider calls, retries, exports.

## 🚀 Quick Start

### 1)  You can use the Google Project.zip from the releases:
Download it from here.

### 2) Load the Extension Locally
1. Open **chrome://extensions** in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and choose the \extension folder.

> On first run, click the extension icon in the toolbar to open the **Side Panel**.

### 3) Enter API Key
- In the side panel, paste your **Google API Key** and click **Save Key**.
- The key is stored in `chrome.storage.local` only on your device.

### 4) Record & Transcribe
1. Click **Refresh** under **Audible Tabs** and select the tabs you want.
2. (Optional) Check **Include Microphone**.
3. Click **Start Recording**.
4. Watch transcripts appear every ~30 seconds.
5. Use **Copy**, **Download .txt**, or **Download .json** to export.

---

## 🧩 How It Works

- **Capture:** Uses `chrome.tabCapture.capture` to get audio from chosen tabs; `getUserMedia` for mic.
- **Chunking:** Creates a new `MediaRecorder` segment every **30s**, each recording **33s** (3s overlap).
- **Transcribe:** Sends Base64 audio to Gemini endpoint:
