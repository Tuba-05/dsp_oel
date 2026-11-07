import { useEffect, useRef, useState } from 'react'
import { samplePPG } from '../utils/dspMath'

export default function WaveformMonitor({
  connected,
  heartRate,
  ppgBufferRef,
  isPlaying,
  setIsPlaying,
  onToggleFullscreen
}) {
  const [speedIndex, setSpeedIndex] = useState(0) // 1x, 2x, 0.5x
  const [windowIndex, setWindowIndex] = useState(0) // 5s, 10s, 2s

  const speeds = [1, 2, 0.5]
  const windows = [5, 10, 2]
  const currentSpeed = speeds[speedIndex]
  const currentWindow = windows[windowIndex]

  const canvasRef = useRef(null)
  const phaseRef = useRef(0)

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

      // 4. Compute PPG Waveform points
      const topY = height * 0.14
      const baselineY = height * 0.78
      const amplitude = baselineY - topY
      const points = []

      const rawBuffer = ppgBufferRef.current
      if (connected && rawBuffer && rawBuffer.length >= 4) {
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

  return (
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
            onClick={onToggleFullscreen}
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
            onClick={() => setSpeedIndex((prev) => (prev + 1) % speeds.length)}
            title="Cycle playback speed"
          >
            {currentSpeed}x
          </button>
        </div>

        <div className="control-group">
          <button
            type="button"
            className="ctrl-btn"
            onClick={() => setWindowIndex((prev) => (prev === 0 ? 1 : 0))}
            title="Toggle time scale"
            aria-label="Zoom out"
          >
            —
          </button>
          <button
            type="button"
            className="ctrl-btn"
            onClick={() => setWindowIndex((prev) => (prev + 1) % windows.length)}
            title="Cycle time window"
          >
            {currentWindow}s
          </button>
        </div>
      </div>
    </section>
  )
}

