import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export function tokenFromScan(text) {
  const raw = (text || '').trim()
  try {
    const url = new URL(raw)
    const match = url.pathname.match(/\/checkin\/([^/]+)/)
    if (match) return decodeURIComponent(match[1])
  } catch {
    /* not a full URL */
  }
  const pathMatch = raw.match(/checkin\/([^/?#]+)/)
  if (pathMatch) return decodeURIComponent(pathMatch[1])
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw
  return null
}

const scanConfig = { fps: 10, qrbox: { width: 220, height: 220 } }
const NOT_STARTED = 1

function scannerIsOn(scanner) {
  try {
    return scanner.getState() !== NOT_STARTED
  } catch {
    return false
  }
}

function quietStop(scanner) {
  try {
    if (!scanner || !scannerIsOn(scanner)) return Promise.resolve()
    return Promise.resolve(scanner.stop()).catch(() => {})
  } catch {
    return Promise.resolve()
  }
}

function quietClear(scanner) {
  try {
    scanner?.clear()
  } catch {
    /* already gone */
  }
}

function pickCameraIndex(cameras) {
  const back = cameras.findIndex((c) => /back|rear|environment/i.test(c.label))
  return back >= 0 ? back : 0
}

function CameraGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h3.1l1.5-2.2h6.8L16.9 8H20v10.5H4V8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.2" r="3.1" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

export default function QrScanner({ onToken, onError }) {
  const regionId = `qr-reader-${useId().replace(/:/g, '')}`
  const scannerRef = useRef(null)
  const camerasRef = useRef([])
  const indexRef = useRef(0)
  const handledRef = useRef(false)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canSwitch, setCanSwitch] = useState(false)

  onTokenRef.current = onToken
  onErrorRef.current = onError

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current
      scannerRef.current = null
      void quietStop(scanner).finally(() => quietClear(scanner))
    }
  }, [])

  function onDecoded(decoded) {
    const token = tokenFromScan(decoded)
    if (!token || handledRef.current) return
    handledRef.current = true
    const scanner = scannerRef.current
    scannerRef.current = null
    void quietStop(scanner).finally(() => {
      quietClear(scanner)
      onTokenRef.current(token)
    })
  }

  async function startOn(scanner, target) {
    await scanner.start(target, scanConfig, onDecoded)
  }

  async function start() {
    setBusy(true)
    onErrorRef.current?.('')
    handledRef.current = false
    try {
      const scanner = new Html5Qrcode(regionId)
      scannerRef.current = scanner
      let cameras = []
      try {
        cameras = await Html5Qrcode.getCameras()
      } catch {
        cameras = []
      }
      camerasRef.current = cameras
      if (cameras.length) {
        indexRef.current = pickCameraIndex(cameras)
        await startOn(scanner, cameras[indexRef.current].id)
      } else {
        try {
          await startOn(scanner, { facingMode: 'environment' })
        } catch {
          await startOn(scanner, { facingMode: 'user' })
        }
        try {
          camerasRef.current = await Html5Qrcode.getCameras()
        } catch {
          camerasRef.current = []
        }
      }
      setCanSwitch(camerasRef.current.length > 1)
      setRunning(true)
    } catch (err) {
      onErrorRef.current?.(
        err?.message ||
          'Camera did not start. Allow camera access, or use the link instead.',
      )
      setRunning(false)
      setCanSwitch(false)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    const scanner = scannerRef.current
    await quietStop(scanner)
    setRunning(false)
    setCanSwitch(false)
  }

  async function switchCamera() {
    const cameras = camerasRef.current
    const scanner = scannerRef.current
    if (!scanner || cameras.length < 2) return
    setBusy(true)
    try {
      const next = (indexRef.current + 1) % cameras.length
      await quietStop(scanner)
      await startOn(scanner, cameras[next].id)
      indexRef.current = next
      setRunning(true)
    } catch (err) {
      onErrorRef.current?.(err?.message || 'Could not switch camera.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scanner">
      <div
        id={regionId}
        className={`scanner-view${busy || running ? ' is-on' : ''}`}
      />
      <div className="scanner-actions">
        {!running ? (
          <button
            className="primary scanner-cta"
            type="button"
            disabled={busy}
            onClick={start}
          >
            {busy ? (
              'Opening camera…'
            ) : (
              <>
                <CameraGlyph />
                Scan to check in
              </>
            )}
          </button>
        ) : (
          <>
            <button type="button" onClick={stop}>
              Close camera
            </button>
            {canSwitch && (
              <button type="button" disabled={busy} onClick={switchCamera}>
                Switch camera
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
