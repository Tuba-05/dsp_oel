# Smart PPG Health & Vital Monitor (ESP32 ZKP Gateway)

An end-to-end **Digital Signal Processing (DSP) Photoplethysmogram (PPG) & Vital Signs Monitoring System** combining:
1. **`ZKP_Gateway/`**: ESP32 + MAX30102 + OLED embedded C firmware (`main.c`) and a Zero-Knowledge Proof (ZKP) Flask API backend (`api/index.py`).
2. **`Dashboard/`**: Interactive React + Vite medical telemetry dashboard that fetches live readings from `ZKP_Gateway/api/index.py` (`/api/get-data`) or directly from the ESP32 over USB Serial / WebSocket, and computes real-time DSP analytics.

---

## Project Structure

```text
DSP OEL/
├── .gitignore                          # Git ignore rules for Node, Python, C/ESP-IDF, and Vercel
├── README.md                           # Project documentation & setup guide
├── ZKP_Gateway/                        # Embedded Firmware & ZKP Cloud/Local Gateway
│   ├── main.c                          # ESP-IDF C firmware (MAX30102 I2C, IIR DC filter, SpO2, OLED)
│   ├── CMakeLists.txt                  # ESP-IDF component build config
│   ├── requirements.txt                # Python dependencies (Flask, requests)
│   ├── vercel.json                     # Vercel serverless deployment configuration
│   └── api/
│       └── index.py                    # Flask ZKP Gateway (/api/register, /api/authenticate, /api/data, /api/get-data)
└── Dashboard/                          # React + Vite Frontend Monitor
    ├── index.html                      # Entry HTML
    ├── package.json                    # Frontend dependencies & scripts
    ├── vite.config.js                  # Port 3000 & /api proxy to http://127.0.0.1:5000
    └── src/
        ├── main.jsx                    # React root mount
        ├── index.css                   # Global dark theme & responsive layout
        ├── App.css                     # Glassmorphic cards, neon glows, & animations
        ├── App.jsx                     # Main PPG Health & Vital Monitor UI
        └── hooks/
            └── useEsp32Telemetry.js    # Live telemetry hook & DSP engine (FFT, SQI, HRV, Rhythm)
```

---

## How the System Works End-to-End

1. **ESP32 Sensor & Firmware (`ZKP_Gateway/main.c`)**:
   - Reads Red and IR LED signals from the **MAX30102** sensor over I2C (`400 Hz`).
   - Applies a first-order IIR DC-removal filter:
     $$y_{\text{DC}}[n] = 0.95\,y_{\text{DC}}[n-1] + 0.05\,x[n], \quad y_{\text{AC}}[n] = x[n] - y_{\text{DC}}[n]$$
   - Detects systolic peaks to compute **Heart Rate (`BPM`)** and calculates **Blood Oxygen (`SpO2 %`)** using the Red/IR AC-to-DC ratio:
     $$\text{SpO}_2 = 104.0 - 16.0 \times \frac{\text{AC}_{\text{Red}} / \text{DC}_{\text{Red}}}{\text{AC}_{\text{IR}} / \text{DC}_{\text{IR}}}$$
2. **ZKP Gateway Backend (`ZKP_Gateway/api/index.py`)**:
   - Authenticates the ESP32 node via Zero-Knowledge Proof endpoints (`/api/register`, `/api/challenge`, `/api/authenticate`).
   - Receives verified health readings at `POST /api/data` (`device_id`, `token`, `hr`, `spo2`).
   - Exposes live sensor state at `GET /api/get-data` with automatic 7-second idle timeout detection (`"Waiting for device..."`, `"Idle - Place Finger on Sensor"`, or `"Live Streaming Active & Secure"`).
3. **React Frontend (`Dashboard/`)**:
   - Polls `/api/get-data` from `index.py` (default) or connects directly via **USB Serial (`115200 baud`)** / **WebSocket**.
   - Displays **real `hr` (`BPM`)** and **real `spo2` (`%`)** from `index.py` and calculates:
     - **PPG Pulse Waveform**: High-DPI `<canvas>` arterial waveform synchronized to the live Heart Rate (or raw ADC samples).
     - **Stress Level (HRV)**: Semi-circular gauge needle driven by autonomic heart rate state ($0\text{–}100\%$).
     - **Signal Quality (SQI)**: Real-time signal quality percentage and 5-bar indicator.
     - **Rhythm Status**: Cardiac rhythm classification (`Normal Sinus`, `Sinus Tachycardia`, `Sinus Bradycardia`, or `Place Finger on Sensor`).
     - **FFT Spectrum**: 18-bin frequency spectrum centered at the fundamental cardiac frequency and second harmonic.

---

## Running the Project Locally

### Step 1: Start the ZKP Gateway Backend (`index.py`)
Open a terminal in `ZKP_Gateway/`:

```bash
cd ZKP_Gateway
pip install -r requirements.txt
python api/index.py
```
The Flask server will start on `http://127.0.0.1:5000`.

### Step 2: Start the React Frontend (`Dashboard/`)
Open a second terminal in `Dashboard/`:

```bash
cd Dashboard
npm install
npm run dev
```
The frontend will open at `http://localhost:3000` and automatically proxy `/api/get-data` requests to `http://127.0.0.1:5000`.

---

## Connection Modes & Demo Button

- **Real Hardware / Gateway Mode (Default)**:
  - Before the ESP32 sends data, the dashboard displays `Waiting for device...`, `-- BPM`, `--%`, and a flatline waveform.
  - Once the ESP32 posts readings to `/api/data` (or streams over USB Serial), the status pill turns green (`Connected (<device_id>)`) and all cards display the live readings.
- **One-Click Demo Mode (`▶ Show Demo`)**:
  - Click **`▶ Show Demo`** in the top-right header anytime to preview the dashboard with simulated live telemetry (`72 BPM`, `98% SpO2`, `94% SQI`, `Normal Sinus`).
  - Click **`● Demo Active (Exit)`** to return to real `index.py` / ESP32 data mode.
- **Switching Telemetry Sources**:
  - Click the top status pill or the **`⚙` Gear icon** to switch between:
    1. **ZKP Gateway API (`index.py`)**: `/api/get-data` (local Flask or deployed Vercel URL).
    2. **USB Serial Port (`COM`)**: Directly parses `main.c` serial logs (`BPM : 72 | SPO2: 98% | RAM: ... | UPTIME: 120 SEC`) or JSON/CSV over USB.
    3. **Wi-Fi WebSocket (`ws://`)**: Direct WebSocket stream from ESP32.
    4. **Figma Preview (Demo Mode)**.
