export default function VitalsRow({
  connected,
  heartRate,
  spo2,
  spo2Status,
  gatewayStatus
}) {
  const spo2BadgeClass =
    !connected || spo2Status === 'NO SIGNAL' || spo2Status === 'CRITICAL'
      ? 'crit'
      : spo2Status === 'LOW' || spo2Status === 'PLACE FINGER'
        ? 'warn'
        : ''

  return (
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
                  : gatewayStatus || 'No ESP32 Data'}
              </span>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}

