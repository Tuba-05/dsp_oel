import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeFFTFromHeartRate,
  computeRealFFTFromPPG,
  DEMO_TELEMETRY,
  DISCONNECTED_TELEMETRY,
  EMPTY_FFT,
  parseEsp32Payload
} from '../utils/dspMath'

export { DEMO_TELEMETRY, DISCONNECTED_TELEMETRY, EMPTY_FFT }

export function useEsp32Telemetry() {
  // Default to HTTP polling '/api/get-data' served by ZKP_Gateway/api/index.py (configurable via .env)
  const [mode, setMode] = useState('http') // 'http' | 'serial' | 'websocket' | 'demo'
  const [httpUrl, setHttpUrl] = useState(
    import.meta.env.VITE_ZKP_API_ENDPOINT || '/api/get-data'
  )
  const [wsUrl, setWsUrl] = useState(
    import.meta.env.VITE_ESP32_WS_URL || 'ws://192.168.4.1:81'
  )
  const [pollIntervalMs, setPollIntervalMs] = useState(
    Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 1000
  )
  const [baudRate, setBaudRate] = useState(
    Number(import.meta.env.VITE_ESP32_BAUD_RATE) || 115200
  )

  const [connected, setConnected] = useState(false)
  const [backendReachable, setBackendReachable] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [telemetry, setTelemetry] = useState(DISCONNECTED_TELEMETRY)
  const [packetsReceived, setPacketsReceived] = useState(0)

  const ppgBufferRef = useRef([])
  const lastPacketTimeRef = useRef(0)
  const serialPortRef = useRef(null)
  const serialReaderRef = useRef(null)

  const applyIncomingPayload = useCallback((rawPayload) => {
    const parsed = parseEsp32Payload(rawPayload)
    if (!parsed) return

    setBackendReachable(true)
    setConnectionError('')

    if (parsed.isWaitingForDevice) {
      setConnected(false)
      ppgBufferRef.current = []
      setTelemetry((prev) => ({
        ...DISCONNECTED_TELEMETRY,
        deviceId: parsed.deviceId || 'Not Connected',
        gatewayStatus: parsed.gatewayStatus || 'Waiting for device...',
        uptimeSeconds: prev.uptimeSeconds
      }))
      return
    }

    if (parsed.isIdleFingerOff) {
      setConnected(true)
      ppgBufferRef.current = []
      setTelemetry((prev) => ({
        ...prev,
        deviceId: parsed.deviceId || prev.deviceId,
        gatewayStatus: parsed.gatewayStatus,
        heartRate: 0,
        spo2: 0,
        spo2Status: 'PLACE FINGER',
        sqi: 0,
        stressLevel: 0,
        rhythmStatus: 'Place Finger on Sensor',
        fftSpectrum: EMPTY_FFT
      }))
      return
    }

    lastPacketTimeRef.current = performance.now()
    setConnected(true)
    setPacketsReceived((c) => c + 1)

    let computedFftFromPpg = null
    if (parsed.ppgSamples && parsed.ppgSamples.length > 0) {
      const buf = ppgBufferRef.current
      for (const s of parsed.ppgSamples) {
        buf.push(s)
      }
      if (buf.length > 512) {
        ppgBufferRef.current = buf.slice(buf.length - 512)
      }
      if (!parsed.fftSpectrum && ppgBufferRef.current.length >= 32) {
        computedFftFromPpg = computeRealFFTFromPPG(
          ppgBufferRef.current.slice(-128)
        )
      }
    }

    setTelemetry((prev) => {
      const next = { ...prev }
      if (parsed.deviceId !== undefined) next.deviceId = parsed.deviceId
      if (parsed.gatewayStatus !== undefined)
        next.gatewayStatus = parsed.gatewayStatus
      if (parsed.heartRate !== undefined) next.heartRate = parsed.heartRate
      if (parsed.spo2 !== undefined) next.spo2 = parsed.spo2
      if (parsed.spo2Status !== undefined) next.spo2Status = parsed.spo2Status
      if (parsed.stressLevel !== undefined) next.stressLevel = parsed.stressLevel
      if (parsed.sqi !== undefined) next.sqi = parsed.sqi
      if (parsed.rhythmStatus !== undefined) next.rhythmStatus = parsed.rhythmStatus

      if (parsed.fftSpectrum !== undefined) {
        next.fftSpectrum = parsed.fftSpectrum
      } else if (computedFftFromPpg) {
        next.fftSpectrum = computedFftFromPpg
      } else if (parsed.heartRate !== undefined) {
        next.fftSpectrum = computeFFTFromHeartRate(parsed.heartRate)
      }

      if (parsed.sqi === undefined && next.heartRate > 0) {
        const spo2Penalty = Math.max(0, (98 - (next.spo2 || 98)) * 2.5)
        const hrPenalty = next.heartRate >= 50 && next.heartRate <= 135 ? 0 : 8
        next.sqi = Math.round(
          Math.max(60, Math.min(99, 96 - spo2Penalty - hrPenalty))
        )
      }
      if (parsed.stressLevel === undefined && next.heartRate > 0) {
        next.stressLevel = Math.min(
          95,
          Math.max(15, Math.round(((next.heartRate - 55) / 65) * 58 + 18))
        )
      }

      if (parsed.uptimeSeconds !== undefined && parsed.uptimeSeconds > 0) {
        next.uptimeSeconds = parsed.uptimeSeconds
      }

      return next
    })
  }, [])

  // Uptime counter runs ONLY when ESP32 is actively connected
  useEffect(() => {
    if (!connected) return
    const timer = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        uptimeSeconds: prev.uptimeSeconds + 1
      }))
    }, 1000)
    return () => clearInterval(timer)
  }, [connected])

  // HTTP Polling Mode (polls ZKP_Gateway/api/index.py -> /api/get-data)
  useEffect(() => {
    if (mode !== 'http') return

    let isCancelled = false
    const controller = new AbortController()

    const poll = async () => {
      try {
        const res = await fetch(httpUrl, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        if (!isCancelled) {
          applyIncomingPayload(text)
        }
      } catch (err) {
        if (!isCancelled && err.name !== 'AbortError') {
          setConnected(false)
          setBackendReachable(false)
          setConnectionError(
            `Unable to reach ZKP Gateway (${httpUrl}). Check your connection.`
          )
        }
      }
    }

    poll()
    const id = setInterval(poll, Math.max(200, pollIntervalMs))

    return () => {
      isCancelled = true
      controller.abort()
      clearInterval(id)
    }
  }, [mode, httpUrl, pollIntervalMs, applyIncomingPayload])

  // WebSocket Connection Mode
  useEffect(() => {
    if (mode !== 'websocket') return

    let ws
    let reconnectTimer
    let isCancelled = false

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          if (isCancelled) return
          setConnected(true)
          setConnectionError('')
        }

        ws.onmessage = (event) => {
          if (isCancelled) return
          applyIncomingPayload(event.data)
        }

        ws.onerror = () => {
          if (isCancelled) return
          setConnectionError(`Waiting for ESP32 WebSocket at ${wsUrl}...`)
        }

        ws.onclose = () => {
          if (isCancelled) return
          setConnected(false)
          reconnectTimer = setTimeout(connectWs, 2500)
        }
      } catch (err) {
        setConnected(false)
        setConnectionError(err.message || 'Invalid WebSocket URL')
      }
    }

    connectWs()

    return () => {
      isCancelled = true
      clearTimeout(reconnectTimer)
      if (ws) ws.close()
    }
  }, [mode, wsUrl, applyIncomingPayload])

  // Web Serial Mode (reads ZKP_Gateway/main.c ESP_LOGI or JSON directly from USB COM port)
  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) {
      setConnectionError(
        'Web Serial API is supported in Chrome / Edge browsers.'
      )
      return
    }
    try {
      setConnectionError('')
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: Number(baudRate) || 115200 })
      serialPortRef.current = port
      setMode('serial')
      setConnected(true)

      const textDecoder = new TextDecoderStream()
      port.readable.pipeTo(textDecoder.writable)
      const reader = textDecoder.readable.getReader()
      serialReaderRef.current = reader

      let lineBuffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          lineBuffer += value
          const lines = lineBuffer.split(/\r?\n/)
          lineBuffer = lines.pop() || ''
          for (const line of lines) {
            applyIncomingPayload(line)
          }
        }
      }
    } catch (err) {
      setConnectionError(err.message || 'USB Serial port not connected')
      setConnected(false)
    }
  }, [applyIncomingPayload, baudRate])

  const disconnectSerial = useCallback(async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel()
        serialReaderRef.current = null
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close()
        serialPortRef.current = null
      }
    } catch {
      // ignore close errors
    }
  }, [])

  const switchMode = useCallback(
    async (newMode) => {
      if (mode === 'serial' && newMode !== 'serial') {
        await disconnectSerial()
      }
      setConnectionError('')
      ppgBufferRef.current = []
      setPacketsReceived(0)

      if (newMode === 'demo') {
        setConnected(true)
        setTelemetry(DEMO_TELEMETRY)
      } else {
        setConnected(false)
        setTelemetry(DISCONNECTED_TELEMETRY)
      }
      setMode(newMode)
    },
    [mode, disconnectSerial]
  )

  return {
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
    backendReachable,
    setConnected,
    connectionError,
    telemetry,
    setTelemetry,
    packetsReceived,
    ppgBufferRef,
    lastPacketTimeRef,
    connectSerial,
    applyIncomingPayload
  }
}
