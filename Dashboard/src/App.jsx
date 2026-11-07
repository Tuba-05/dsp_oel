import { useEffect, useState } from 'react'
import DspMetricsRow from './components/DspMetricsRow'
import GatewayConfigModal from './components/GatewayConfigModal'
import HeaderBar from './components/HeaderBar'
import VitalsRow from './components/VitalsRow'
import WaveformMonitor from './components/WaveformMonitor'
import { DEMO_TELEMETRY, useEsp32Telemetry } from './hooks/useEsp32Telemetry'
import './App.css'

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
  const [isPlaying, setIsPlaying] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const {
    heartRate,
    spo2,
    spo2Status,
    stressLevel,
    sqi,
    rhythmStatus,
    fftSpectrum,
    gatewayStatus
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

  return (
    <main className={`monitor-shell ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      <HeaderBar
        connected={connected}
        heartRate={heartRate}
        telemetry={telemetry}
        mode={mode}
        switchMode={switchMode}
        showGatewayPanel={showGatewayPanel}
        setShowGatewayPanel={setShowGatewayPanel}
      />

      {showGatewayPanel && (
        <GatewayConfigModal
          mode={mode}
          switchMode={switchMode}
          httpUrl={httpUrl}
          setHttpUrl={setHttpUrl}
          pollIntervalMs={pollIntervalMs}
          setPollIntervalMs={setPollIntervalMs}
          wsUrl={wsUrl}
          setWsUrl={setWsUrl}
          baudRate={baudRate}
          setBaudRate={setBaudRate}
          connectSerial={connectSerial}
          packetsReceived={packetsReceived}
          connectionError={connectionError}
          applyIncomingPayload={applyIncomingPayload}
          onClose={() => setShowGatewayPanel(false)}
        />
      )}

      <VitalsRow
        connected={connected}
        heartRate={heartRate}
        spo2={spo2}
        spo2Status={spo2Status}
        gatewayStatus={gatewayStatus}
      />

      <WaveformMonitor
        connected={connected}
        heartRate={heartRate}
        ppgBufferRef={ppgBufferRef}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        onToggleFullscreen={() => setIsFullscreen((f) => !f)}
      />

      <DspMetricsRow
        connected={connected}
        stressLevel={stressLevel}
        sqi={sqi}
        rhythmStatus={rhythmStatus}
        fftSpectrum={fftSpectrum}
      />
    </main>
  )
}
