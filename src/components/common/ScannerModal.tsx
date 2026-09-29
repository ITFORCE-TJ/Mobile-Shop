import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Html5QrcodeShim } from 'html5-qrcode/esm/code-decoder';
import { BaseLoggger } from 'html5-qrcode/esm/core';
import { AlertCircle, Flashlight, FlashlightOff, Focus, ZoomIn } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { Dialog } from '../ui/Dialog';
import { soundEffects } from '../../utils/sound';
import { extractImeis, SCAN_HINTS } from '../../services/scanner/imei';

const CONFIRMATION_WINDOW_MS = 800;
const REQUIRED_MATCHING_FRAMES = 2;
const DECODE_INTERVAL_MS = 60;
// The aiming band is cropped at camera resolution, capped here to bound decode time.
const MAX_DECODE_WIDTH = 1280;
// Shared across remounts: a new camera waits for the previous stream to stop.
let cameraRelease: Promise<void> = Promise.resolve();

// iOS Safari (and a home-screen web app even more so) asks for camera permission again on
// almost every getUserMedia() call once the previous stream was fully stopped. So after a
// scan the stream is parked — detached from the preview but still live — and the next scan
// reuses it without a prompt. It is really released after a short idle period, or as soon
// as the app goes to the background, so the camera is never held longer than needed.
const CAMERA_KEEPALIVE_MS = 120_000;
let parkedStream: MediaStream | null = null;
let parkedReleaseTimer = 0;

function releaseParkedStream() {
  window.clearTimeout(parkedReleaseTimer);
  parkedStream?.getTracks().forEach((track) => track.stop());
  parkedStream = null;
}

function parkStream(stream: MediaStream) {
  if (parkedStream && parkedStream !== stream) releaseParkedStream();
  const live = stream.getVideoTracks().some((track) => track.readyState === 'live');
  if (!live) { stream.getTracks().forEach((track) => track.stop()); return; }
  parkedStream = stream;
  window.clearTimeout(parkedReleaseTimer);
  parkedReleaseTimer = window.setTimeout(releaseParkedStream, CAMERA_KEEPALIVE_MS);
}

function takeParkedStream(): MediaStream | null {
  const stream = parkedStream;
  parkedStream = null;
  window.clearTimeout(parkedReleaseTimer);
  if (stream && stream.getVideoTracks().some((track) => track.readyState === 'live')) return stream;
  stream?.getTracks().forEach((track) => track.stop());
  return null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseParkedStream(); });
  window.addEventListener('pagehide', releaseParkedStream);
}

type BarcodeCameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
};

type BarcodeCameraConstraint = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
  zoom?: number;
};

type BarcodeCameraSettings = MediaTrackSettings & {
  zoom?: number;
};

type ZoomRange = {
  min: number;
  max: number;
  step: number;
};

// IMEI labels are Code 128 (occasionally Code 39); some brands add a QR/DataMatrix with
// both IMEIs. EAN/ITF can never hold a 15-digit IMEI, so they aren't decoded at all —
// fewer symbologies also means less per-frame work and faster recognition.
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

/** Aiming band in CSS pixels of the preview: narrow enough to isolate IMEI 1 from IMEI 2. */
function aimingBand(previewWidth: number) {
  const width = Math.min(420, previewWidth * 0.88);
  return { width, height: Math.min(130, Math.max(70, width * 0.3)) };
}

/**
 * The single scanner surface for the whole app — every page's "Сканировать" button calls
 * openScanner(callback) from AppContext, which just flips isScannerOpen/scannerCallback.
 *
 * The camera loop is our own rather than html5-qrcode's: that one shrinks the scan box to
 * its on-screen size (~340px on a phone) before decoding, which merges the thin bars of a
 * 15-digit IMEI barcode. Here the band under the aiming frame is cropped from the camera
 * frame at full resolution and handed to the same html5-qrcode decoder (ZXing, or the
 * browser's BarcodeDetector where available).
 */
export const ScannerModal: React.FC = () => {
  const { isScannerOpen, scannerCallback, closeScanner } = useAppFields('isScannerOpen', 'scannerCallback', 'closeScanner');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopCameraRef = useRef<() => void>(() => {});
  const pendingScanRef = useRef({ code: '', matches: 0, seenAt: 0 });
  const scanLockedRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [focusSupported, setFocusSupported] = useState(false);
  const [isFocusing, setIsFocusing] = useState(false);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoomValue, setZoomValue] = useState(1);
  const [scanHint, setScanHint] = useState(SCAN_HINTS.aim);
  const [manualCode, setManualCode] = useState('');
  const [band, setBand] = useState(() => aimingBand(340));

  const resolveScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || scanLockedRef.current) return;
    scanLockedRef.current = true;
    // Release the camera before delivering the code or waiting for React cleanup.
    stopCameraRef.current();
    soundEffects.playAddToCartSuccess();
    try {
      scannerCallback?.(trimmed);
    } finally {
      closeScanner();
    }
  };

  // Camera scans accept IMEIs only (15 digits, valid check digit); anything else on the box
  // is ignored with a hint. The manual field below stays free-form (e.g. receipt numbers).
  const confirmScan = (decodedText: string) => {
    if (scanLockedRef.current) return;
    const imeis = extractImeis(decodedText);
    if (imeis.length === 0) {
      setScanHint(SCAN_HINTS.notImei);
      return;
    }
    // A QR/DataMatrix listing both IMEIs yields IMEI 1.
    const code = imeis[0];

    const now = Date.now();
    const pending = pendingScanRef.current;
    if (pending.code === code && now - pending.seenAt <= CONFIRMATION_WINDOW_MS) {
      pending.matches += 1;
      pending.seenAt = now;
    } else {
      pendingScanRef.current = { code, matches: 1, seenAt: now };
      setScanHint(SCAN_HINTS.hold);
    }

    if (pendingScanRef.current.matches >= REQUIRED_MATCHING_FRAMES) {
      resolveScan(code);
    }
  };

  const applyConstraint = (constraint: BarcodeCameraConstraint) =>
    trackRef.current?.applyConstraints({ advanced: [constraint] }) ?? Promise.resolve();

  const toggleTorch = async () => {
    const next = !torchOn;
    try {
      await applyConstraint({ torch: next });
      setTorchOn(next);
    } catch {
      // Some devices report torch capability but reject the constraint — ignore.
    }
  };

  const changeZoom = async (value: number) => {
    if (!zoomRange) return;
    const next = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
    setZoomValue(next);
    try {
      await applyConstraint({ zoom: next });
    } catch {
      // Capability reporting differs across Android browsers; keep scanning.
    }
  };

  const refocus = async () => {
    const track = trackRef.current;
    if (!track || isFocusing) return;
    setIsFocusing(true);
    try {
      const modes = (track.getCapabilities?.() as BarcodeCameraCapabilities | undefined)?.focusMode ?? [];
      const requestedMode = modes.includes('single-shot') ? 'single-shot' : 'continuous';
      await applyConstraint({ focusMode: requestedMode });
      if (requestedMode === 'single-shot' && modes.includes('continuous')) {
        window.setTimeout(() => {
          if (trackRef.current === track) applyConstraint({ focusMode: 'continuous' }).catch(() => {});
        }, 700);
      }
    } catch {
      // Refocus is an enhancement; unsupported devices continue normally.
    } finally {
      window.setTimeout(() => setIsFocusing(false), 450);
    }
  };

  useEffect(() => {
    if (!isScannerOpen) {
      setCameraError(null);
      setTorchSupported(false);
      setTorchOn(false);
      setFocusSupported(false);
      setIsFocusing(false);
      setZoomRange(null);
      setZoomValue(1);
      setScanHint(SCAN_HINTS.aim);
      setManualCode('');
      return;
    }

    let cancelled = false;
    let timer = 0;
    let stream: MediaStream | null = null;
    // Detaches the camera from this scanner session and parks the stream for reuse (see
    // parkStream). Safe to call more than once: only the first call parks it.
    const stopCamera = () => {
      cancelled = true;
      window.clearTimeout(timer);
      const current = stream;
      stream = null;
      if (!current) return;
      const track = current.getVideoTracks()[0];
      if (track && trackRef.current === track) trackRef.current = null;
      // A lit torch must not stay on while the stream is parked.
      track?.applyConstraints({ advanced: [{ torch: false } as BarcodeCameraConstraint] }).catch(() => {});
      if (videoRef.current?.srcObject === current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      parkStream(current);
    };
    stopCameraRef.current = stopCamera;
    scanLockedRef.current = false;
    pendingScanRef.current = { code: '', matches: 0, seenAt: 0 };

    const openCamera = async () => {
      const reused = takeParkedStream();
      if (reused) return reused;
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera API'), { name: 'NotFoundError' });
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' } as BarcodeCameraConstraint],
          },
        });
      } catch (error) {
        const name = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
        if (name === 'NotAllowedError' || name === 'NotFoundError') throw error;
        // Over-constrained or odd devices: any camera beats none.
        return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
    };

    const decoder = new Html5QrcodeShim(SUPPORTED_FORMATS, true, false, new BaseLoggger(false));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const decodeLoop = async () => {
      const video = videoRef.current;
      if (cancelled) return;
      if (video && context && video.readyState >= 2 && video.videoWidth && video.clientWidth) {
        // Map the on-screen aiming band (video is object-cover) back to camera pixels.
        const { videoWidth: vw, videoHeight: vh, clientWidth: cw, clientHeight: ch } = video;
        const scale = Math.max(cw / vw, ch / vh);
        const { width, height } = aimingBand(cw);
        // Whole-pixel crop, copied 1:1 without smoothing: a fractional offset makes the
        // browser resample the frame, which blurs 1–2px bars enough that ZXing misses them.
        const cropW = Math.round(Math.min(vw, width / scale));
        const cropH = Math.round(Math.min(vh, height / scale));
        const outScale = Math.min(1, MAX_DECODE_WIDTH / cropW);
        canvas.width = Math.round(cropW * outScale);
        canvas.height = Math.round(cropH * outScale);
        context.imageSmoothingEnabled = outScale < 1;
        context.drawImage(video, Math.floor((vw - cropW) / 2), Math.floor((vh - cropH) / 2), cropW, cropH, 0, 0, canvas.width, canvas.height);
        try {
          const result = await decoder.decodeAsync(canvas);
          if (!cancelled) confirmScan(result.text);
        } catch {
          // Per-frame "nothing decoded yet" — not an error.
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void decodeLoop(), DECODE_INTERVAL_MS);
    };

    const startPromise = cameraRelease.then(async () => {
      if (cancelled) return;
      const opened = await openCamera();
      if (cancelled) { parkStream(opened); return; }
      stream = opened;
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (cancelled) return;
      setBand(aimingBand(video.clientWidth || 340));
      void decodeLoop();

      try {
        const capabilities = (track?.getCapabilities?.() ?? {}) as BarcodeCameraCapabilities;
        setTorchSupported(!!capabilities.torch);
        const modes = capabilities.focusMode ?? [];
        setFocusSupported(modes.includes('continuous') || modes.includes('single-shot'));
        if (modes.includes('continuous')) applyConstraint({ focusMode: 'continuous' }).catch(() => {});

        const zoom = capabilities.zoom;
        if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min) {
          const range = { min: zoom.min, max: zoom.max, step: zoom.step && zoom.step > 0 ? zoom.step : 0.1 };
          const currentZoom = (track?.getSettings() as BarcodeCameraSettings | undefined)?.zoom;
          // A little zoom lets the phone stay far enough away to focus on the thin bars.
          const preferredZoom = Math.min(range.max, Math.max(range.min, Math.max(currentZoom ?? range.min, 1.5)));
          setZoomRange(range);
          setZoomValue(preferredZoom);
          await applyConstraint({ zoom: preferredZoom }).catch(() => {});
        }
      } catch {
        setTorchSupported(false);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        const errorName = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
        setCameraError(
          errorName === 'NotAllowedError'
            ? 'Доступ к камере запрещён. Разрешите использование камеры в настройках браузера.'
            : errorName === 'NotFoundError'
              ? 'Камера не найдена на этом устройстве.'
              : 'Не удалось запустить камеру. Закройте другие приложения, использующие камеру, и попробуйте снова.'
        );
      }
    });

    return () => {
      stopCamera();
      cameraRelease = startPromise.then(stopCamera);
    };
  }, [isScannerOpen]);

  return (
    <Dialog
      open={isScannerOpen}
      onClose={closeScanner}
      title="Сканирование IMEI"
      subtitle="Наведите на IMEI — после распознавания камера закроется"
      maxWidth="sm"
    >
      <div className="space-y-3">
        <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
          {!cameraError && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-accent"
              style={{ width: band.width, height: band.height }}
              aria-hidden="true"
            >
              <div className="absolute left-[6%] right-[6%] top-1/2 h-0.5 -translate-y-1/2 bg-red-500" />
            </div>
          )}
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? 'Выключить фонарик' : 'Включить фонарик'}
              className="absolute top-2 right-2 w-9 h-9 rounded-lg bg-black/60 text-white flex items-center justify-center backdrop-blur-sm active:scale-95 transition-transform"
            >
              {torchOn ? <FlashlightOff className="w-4.5 h-4.5" /> : <Flashlight className="w-4.5 h-4.5" />}
            </button>
          )}
        </div>
        {(focusSupported || zoomRange) && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
            {focusSupported && (
              <button
                type="button"
                onClick={refocus}
                disabled={isFocusing}
                className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-fg active:scale-95 disabled:opacity-50"
              >
                <Focus className="h-4 w-4" />
                {isFocusing ? 'Фокусирую…' : 'Фокус'}
              </button>
            )}
            {zoomRange && (
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-fg-muted">
                <ZoomIn className="h-4 w-4 shrink-0" />
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={zoomValue}
                  onChange={(event) => void changeZoom(Number(event.target.value))}
                  className="min-w-0 flex-1 accent-accent"
                  aria-label="Масштаб камеры"
                />
                <span className="w-8 text-right tabular-nums">{zoomValue.toFixed(1)}×</span>
              </label>
            )}
          </div>
        )}
        <p className="text-xs text-fg-subtle text-center" aria-live="polite">
          {scanHint}
        </p>
        {cameraError && (
          <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 border border-danger/30 p-2.5 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* Manual Barcode / IMEI Input Option */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim()) {
              resolveScan(manualCode.trim());
            }
          }}
          className="flex items-center gap-2 pt-2 border-t border-border"
        >
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Или введите IMEI / штрихкод вручную..."
            className="flex-1 px-3 py-2 bg-surface-raised border border-border rounded-xl text-xs text-fg-muted placeholder-fg-subtle focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="px-3.5 py-2 bg-accent text-accent-fg font-bold text-xs rounded-xl hover:bg-accent-strong disabled:opacity-50 transition-colors shrink-0"
          >
            Готово
          </button>
        </form>
      </div>
    </Dialog>
  );
};
