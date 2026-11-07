import { formatUptime } from '../utils/dspMath'

export default function HeaderBar({
  connected,
  heartRate,
  telemetry,
  mode,
  switchMode,
  showGatewayPanel,
  setShowGatewayPanel
}) {
  return (
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
          onClick={() => switchMode(mode === 'demo' ? 'http' : 'demo')}
          title={
            mode === 'demo'
              ? 'Click to exit Demo Mode and return to Real ZKP Gateway (index.py) Mode'
              : 'Click to show Demo / Dummy Data'
          }
        >
          <span>{mode === 'demo' ? '● Demo Active (Exit)' : '▶ Show Demo'}</span>
        </button>
        <div className="uptime-text">
          Uptime: {formatUptime(telemetry.uptimeSeconds)}
        </div>
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
  )
}

