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

##  Configure API Key

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

# Architecture & Data Flow

```mermaid
flowchart LR
  A[User clicks Start] --> B{Sidepanel UI}
  B -->|chrome.runtime.sendMessage| C[Background Service Worker]
  C -->|chrome.tabCapture.capture| D[Tab Audio Stream]
  D -->|MediaRecorder 3s chunks| E[30s Segment Buffer]
  E -->|3s overlap retained| F[Blob -> Base64]
  F -->|Retry w/ backoff| G[Transcription API (Gemini 1.5 Flash)]
  G -->|Text transcript| C
  C -->|chrome.runtime.sendMessage| B
  B -->|Render & auto-scroll| H[Transcript List]
  B -->|Export| I[(.txt / .json)]
```

**Key Decisions**
- **MV3 Service Worker** to avoid blocking UI; does chunking and API calls.
- **3-second overlap**: retains the final 3s chunk each window to minimize word boundary loss.
- **Retry**: up to 3 attempts with exponential backoff.
- **Storage**: local key storage via `chrome.storage.local`.
- **Optional Backend**: proxy keeps API key server-side (production-friendly).

**Channels / Labeling (extensible)**
- Current build focuses on tab audio, Microphone and multi-tab capture added by extending capture routing and labeling logic.
