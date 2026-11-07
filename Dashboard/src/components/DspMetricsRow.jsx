import { getStressNeedlePolygon } from '../utils/dspMath'

const SQI_THRESHOLDS = [20, 40, 60, 80, 90]
const SQI_BAR_HEIGHTS = [8, 13, 18, 24, 30]

export default function DspMetricsRow({
  connected,
  stressLevel,
  sqi,
  rhythmStatus,
  fftSpectrum
}) {
  return (
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
            {SQI_THRESHOLDS.map((threshold, idx) => (
              <span
                key={threshold}
                className={`sqi-bar ${
                  connected && sqi >= threshold ? '' : 'dim'
                }`}
                style={{ height: `${SQI_BAR_HEIGHTS[idx]}px` }}
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
  )
}

