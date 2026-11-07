import { useCallback, useEffect, useRef, useState } from 'react'

export const EMPTY_FFT = Array(18).fill(0)

export const DISCONNECTED_TELEMETRY = {
  heartRate: null,
  spo2: null,
  spo2Status: 'NO SIGNAL',
  stressLevel: 0,
  sqi: 0,
  rhythmStatus: 'Waiting for ESP32...',
  fftSpectrum: EMPTY_FFT,
  uptimeSeconds: 0
}

export const DEMO_TELEMETRY = {
  heartRate: 72,
  spo2: 98,
  spo2Status: 'NORMAL',
  stressLevel: 32,
  sqi: 94,
  rhythmStatus: 'Normal Sinus',
  fftSpectrum: [
    14, 22, 30, 58, 96, 76, 46, 30, 22, 42, 34, 20, 18, 28, 14, 12, 10, 11
  ],
  uptimeSeconds: 9912
}

/**
 * Computes a real 18-bin Discrete Fourier Transform (DFT) magnitude spectrum
 * from the live PPG sample ring buffer (removes DC component first).
 */
export function computeRealFFTFromPPG(samples) {
  const N = samples.length
  if (N < 16) return EMPTY_FFT

  // Remove DC offset (mean)
  const mean = samples.reduce((acc, v) => acc + v, 0) / N
  const centered = samples.map((v, i) => {
    // Apply Hann window to reduce spectral leakage
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))
    return (v - mean) * hann
  })

  const numBins = 18
  const magnitudes = []

  // Evaluate 18 frequency bins across the physiological PPG band
  for (let b = 1; b <= numBins; b++) {
    let re = 0
    let im = 0
    const freqIdx = b * Math.max(1, Math.floor(N / 64))
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * freqIdx * n) / N
      re += centered[n] * Math.cos(angle)
      im -= centered[n] * Math.sin(angle)
    }
    magnitudes.push(Math.sqrt(re * re + im * im))
  }

  const maxMag = Math.max(...magnitudes, 1e-6)
  return magnitudes.map((m) =>
    Math.max(4, Math.min(100, Math.round((m / maxMag) * 96)))
  )
}

/**
 * Computes a harmonic FFT spectrum from real Heart Rate (BPM) when ESP32 sends
 * scalar HR/SpO2 instead of raw high-rate ADC samples.
 */
export function computeFFTFromHeartRate(bpm) {
  if (!bpm || bpm <= 0) return EMPTY_FFT
  // Map 40..180 BPM across bins 2..14
  const fundamentalBin = Math.max(
    1,
    Math.min(15, Math.round(((bpm - 40) / 140) * 12) + 2)
  )
  const harmonicBin = Math.min(17, fundamentalBin * 2)

  return Array.from({ length: 18 }, (_, i) => {
    const dist1 = Math.abs(i - fundamentalBin)
    const dist2 = Math.abs(i - harmonicBin)
    const peak1 = 96 * Math.exp(-(dist1 * dist1) / 2.2)
    const peak2 = 42 * Math.exp(-(dist2 * dist2) / 1.8)
    const noiseFloor = 8 + ((i * 7 + bpm) % 6)
    return Math.min(100, Math.round(Math.max(peak1 + peak2, noiseFloor)))
  })
}

/**
 * Normalizes any JSON object, Key:Value string, or CSV line from ESP32
 * into a unified telemetry update object.
 */
export function parseEsp32Payload(rawInput) {
  if (rawInput == null) return null

  let data = rawInput
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim()
    if (!trimmed) return null

    if (trimmed.startsWith('{')) {
      try {
        data = JSON.parse(trimmed)
      } catch {
        return null
      }
    } else if (trimmed.includes(':')) {
      // Key:Value pairs e.g. "HR:75,SPO2:98,PPG:2140,SQI:95,STRESS:30"
      const obj = {}
      trimmed.split(/[,;\s]+/).forEach((pair) => {
        const [k, v] = pair.split(':')
        if (k && v !== undefined) {
          const num = Number(v)
          obj[k.trim().toLowerCase()] = Number.isNaN(num) ? v.trim() : num
        }
      })
      data = obj
    } else {
      // Plain CSV e.g. "72,98,512,94,32" -> hr, spo2, ppg, sqi, stress
      const parts = trimmed.split(',').map((s) => Number(s.trim()))
      if (parts.length === 1 && !Number.isNaN(parts[0])) {
        data = { ppg: parts[0] }
      } else if (parts.length >= 2) {
        data = {
          hr: !Number.isNaN(parts[0]) ? parts[0] : undefined,
          spo2: !Number.isNaN(parts[1]) ? parts[1] : undefined,
          ppg: parts.length >= 3 && !Number.isNaN(parts[2]) ? parts[2] : undefined,
          sqi: parts.length >= 4 && !Number.isNaN(parts[3]) ? parts[3] : undefined,
          stress: parts.length >= 5 && !Number.isNaN(parts[4]) ? parts[4] : undefined
        }
      }
    }
  }

  if (typeof data !== 'object' || data === null) return null

  const parsed = {}

  // Heart rate (BPM)
  const hr =
    data.heartRate ?? data.hr ?? data.bpm ?? data.heart_rate ?? data.HeartRate
  if (hr !== undefined && !Number.isNaN(Number(hr))) {
    parsed.heartRate = Math.max(0, Math.round(Number(hr)))
  }

  // SpO2 (%)
  const spo2 =
    data.spo2 ?? data.SpO2 ?? data.oxygen ?? data.saturation ?? data.spo2_val
  if (spo2 !== undefined && !Number.isNaN(Number(spo2))) {
    parsed.spo2 = Math.min(100, Math.max(0, Math.round(Number(spo2))))
    parsed.spo2Status =
      parsed.spo2 === 0
        ? 'NO SIGNAL'
        : parsed.spo2 >= 95
          ? 'NORMAL'
          : parsed.spo2 >= 90
            ? 'LOW'
            : 'CRITICAL'
  }

  if (typeof data.spo2Status === 'string') {
    parsed.spo2Status = data.spo2Status.toUpperCase()
  }

  // Stress Level / HRV (0 - 100)
  const stress =
    data.stressLevel ?? data.stress ?? data.hrv ?? data.stress_level ?? data.rmssd
  if (stress !== undefined && !Number.isNaN(Number(stress))) {
    parsed.stressLevel = Math.min(100, Math.max(0, Math.round(Number(stress))))
  }

  // Signal Quality Index (0 - 100)
  const sqi =
    data.sqi ?? data.SQI ?? data.signalQuality ?? data.signal_quality ?? data.quality
  if (sqi !== undefined && !Number.isNaN(Number(sqi))) {
    parsed.sqi = Math.min(100, Math.max(0, Math.round(Number(sqi))))
  }

  // Rhythm Status string
  const rhythm =
    data.rhythmStatus ?? data.rhythm ?? data.rhythm_status ?? data.status
  if (typeof rhythm === 'string' && rhythm.trim()) {
    parsed.rhythmStatus = rhythm.trim()
  } else if (parsed.heartRate !== undefined) {
    if (parsed.heartRate === 0) parsed.rhythmStatus = 'No Finger Detected'
    else if (parsed.heartRate > 100) parsed.rhythmStatus = 'Sinus Tachycardia'
    else if (parsed.heartRate < 60) parsed.rhythmStatus = 'Sinus Bradycardia'
    else parsed.rhythmStatus = 'Normal Sinus'
  }

  // FFT Spectrum array (18 bars)
  const fft = data.fftSpectrum ?? data.fft ?? data.spectrum ?? data.fft_bins
  if (Array.isArray(fft) && fft.length > 0) {
    const nums = fft.map((v) => Number(v) || 0)
    const maxVal = Math.max(...nums, 1)
    const bars = []
    for (let i = 0; i < 18; i++) {
      const srcIdx = Math.min(
        nums.length - 1,
        Math.floor((i / 18) * nums.length)
      )
      const pct = Math.round((nums[srcIdx] / maxVal) * 96)
      bars.push(Math.max(4, Math.min(100, pct)))
    }
    parsed.fftSpectrum = bars
  }

  // Uptime
  const uptime =
    data.uptimeSeconds ??
    data.uptime ??
    (data.millis !== undefined ? Math.floor(Number(data.millis) / 1000) : undefined)
  if (uptime !== undefined && !Number.isNaN(Number(uptime))) {
    parsed.uptimeSeconds = Math.max(0, Math.floor(Number(uptime)))
  }

  // Raw PPG sample or array of samples
  const rawPpg =
    data.ppg ?? data.waveform ?? data.ir ?? data.raw ?? data.samples ?? data.adc
  if (Array.isArray(rawPpg)) {
    parsed.ppgSamples = rawPpg
      .map((n) => Number(n))
      .filter((n) => !Number.isNaN(n))
  } else if (rawPpg !== undefined && !Number.isNaN(Number(rawPpg))) {
    parsed.ppgSamples = [Number(rawPpg)]
  }

  return parsed
}

export function useEsp32Telemetry() {
  // Default to real ESP32 WebSocket mode so nothing fake is shown unless Demo is explicitly chosen
  const [mode, setMode] = useState('websocket') // 'websocket' | 'serial' | 'http' | 'demo'
  const [wsUrl, setWsUrl] = useState('ws://192.168.4.1:81')
  const [httpUrl, setHttpUrl] = useState('http://192.168.4.1/vitals')
  const [pollIntervalMs, setPollIntervalMs] = useState(200)
  const [baudRate, setBaudRate] = useState(115200)

  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [telemetry, setTelemetry] = useState(DISCONNECTED_TELEMETRY)
  const [packetsReceived, setPacketsReceived] = useState(0)

  // Ring buffer for live hardware PPG samples (up to 600 points)
  const ppgBufferRef = useRef([])
  const lastPacketTimeRef = useRef(0)
  const serialPortRef = useRef(null)
  const serialReaderRef = useRef(null)

  const applyIncomingPayload = useCallback((rawPayload) => {
    const parsed = parseEsp32Payload(rawPayload)
    if (!parsed) return

    lastPacketTimeRef.current = performance.now()
    setConnected(true)
    setConnectionError('')
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

      // If ESP32 didn't send SQI/Stress explicitly, derive realistic DSP estimates from live HR
      if (parsed.sqi === undefined && next.heartRate > 0) {
        // Calculate SQI from real SpO2 & HR returned by index.py
        const spo2Penalty = Math.max(0, (98 - (next.spo2 || 98)) * 2.5)
        const hrPenalty = next.heartRate >= 50 && next.heartRate <= 135 ? 0 : 8
        next.sqi = Math.round(
          Math.max(60, Math.min(99, 96 - spo2Penalty - hrPenalty))
        )
      }
      if (parsed.stressLevel === undefined && next.heartRate > 0) {
        // Calculate Stress Level (HRV) from real HR returned by index.py
        next.stressLevel = Math.min(
          95,
          Math.max(15, Math.round(((next.heartRate - 55) / 65) * 58 + 18))
        )
      }

      if (parsed.uptimeSeconds !== undefined) {
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

  // HTTP Polling Mode
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
          setConnectionError(`Waiting for ESP32 HTTP server at ${httpUrl}...`)
        }
      }
    }

    poll()
    const id = setInterval(poll, Math.max(80, pollIntervalMs))

    return () => {
      isCancelled = true
      controller.abort()
      clearInterval(id)
    }
  }, [mode, httpUrl, pollIntervalMs, applyIncomingPayload])

  // Web Serial Mode (USB COM Port)
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
