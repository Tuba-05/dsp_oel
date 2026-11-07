import { useEffect, useRef, useState } from 'react'
import { DEMO_TELEMETRY, useEsp32Telemetry } from './hooks/useEsp32Telemetry'
import './App.css'

// Realistic arterial PPG single-cycle waveform (t in [0, 1))
function samplePPG(t) {
  const phase = ((t % 1) + 1) % 1

  // Systolic peak around phase = 0.22
  const sys = Math.exp(-Math.pow((phase - 0.22) / 0.075, 2))
  // Dicrotic notch dip & diastolic peak around phase = 0.44
  const dia = 0.34 * Math.exp(-Math.pow((phase - 0.44) / 0.11, 2))
  // Slight late runoff wave around phase = 0.68
  const tail = 0.08 * Math.exp(-Math.pow((phase - 0.68) / 0.14, 2))
  // Sharp foot before systolic upstroke
  const foot = -0.12 * Math.exp(-Math.pow((phase - 0.07) / 0.055, 2))

  return sys + dia + tail + foot
}

function formatUptime(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`
}

// Computes rotated needle polygon points for stressLevel in [0, 100]
function getStressNeedlePolygon(stressPct) {
  const clamped = Math.max(0, Math.min(100, Number(stressPct) || 0))
  const angleDeg = -168 + (clamped / 100) * 156
  const rad = (angleDeg * Math.PI) / 180
  const cx = 75
  const cy = 65
  const length = 37
  const baseRadius = 3.6

  const tipX = cx + Math.cos(rad) * length
  const tipY = cy + Math.sin(rad) * length

  const perpRad = rad + Math.PI / 2
  const leftX = cx + Math.cos(perpRad) * baseRadius
  const leftY = cy + Math.sin(perpRad) * baseRadius
  const rightX = cx - Math.cos(perpRad) * baseRadius
  const rightY = cy - Math.sin(perpRad) * baseRadius

  return `${leftX.toFixed(1)},${leftY.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} ${rightX.toFixed(1)},${rightY.toFixed(1)}`
}

export default function App() {
  const {
    mode,
    switchMode,
    wsUrl,
    setWsUrl,
    httpUrl,
    setHttpUrl,
    pollIntervalMs,
    setPollIntervalMs,
    baudRate,
    setBaudRate,
    connected,
    connectionError,
    telemetry,
    setTelemetry,
    packetsReceived,
    ppgBufferRef,
    connectSerial,
    applyIncomingPayload
  } = useEsp32Telemetry()

  const [showGatewayPanel, setShowGatewayPanel] = useState(false)
  const [testJsonInput, setTestJsonInput] = useState(
    '{"hr":78,"spo2":98,"ppg":2350,"sqi":95,"stress":30,"rhythm":"Normal Sinus"}'
  )

  const [isPlaying, setIsPlaying] = useState(true)
  const [speedIndex, setSpeedIndex] = useState(0) // 1x, 2x, 0.5x
  const [windowIndex, setWindowIndex] = useState(0) // 5s, 10s, 2s
  const [isFullscreen, setIsFullscreen] = useState(false)

  const speeds = [1, 2, 0.5]
  const windows = [5, 10, 2]
  const currentSpeed = speeds[speedIndex]
  const currentWindow = windows[windowIndex]

  const canvasRef = useRef(null)
  const phaseRef = useRef(0)

  const {
    heartRate,
    spo2,
    spo2Status,
    stressLevel,
    sqi,
    rhythmStatus,
    fftSpectrum,
    uptimeSeconds
  } = telemetry

  // Subtle FFT micro-animation ONLY when explicitly in demo preview mode
  useEffect(() => {
    if (!connected || !isPlaying || mode !== 'demo') return
    const fftInterval = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        fftSpectrum: DEMO_TELEMETRY.fftSpectrum.map((base, idx) => {
          const jitter = Math.sin(Date.now() * 0.005 + idx * 0.9) * 3.5
          return Math.max(8, Math.min(100, Math.round(base + jitter)))
        })
      }))
    }, 180)
    return () => clearInterval(fftInterval)
  }, [connected, isPlaying, mode, setTelemetry])

  // High-DPI PPG Waveform Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animationId
    let lastTime = performance.now()

    const render = (now) => {
      const dt = (now - lastTime) / 1000
      lastTime = now

      const hasValidHr = connected && heartRate && heartRate > 0
      const bpmFactor = hasValidHr
        ? Math.max(30, Math.min(220, heartRate)) / 72
        : 0

      if (isPlaying && hasValidHr) {
        phaseRef.current += dt * 0.85 * currentSpeed * bpmFactor
      }

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height

      if (
        canvas.width !== Math.round(width * dpr) ||
        canvas.height !== Math.round(height * dpr)
      ) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }

      ctx.save()
      ctx.scale(dpr, dpr)

      // 1. Dark recessed screen background
      ctx.fillStyle = '#121722'
      ctx.fillRect(0, 0, width, height)

      // 2. Subtle Minor Grid
      const minorStep = 14
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.24)'
      ctx.lineWidth = 0.75
      ctx.beginPath()
      for (let x = 0; x <= width; x += minorStep) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }
      for (let y = 0; y <= height; y += minorStep) {
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }
      ctx.stroke()

      // 3. Major Grid
      const majorStep = minorStep * 4
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.36)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= width; x += majorStep) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }
      for (let y = 0; y <= height; y += majorStep) {
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }
      ctx.stroke()

      // 4. Compute PPG Waveform points from REAL ESP32 data
      const topY = height * 0.14
      const baselineY = height * 0.78
      const amplitude = baselineY - topY
      const points = []

      const rawBuffer = ppgBufferRef.current
      if (connected && rawBuffer && rawBuffer.length >= 4) {
        // Plot actual raw PPG ADC samples received from ESP32
        const windowSamples =
          currentWindow === 5 ? 200 : currentWindow === 10 ? 400 : 100
        const slice = rawBuffer.slice(-windowSamples)
        const minVal = Math.min(...slice)
        const maxVal = Math.max(...slice)
        const span = Math.max(maxVal - minVal, 1)

        for (let i = 0; i < slice.length; i++) {
          const x =
            slice.length === 1 ? width / 2 : (i / (slice.length - 1)) * width
          const normY = (slice[i] - minVal) / span
          const y = baselineY - normY * amplitude
          points.push({ x, y })
        }
      } else if (hasValidHr) {
        // ESP32 connected and sending real HR/SpO2 -> plot pulse waveform at exact live BPM
        const baseCycles =
          currentWindow === 5 ? 10 : currentWindow === 10 ? 16 : 5
        const numCycles = baseCycles * bpmFactor
        const stepPx = 1.5

        for (let x = 0; x <= width; x += stepPx) {
          const normX = x / width
          const t = normX * numCycles + phaseRef.current
          const respMod =
            Math.sin((normX * 2 + phaseRef.current * 0.25) * Math.PI) * 0.025
          const val = samplePPG(t) + respMod
          const y = baselineY - val * amplitude
          points.push({ x, y })
        }
      } else {
        // Disconnected or 0 BPM -> Flatline at baseline
        points.push({ x: 0, y: baselineY })
        points.push({ x: width, y: baselineY })
      }

      // 5. Area Gradient Fill Under PPG Curve
      if (points.length > 1) {
        if (connected && (rawBuffer.length >= 4 || hasValidHr)) {
          const fillGrad = ctx.createLinearGradient(0, topY, 0, height)
          fillGrad.addColorStop(0, 'rgba(34, 211, 238, 0.24)')
          fillGrad.addColorStop(0.65, 'rgba(34, 211, 238, 0.06)')
          fillGrad.addColorStop(1, 'rgba(34, 211, 238, 0.0)')

          ctx.beginPath()
          ctx.moveTo(points[0].x, height)
          for (const pt of points) {
            ctx.lineTo(pt.x, pt.y)
          }
          ctx.lineTo(points[points.length - 1].x, height)
          ctx.closePath()
          ctx.fillStyle = fillGrad
          ctx.fill()
        }

        // 6. Outer Neon Cyan Glow Stroke
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.strokeStyle = connected
          ? 'rgba(34, 211, 238, 0.35)'
          : 'rgba(148, 163, 184, 0.15)'
        ctx.lineWidth = connected ? 6 : 2
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()

        // 7. Crisp Core Cyan Waveform Line
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.strokeStyle = connected ? '#27f3ff' : 'rgba(148, 163, 184, 0.4)'
        ctx.lineWidth = 2.1
        if (connected) {
          ctx.shadowColor = '#00f2fe'
          ctx.shadowBlur = 10
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      ctx.restore()
      animationId = requestAnimationFrame(render)
    }

    animationId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animationId)
  }, [isPlaying, connected, currentSpeed, currentWindow, heartRate, ppgBufferRef])

  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % speeds.length)
  }

  const cycleWindow = () => {
    setWindowIndex((prev) => (prev + 1) % windows.length)
  }

  const stepZoomOut = () => {
    setWindowIndex((prev) => (prev === 0 ? 1 : 0))
  }

  const spo2BadgeClass =
    !connected || spo2Status === 'NO SIGNAL' || spo2Status === 'CRITICAL'
      ? 'crit'
      : spo2Status === 'LOW'
        ? 'warn'
        : ''

  const sqiThresholds = [20, 40, 60, 80, 90]
  const sqiBarHeights = [8, 13, 18, 24, 30]

  return (
    <main className={`monitor-shell ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      {/* Header Bar */}
      <header className="monitor-header">
        <div className="header-left">
          <h1 className="monitor-title">
            Smart PPG Health &amp; Vital Monitor (ESP32 Gateway)
          </h1>
          <button
            type="button"
            className={`status-pill ${connected && heartRate > 0 ? '' : 'disconnected'}`}
            onClick={() => setShowGatewayPanel((prev) => !prev)}
            title="Click to configure ZKP Gateway / ESP32 connection"
          >
            <span className="status-dot" />
            <span>
              {connected
                ? heartRate > 0
                  ? telemetry.deviceId && telemetry.deviceId !== 'Not Connected'
                    ? `Connected (${telemetry.deviceId})`
                    : 'Connected'
                  : telemetry.gatewayStatus || 'Idle - Place Finger on Sensor'
                : telemetry.gatewayStatus || 'Waiting for device...'}
            </span>
          </button>
        </div>

        <div className="header-right">
          <button
            type="button"
            className={`demo-toggle-btn ${mode === 'demo' ? 'active' : ''}`}
            onClick={() =>
              switchMode(mode === 'demo' ? 'http' : 'demo')
            }
            title={
              mode === 'demo'
                ? 'Click to exit Demo Mode and return to Real ZKP Gateway (index.py) Mode'
                : 'Click to show Demo / Dummy Data'
            }
          >
            <span>{mode === 'demo' ? '● Demo Active (Exit)' : '▶ Show Demo'}</span>
          </button>
          <div className="uptime-text">Uptime: {formatUptime(uptimeSeconds)}</div>
          <button
            type="button"
            className={`config-trigger-btn ${showGatewayPanel ? 'active' : ''}`}
            onClick={() => setShowGatewayPanel((prev) => !prev)}
            title="ESP32 Connection Settings"
            aria-label="ESP32 Connection Settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Collapsible ESP32 Gateway Configuration Drawer */}
      {showGatewayPanel && (
        <section className="gateway-panel" aria-label="ESP32 Gateway Configuration">
          <div className="gateway-panel-header">
            <div className="gateway-panel-title">
              <span>ESP32 Live Hardware Connection</span>
              <span className="uptime-text">
                ({packetsReceived} packets received)
              </span>
            </div>
            <button
              type="button"
              className="ctrl-btn"
              onClick={() => setShowGatewayPanel(false)}
            >
              Close
            </button>
          </div>

          <div className="mode-tabs">
            <button
              type="button"
              className={`mode-tab ${mode === 'http' ? 'active' : ''}`}
              onClick={() => switchMode('http')}
            >
              ZKP Gateway API (index.py)
            </button>
            <button
              type="button"
              className={`mode-tab ${mode === 'serial' ? 'active' : ''}`}
              onClick={connectSerial}
            >
              USB Serial Port (COM)
            </button>
            <button
              type="button"
              className={`mode-tab ${mode === 'websocket' ? 'active' : ''}`}
              onClick={() => switchMode('websocket')}
            >
              Wi-Fi WebSocket (ws://)
            </button>
            <button
              type="button"
              className={`mode-tab ${mode === 'demo' ? 'active' : ''}`}
              onClick={() => switchMode('demo')}
            >
              Figma Preview (Demo Mode)
            </button>
          </div>

          {mode === 'websocket' && (
            <div className="gateway-controls-row">
              <input
                type="text"
                className="gateway-input"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                placeholder="ws://192.168.4.1:81"
              />
              <span className="uptime-text">
                Enter your ESP32 IP &amp; WebSocket Port
              </span>
            </div>
          )}

          {mode === 'serial' && (
            <div className="gateway-controls-row">
              <select
                className="gateway-input"
                style={{ maxWidth: '160px' }}
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
              >
                <option value={115200}>115200 baud</option>
                <option value={9600}>9600 baud</option>
                <option value={57600}>57600 baud</option>
                <option value={230400}>230400 baud</option>
              </select>
              <button
                type="button"
                className="gateway-action-btn"
                onClick={connectSerial}
              >
                Select ESP32 USB COM Port
              </button>
            </div>
          )}

          {mode === 'http' && (
            <div className="gateway-controls-row">
              <input
                type="text"
                className="gateway-input"
                value={httpUrl}
                onChange={(e) => setHttpUrl(e.target.value)}
                placeholder="/api/get-data or https://your-vercel-app.vercel.app/api/get-data"
              />
              <input
                type="number"
                className="gateway-input"
                style={{ maxWidth: '110px' }}
                value={pollIntervalMs}
                onChange={(e) => setPollIntervalMs(Number(e.target.value) || 1000)}
                min={200}
                step={100}
                title="Polling interval (ms)"
              />
              <span className="uptime-text">ms poll interval (from index.py)</span>
            </div>
          )}

          {/* Manual Packet Tester available in any mode */}
          <div className="gateway-controls-row" style={{ marginTop: '10px' }}>
            <input
              type="text"
              className="gateway-input"
              value={testJsonInput}
              onChange={(e) => setTestJsonInput(e.target.value)}
              placeholder='{"hr":75,"spo2":98,"ppg":2048,"sqi":94,"stress":32}'
            />
            <button
              type="button"
              className="gateway-action-btn"
              onClick={() => applyIncomingPayload(testJsonInput)}
            >
              Test Incoming Packet
            </button>
          </div>

          {connectionError && (
            <div className="gateway-error">{connectionError}</div>
          )}

          <div className="gateway-hint">
            ESP32 se JSON (<code>{`{"hr":72,"spo2":98,"ppg":2048,"sqi":94,"stress":32}`}</code>),
            Key-Value (<code>HR:72,SPO2:98,PPG:2048</code>), ya CSV (<code>72,98,2048,94,32</code>) bhejein — har reading real-time update hogi.
          </div>
        </section>
      )}

      {/* Top Row: Heart Rate & SpO2 */}
      <section className="top-vitals-grid">
        {/* HEART RATE CARD */}
        <article className="vital-card hr-card">
          <div className="vital-card-header">
            <span className="vital-label">HEART RATE</span>
            <div
              className="heart-icon-wrap"
              style={{
                animationDuration:
                  connected && heartRate > 0
                    ? `${(60 / heartRate).toFixed(2)}s`
                    : '0s'
              }}
              aria-hidden="true"
            >
              <svg width="26" height="24" viewBox="0 0 28 26" fill="none">
                <path
                  d="M14 24.2C14 24.2 2.5 16.7 2.5 8.6C2.5 4.8 5.5 1.8 9.2 1.8C11.4 1.8 13.3 2.9 14 4.5C14.7 2.9 16.6 1.8 18.8 1.8C22.5 1.8 25.5 4.8 25.5 8.6C25.5 16.7 14 24.2 14 24.2Z"
                  fill="#ff6e59"
                />
                <path
                  d="M5.5 12.5H9.8L11.5 8.8L13.8 16.2L15.8 10.6L17.2 12.5H22.5"
                  stroke="#281d24"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div className="vital-card-body">
            <div className="hr-value">
              {connected && heartRate !== null && heartRate > 0
                ? `${heartRate} BPM`
                : '-- BPM'}
            </div>

            {/* Mini ECG / Pulse trace on right side of Heart Rate card */}
            <svg
              className="mini-ecg-svg"
              viewBox="0 0 130 44"
              fill="none"
              aria-hidden="true"
            >
              <path
                d={
                  connected && heartRate > 0
                    ? 'M2 27 H26 L30 23 L34 29 L40 9 L45 38 L50 20 L55 27 H63 L67 21 L72 28 L76 23 L80 27 H92 L96 22 L100 28 L106 25 L112 27 H117 L123 11 L127 27'
                    : 'M2 27 H127'
                }
                stroke="#f87171"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </article>

        {/* SpO2 CARD */}
        <article className="vital-card spo2-card">
          <div className="vital-card-header">
            <span className="vital-label">SpO2</span>
            <span className={`spo2-badge-top ${spo2BadgeClass}`}>
              {connected ? spo2Status : 'NO SIGNAL'}
            </span>
          </div>

          <div className="vital-card-body">
            <div className="spo2-body-left">
              <div className="spo2-value">
                {connected && spo2 !== null && spo2 > 0 ? `${spo2}%` : '--%'}
              </div>
              <div className="spo2-meta">
                <span className={`spo2-badge-inline ${spo2BadgeClass}`}>
                  {connected ? spo2Status : 'WAITING'}
                </span>
                <span className="spo2-subtext">
                  {connected && spo2 !== null && spo2 > 0
                    ? `${spo2}% Saturation`
                    : telemetry.gatewayStatus || 'No ESP32 Data'}
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* Middle Row: PPG Pulse Waveform */}
      <section className="waveform-card">
        <div className="waveform-header">
          <h2 className="waveform-title">PPG Pulse Waveform</h2>
          <div className="waveform-header-actions">
            <div className={`live-badge ${isPlaying && connected ? '' : 'paused'}`}>
              <span className="live-dot" />
              <span>
                {!connected ? 'NO SIGNAL' : isPlaying ? 'LIVE' : 'PAUSED'}
              </span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setIsFullscreen((f) => !f)}
              title="Toggle expanded view"
              aria-label="Toggle expanded view"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2.5 6V2.5H6M10 2.5H13.5V6M13.5 10V13.5H10M6 13.5H2.5V10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="waveform-screen">
          <canvas ref={canvasRef} className="waveform-canvas" />
        </div>

        <div className="waveform-controls">
          <div className="control-group">
            <button
              type="button"
              className={`ctrl-btn ${isPlaying ? 'active' : ''}`}
              onClick={() => setIsPlaying(true)}
              title="Play waveform"
              aria-label="Play"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2.5 1.8L10 6L2.5 10.2V1.8Z" />
              </svg>
            </button>
            <button
              type="button"
              className={`ctrl-btn ${!isPlaying ? 'active' : ''}`}
              onClick={() => setIsPlaying(false)}
              title="Pause waveform"
              aria-label="Pause"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2.5" y="2" width="2.3" height="8" rx="0.6" />
                <rect x="7.2" y="2" width="2.3" height="8" rx="0.6" />
              </svg>
            </button>
            <button
              type="button"
              className="ctrl-btn"
              onClick={cycleSpeed}
              title="Cycle playback speed"
            >
              {currentSpeed}x
            </button>
          </div>

          <div className="control-group">
            <button
              type="button"
              className="ctrl-btn"
              onClick={stepZoomOut}
              title="Toggle time scale"
              aria-label="Zoom out"
            >
              —
            </button>
            <button
              type="button"
              className="ctrl-btn"
              onClick={cycleWindow}
              title="Cycle time window"
            >
              {currentWindow}s
            </button>
          </div>
        </div>
      </section>

      {/* Bottom Row: 4 Metric Cards */}
      <section className="bottom-metrics-grid">
        {/* 1. Stress Level (HRV) */}
        <article className="metric-card stress-card">
          <h3 className="metric-title">Stress Level (HRV)</h3>
          <div
            className="gauge-wrap"
            title={`Stress Level: ${connected ? stressLevel : 0}%`}
          >
            <svg className="gauge-svg" viewBox="0 0 150 78" fill="none">
              <defs>
                <radialGradient id="cyanGaugeGlow" cx="30%" cy="75%" r="55%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </radialGradient>
                <filter id="arcGlow" x="-25%" y="-25%" width="150%" height="150%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              <ellipse cx="48" cy="56" rx="36" ry="26" fill="url(#cyanGaugeGlow)" />

              <path
                d="M 22 66 A 53 53 0 0 1 40.5 26.8"
                stroke="#4ff0e6"
                strokeWidth="11"
                strokeLinecap="butt"
                filter="url(#arcGlow)"
              />
              <path
                d="M 43.8 24.5 A 53 53 0 0 1 73 13.2"
                stroke="#43d9ce"
                strokeWidth="11"
                strokeLinecap="butt"
                filter="url(#arcGlow)"
              />
              <path
                d="M 77 13.2 A 53 53 0 0 1 106.2 24.5"
                stroke="#3d656a"
                strokeWidth="11"
                strokeLinecap="butt"
              />
              <path
                d="M 109.5 26.8 A 53 53 0 0 1 128 66"
                stroke="#5e474b"
                strokeWidth="11"
                strokeLinecap="butt"
              />

              <path
                d="M 32 65 A 43 43 0 0 1 118 65"
                stroke="rgba(148, 163, 184, 0.25)"
                strokeWidth="1"
                strokeDasharray="2 5"
              />

              {/* Dynamic Needle controlled by live ESP32 stressLevel (0 - 100) */}
              <g>
                <polygon
                  points={getStressNeedlePolygon(connected ? stressLevel : 0)}
                  fill="#f8fafc"
                  style={{
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                    transition: 'all 0.35s ease-out'
                  }}
                />
                <circle cx="75" cy="65" r="4.8" fill="#e2e8f0" />
                <circle cx="75" cy="65" r="2.2" fill="#334155" />
              </g>
            </svg>
          </div>
        </article>

        {/* 2. Signal Quality (SQI) */}
        <article className="metric-card sqi-card">
          <h3 className="metric-title">Signal Quality (SQI)</h3>
          <div className="sqi-body">
            <div className="sqi-value">{connected ? `${sqi}%` : '0%'}</div>
            <div className="sqi-bars" aria-label={`Signal quality ${sqi}%`}>
              {sqiThresholds.map((threshold, idx) => (
                <span
                  key={threshold}
                  className={`sqi-bar ${
                    connected && sqi >= threshold ? '' : 'dim'
                  }`}
                  style={{ height: `${sqiBarHeights[idx]}px` }}
                />
              ))}
            </div>
          </div>
        </article>

        {/* 3. Rhythm Status */}
        <article className="metric-card rhythm-card">
          <h3 className="metric-title">Rhythm Status</h3>
          <div
            className={`rhythm-value ${
              connected && rhythmStatus.toLowerCase().includes('normal')
                ? ''
                : 'abnormal'
            }`}
          >
            {connected ? rhythmStatus : 'Waiting for ESP32...'}
          </div>
        </article>

        {/* 4. FFT Spectrum */}
        <article className="metric-card fft-card">
          <h3 className="metric-title">FFT Spectrum</h3>
          <div className="fft-chart-wrap">
            <div className="fft-bars">
              {fftSpectrum.map((heightPct, idx) => (
                <div
                  key={idx}
                  className="fft-bar"
                  style={{ height: `${connected ? heightPct : 0}%` }}
                />
              ))}
            </div>
            <div className="fft-baseline" />
          </div>
        </article>
      </section>
    </main>
  )
}
