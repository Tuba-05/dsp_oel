import { useState } from 'react'

export default function GatewayConfigModal({
  mode,
  switchMode,
  httpUrl,
  setHttpUrl,
  pollIntervalMs,
  setPollIntervalMs,
  wsUrl,
  setWsUrl,
  baudRate,
  setBaudRate,
  connectSerial,
  packetsReceived,
  connectionError,
  applyIncomingPayload,
  onClose
}) {
  const [testJsonInput, setTestJsonInput] = useState(
    '{"hr":78,"spo2":98,"ppg":2350,"sqi":95,"stress":30,"rhythm":"Normal Sinus"}'
  )

  return (
    <section className="gateway-panel" aria-label="ESP32 Gateway Configuration">
      <div className="gateway-panel-header">
        <div className="gateway-panel-title">
          <span>ESP32 Live Hardware Connection</span>
          <span className="uptime-text">
            ({packetsReceived} packets received)
          </span>
        </div>
        <button type="button" className="ctrl-btn" onClick={onClose}>
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

      {mode === 'http' && (
        <div className="gateway-controls-row">
          <input
            type="text"
            className="gateway-input"
            value={httpUrl}
            onChange={(e) => setHttpUrl(e.target.value)}
            placeholder="/api/get-data (proxied to https://zkp-gateway.vercel.app)"
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
          <span className="uptime-text">
            ms poll (https://zkp-gateway.vercel.app)
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
        Polls <code>/api/get-data</code> from <code>https://zkp-gateway.vercel.app</code> or reads USB Serial from <code>main.c</code>.
      </div>
    </section>
  )
}

