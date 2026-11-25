import { formatUptime } from '../utils/dspMath'

export default function HeaderBar({
  connected,
  heartRate,
  telemetry,
  mode,
  switchMode,
  setShowGatewayPanel
}) {
  return (
    <header className="monitor-header">
      <div className="header-left">
        <h1 className="monitor-title">
          PulseOxi-32 Real-Time Heart Rate &amp; Oxygen Telemetry System
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
      </div>
    </header>
  )
}
