# Smart PPG Health & Vital Monitor (ESP32 Gateway)

A real-time **Digital Signal Processing (DSP) Photoplethysmogram (PPG) & Vital Signs Dashboard** built with React + Vite, designed to interface flexibly with an **ESP32 Gateway** (MAX30102 / MAX30100 / Pulse Sensor) via **WebSocket**, **HTTP REST Polling**, **USB Web Serial**, or **Live Simulation Mode**.

---

## Features

- **Heart Rate Monitor (`BPM`)**: Live BPM readout, animated heartbeat icon synchronized to the current heart rate, and ECG pulse indicator.
- **Blood Oxygen (`SpO2 %`)**: Real-time oxygen saturation percentage with automatic `NORMAL` ($\ge 95\%$), `LOW` ($90\text{–}94\%$), and `CRITICAL` ($< 90\%$) status badges.
- **High-DPI PPG Pulse Waveform (`<canvas>`)**:
  - Automatically renders **raw ADC PPG samples** streamed from the ESP32 with dynamic min/max auto-scaling.
  - Falls back to a physiologically accurate arterial PPG waveform (systolic peak, dicrotic notch, diastolic runoff) scaled to the live Heart Rate when only scalar vitals are sent.
  - Interactive playback controls: **Play (`▶`)**, **Pause (`||`)**, **Speed (`1x` / `2x` / `0.5x`)**, **Time Window (`5s` / `10s` / `2s`)**, and **Fullscreen mode**.
- **DSP Analytics Row**:
  - **Stress Level (HRV)**: 4-segment semi-circular gauge with a dynamically rotating needle driven by `stress` / `hrv` ($0\text{–}100\%$).
  - **Signal Quality (SQI)**: Live percentage and 5-stage glowing cyan signal bar indicator.
  - **Rhythm Status**: Displays cardiac rhythm classification (e.g., `Normal Sinus`, `Tachycardia`, `Bradycardia`, `Arrhythmia`, `No Finger`).
  - **FFT Spectrum**: 18-bin frequency-domain bar chart for PPG harmonic analysis.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Build for production
npm run build
```

---

## Connecting Your ESP32

Click the **`Connected` pill** or the **Gear icon (`⚙`)** in the top-right header of the dashboard to open the **ESP32 Gateway Telemetry Source** panel. You can switch between 4 modes at any time:

1. **Demo / Simulated Stream**: Default mode matching the Figma reference values (`72 BPM`, `98% SpO2`, `94% SQI`, `Normal Sinus`). Includes a **Live Packet Injector** to test custom JSON/CSV payloads directly in the browser.
2. **WebSocket (`ws://`)**: Connects to your ESP32 WebSocket server (default: `ws://192.168.4.1:81`) for low-latency streaming.
3. **HTTP REST Polling (`http://`)**: Polls your ESP32 HTTP endpoint (default: `http://192.168.4.1/vitals`) at a configurable interval (`100ms`–`2000ms`).
4. **USB Web Serial (`115200 baud`)**: Reads `Serial.println()` lines directly from your ESP32 over a USB cable in Chrome or Edge—no Wi-Fi setup required.

---

## Flexible ESP32 Data Formats

The parser in [`src/hooks/useEsp32Telemetry.js`](src/hooks/useEsp32Telemetry.js) automatically recognizes multiple payload formats and key aliases:

### 1. JSON Format (Recommended for WebSocket / HTTP / Serial)
You can send any subset of fields—only the fields you include will be updated:

```json
{
  "hr": 72,
  "spo2": 98,
  "ppg": [2048, 2110, 2290, 2450, 2180, 2090, 2140, 2010],
  "sqi": 94,
  "stress": 32,
  "rhythm": "Normal Sinus",
  "fft": [14, 22, 30, 58, 96, 76, 46, 30, 22, 42, 34, 20, 18, 28, 14, 12, 10, 11],
  "uptime": 9912
}
```

**Supported JSON Key Aliases:**
| Metric | Accepted Keys |
| :--- | :--- |
| **Heart Rate** | `hr`, `heartRate`, `bpm`, `heart_rate` |
| **SpO2** | `spo2`, `SpO2`, `oxygen`, `saturation` |
| **PPG Waveform** | `ppg`, `waveform`, `ir`, `raw`, `samples`, `adc` (single number or array) |
| **Stress / HRV** | `stress`, `stressLevel`, `hrv`, `rmssd` (`0`–`100`) |
| **Signal Quality** | `sqi`, `SQI`, `signalQuality`, `quality` (`0`–`100`) |
| **Rhythm Status** | `rhythm`, `rhythmStatus`, `status` |
| **FFT Spectrum** | `fft`, `fftSpectrum`, `spectrum`, `fft_bins` (array of numbers) |
| **Uptime** | `uptime`, `uptimeSeconds`, `millis` |

### 2. Key-Value Serial Format
```text
HR:72,SPO2:98,PPG:2145,SQI:94,STRESS:32
```

### 3. Plain CSV Serial Format (`hr,spo2,ppg,sqi,stress`)
```text
72,98,2145,94,32
```

---

## Example ESP32 Arduino Sketch (USB Serial + JSON)

```cpp
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
}

void loop() {
  int hr = 72;
  int spo2 = 98;
  int sqi = 94;
  int stress = 32;
  int rawPpg = analogRead(34); // Or MAX30102 particleSensor.getIR()

  // Send JSON line over Serial (or WebSocket.broadcastTXT)
  Serial.printf(
    "{\"hr\":%d,\"spo2\":%d,\"ppg\":%d,\"sqi\":%d,\"stress\":%d,\"rhythm\":\"Normal Sinus\"}\n",
    hr, spo2, rawPpg, sqi, stress
  );

  delay(40); // ~25 Hz update rate
}
```

---

## Project Structure

```text
DSP OEL/
├── index.html                      # Entry HTML & Inter font loader
├── package.json                    # Dependencies & Vite scripts
├── README.md                       # Documentation & ESP32 integration guide
└── src/
    ├── main.jsx                    # React root mount
    ├── index.css                   # Global dark theme & layout reset
    ├── App.css                     # Dashboard cards, neon glows, & responsive grid
    ├── App.jsx                     # Main PPG Health & Vital Monitor UI
    └── hooks/
        └── useEsp32Telemetry.js    # Flexible ESP32 parser (WS / HTTP / Serial / Demo)
```
