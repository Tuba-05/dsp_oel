export const EMPTY_FFT = Array(18).fill(0)

export const DISCONNECTED_TELEMETRY = {
  deviceId: 'Not Connected',
  gatewayStatus: 'Waiting for device...',
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
  deviceId: 'ESP32_ZKP_DEMO',
  gatewayStatus: 'Live Streaming Active & Secure',
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
 * Realistic arterial PPG single-cycle waveform (t in [0, 1))
 */
export function samplePPG(t) {
  const phase = ((t % 1) + 1) % 1
  const sys = Math.exp(-Math.pow((phase - 0.22) / 0.075, 2))
  const dia = 0.34 * Math.exp(-Math.pow((phase - 0.44) / 0.11, 2))
  const tail = 0.08 * Math.exp(-Math.pow((phase - 0.68) / 0.14, 2))
  const foot = -0.12 * Math.exp(-Math.pow((phase - 0.07) / 0.055, 2))
  return sys + dia + tail + foot
}

/**
 * Formats seconds as "02h 45m 12s"
 */
export function formatUptime(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`
}

/**
 * Computes rotated SVG needle polygon points for stressLevel in [0, 100]
 */
export function getStressNeedlePolygon(stressPct) {
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

/**
 * Computes a real 18-bin Discrete Fourier Transform (DFT) magnitude spectrum
 * from the live PPG sample ring buffer (removes DC component first).
 */
export function computeRealFFTFromPPG(samples) {
  const N = samples.length
  if (N < 16) return EMPTY_FFT

  const mean = samples.reduce((acc, v) => acc + v, 0) / N
  const centered = samples.map((v, i) => {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)))
    return (v - mean) * hann
  })

  const numBins = 18
  const magnitudes = []

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
 * Computes a harmonic FFT spectrum from real Heart Rate (BPM) when ESP32 / index.py
 * sends scalar HR/SpO2 instead of raw high-rate ADC samples.
 */
export function computeFFTFromHeartRate(bpm) {
  if (!bpm || bpm <= 0) return EMPTY_FFT
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
 * Normalizes responses from ZKP_Gateway/api/index.py (/api/get-data),
 * ZKP_Gateway/main.c ESP_LOGI Serial lines ("BPM : 72 | SPO2: 98% | RAM: ... | UPTIME: 120 SEC"),
 * or generic JSON/CSV payloads.
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
    } else if (trimmed.includes('BPM') && trimmed.includes('SPO2')) {
      const bpmMatch = trimmed.match(/BPM\s*:\s*(\d+)/i)
      const spo2Match = trimmed.match(/SPO2\s*:\s*(\d+)/i)
      const uptimeMatch = trimmed.match(/UPTIME\s*:\s*(\d+)/i)
      data = {
        device_id: 'ESP32_MAX30102_USB',
        hr: bpmMatch ? Number(bpmMatch[1]) : 0,
        spo2: spo2Match ? Number(spo2Match[1]) : 0,
        uptime: uptimeMatch ? Number(uptimeMatch[1]) : undefined,
        status: 'Live Streaming Active & Secure'
      }
    } else if (trimmed.includes('WAITING FOR') || trimmed.includes('FINGER')) {
      data = {
        hr: 0,
        spo2: 0,
        status: 'Idle - Place Finger on Sensor'
      }
    } else if (trimmed.includes(':')) {
      const obj = {}
      trimmed.split(/[,;|]+/).forEach((pair) => {
        const [k, v] = pair.split(':')
        if (k && v !== undefined) {
          const cleanVal = v.replace(/[%a-zA-Z]/g, '').trim()
          const num = Number(cleanVal)
          obj[k.trim().toLowerCase()] =
            cleanVal !== '' && !Number.isNaN(num) ? num : v.trim()
        }
      })
      data = obj
    } else {
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

  if (typeof data.device_id === 'string') {
    parsed.deviceId = data.device_id
  }
  if (typeof data.status === 'string') {
    parsed.gatewayStatus = data.status
  }

  if (
    data.status === 'Waiting for device...' ||
    data.device_id === 'Not Connected'
  ) {
    parsed.isWaitingForDevice = true
    parsed.heartRate = null
    parsed.spo2 = null
    parsed.spo2Status = 'NO SIGNAL'
    parsed.sqi = 0
    parsed.stressLevel = 0
    parsed.rhythmStatus = 'Waiting for ESP32...'
    parsed.fftSpectrum = EMPTY_FFT
    return parsed
  }

  if (data.status === 'Idle - Place Finger on Sensor') {
    parsed.isIdleFingerOff = true
    parsed.heartRate = 0
    parsed.spo2 = 0
    parsed.spo2Status = 'PLACE FINGER'
    parsed.sqi = 0
    parsed.stressLevel = 0
    parsed.rhythmStatus = 'Place Finger on Sensor'
    parsed.fftSpectrum = EMPTY_FFT
    return parsed
  }

  const hr =
    data.heartRate ?? data.hr ?? data.bpm ?? data.heart_rate ?? data.HeartRate
  if (hr !== undefined && !Number.isNaN(Number(hr))) {
    parsed.heartRate = Math.max(0, Math.round(Number(hr)))
  }

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

  const stress =
    data.stressLevel ?? data.stress ?? data.hrv ?? data.stress_level ?? data.rmssd
  if (stress !== undefined && !Number.isNaN(Number(stress))) {
    parsed.stressLevel = Math.min(100, Math.max(0, Math.round(Number(stress))))
  }

  const sqi =
    data.sqi ?? data.SQI ?? data.signalQuality ?? data.signal_quality ?? data.quality
  if (sqi !== undefined && !Number.isNaN(Number(sqi))) {
    parsed.sqi = Math.min(100, Math.max(0, Math.round(Number(sqi))))
  }

  const rhythm = data.rhythmStatus ?? data.rhythm ?? data.rhythm_status
  if (typeof rhythm === 'string' && rhythm.trim()) {
    parsed.rhythmStatus = rhythm.trim()
  } else if (parsed.heartRate !== undefined) {
    if (parsed.heartRate === 0) parsed.rhythmStatus = 'No Finger Detected'
    else if (parsed.heartRate > 100) parsed.rhythmStatus = 'Sinus Tachycardia'
    else if (parsed.heartRate < 60) parsed.rhythmStatus = 'Sinus Bradycardia'
    else parsed.rhythmStatus = 'Normal Sinus'
  }

  const fft = data.fftSpectrum ?? data.fft ?? data.spectrum ?? data.fft_bins
  if (Array.isArray(fft) && fft.length > 0) {
    const nums = fft.map((v) => Number(v) || 0)
    const maxVal = Math.max(...nums, 0)
    if (maxVal === 0) {
      parsed.fftSpectrum = EMPTY_FFT
    } else {
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
  }

  const uptime =
    data.uptimeSeconds ??
    data.uptime ??
    (data.millis !== undefined ? Math.floor(Number(data.millis) / 1000) : undefined)
  if (uptime !== undefined && !Number.isNaN(Number(uptime))) {
    parsed.uptimeSeconds = Math.max(0, Math.floor(Number(uptime)))
  }

  const rawPpg =
    data.ppg ?? data.waveform ?? data.ir ?? data.raw ?? data.samples ?? data.adc
  if (Array.isArray(rawPpg) && rawPpg.length > 0) {
    parsed.ppgSamples = rawPpg
      .map((n) => Number(n))
      .filter((n) => !Number.isNaN(n))
  } else if (
    rawPpg !== undefined &&
    !Array.isArray(rawPpg) &&
    !Number.isNaN(Number(rawPpg))
  ) {
    parsed.ppgSamples = [Number(rawPpg)]
  }

  return parsed
}

