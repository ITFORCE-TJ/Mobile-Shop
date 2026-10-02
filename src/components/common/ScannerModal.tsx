import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Html5QrcodeShim } from 'html5-qrcode/esm/code-decoder';
import { BaseLoggger } from 'html5-qrcode/esm/core';
import { AlertCircle, ArrowRight, Barcode, Flashlight, FlashlightOff, Focus, X, ZoomIn } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { Dialog } from '../ui/Dialog';
import { soundEffects } from '../../utils/sound';
import { extractImeis, SCAN_HINTS } from '../../services/scanner/imei';
import { cn } from '../../utils/cn';

const CONFIRMATION_WINDOW_MS = 800;
const REQUIRED_MATCHING_FRAMES = 2;
const DECODE_INTERVAL_MS = 60;
// The aiming band is cropped at camera resolution, capped here to bound decode time.
const MAX_DECODE_WIDTH = 1280;
// Shared across remounts: a new camera waits for the previous stream to stop.
let cameraRelease: Promise<void> = Promise.resolve();

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
    const stopCamera = () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (trackRef.current && stream?.getVideoTracks().includes(trackRef.current)) trackRef.current = null;
      if (stream && videoRef.current?.srcObject === stream) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
    stopCameraRef.current = stopCamera;
    scanLockedRef.current = false;
    pendingScanRef.current = { code: '', matches: 0, seenAt: 0 };

    const openCamera = async () => {
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
      stream = await openCamera();
      if (cancelled) { stopCamera(); return; }
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

  const isHolding = scanHint === SCAN_HINTS.hold;

  return (
    <Dialog
      open={isScannerOpen}
      onClose={closeScanner}
      title="Сканирование IMEI"
      subtitle="Наведите камеру на штрих-код устройства"
      maxWidth="sm"
      compact
    >
      <div className="space-y-2.5">
        {/* Camera Viewport */}
        <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full max-h-[210px] overflow-hidden rounded-2xl bg-black border border-border shadow-inner">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />

          {!cameraError && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl"
              style={{
                width: band.width,
                height: band.height,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.52)',
              }}
              aria-hidden="true"
            >
              {/* Subtle inner boundary */}
              <div
                className={cn(
                  'absolute inset-0 rounded-xl border transition-colors duration-200',
                  isHolding ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/20'
                )}
              />

              {/* 4 Precision Corner Guides / Reticles */}
              <div
                className={cn(
                  'absolute -top-[1px] -left-[1px] w-4 h-4 border-t-2 border-l-2 rounded-tl-lg transition-all duration-200',
                  isHolding ? 'border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'border-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                )}
              />
              <div
                className={cn(
                  'absolute -top-[1px] -right-[1px] w-4 h-4 border-t-2 border-r-2 rounded-tr-lg transition-all duration-200',
                  isHolding ? 'border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'border-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                )}
              />
              <div
                className={cn(
                  'absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b-2 border-l-2 rounded-bl-lg transition-all duration-200',
                  isHolding ? 'border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'border-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                )}
              />
              <div
                className={cn(
                  'absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b-2 border-r-2 rounded-br-lg transition-all duration-200',
                  isHolding ? 'border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'border-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                )}
              />

              {/* High-tech Scanning Laser Beam */}
              <div
                className={cn(
                  'scanner-laser-line rounded-full',
                  isHolding
                    ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_14px_3px_rgba(52,211,153,0.95)]'
                    : 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_2px_rgba(34,211,238,0.85)]'
                )}
              />
            </div>
          )}

          {/* Torch toggle button */}
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? 'Выключить фонарик' : 'Включить фонарик'}
              className={cn(
                'absolute top-2.5 right-2.5 z-20 h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 shadow-md cursor-pointer',
                torchOn
                  ? 'bg-amber-400 text-black shadow-amber-500/40 font-bold scale-105'
                  : 'bg-black/50 text-white border border-white/20 hover:bg-black/70'
              )}
            >
              {torchOn ? <FlashlightOff className="w-4 h-4" /> : <Flashlight className="w-4 h-4" />}
            </button>
          )}

          {/* Dynamic live status pill inside video */}
          <div
            className={cn(
              'absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full backdrop-blur-md text-[11px] font-medium transition-all duration-200 pointer-events-none flex items-center gap-1.5 shadow-lg border max-w-[92%] truncate',
              isHolding
                ? 'bg-emerald-600/90 text-white border-emerald-400/50 shadow-emerald-950/50 animate-pulse'
                : scanHint === SCAN_HINTS.notImei
                  ? 'bg-amber-600/90 text-white border-amber-400/50 shadow-amber-950/50'
                  : 'bg-black/70 text-white/95 border-white/20'
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                isHolding
                  ? 'bg-white'
                  : scanHint === SCAN_HINTS.notImei
                    ? 'bg-amber-200'
                    : 'bg-cyan-400 animate-ping'
              )}
            />
            <span className="truncate">{scanHint}</span>
          </div>
        </div>

        {/* Focus / Zoom Controls if supported */}
        {(focusSupported || zoomRange) && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-2.5 py-1 text-xs">
            {focusSupported && (
              <button
                type="button"
                onClick={refocus}
                disabled={isFocusing}
                className="flex shrink-0 items-center gap-1 font-medium text-fg active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Focus className="h-3.5 w-3.5 text-accent" />
                <span>{isFocusing ? 'Фокусирую…' : 'Фокус'}</span>
              </button>
            )}
            {zoomRange && (
              <label className="flex min-w-0 flex-1 items-center gap-1.5 text-fg-muted">
                <ZoomIn className="h-3.5 w-3.5 shrink-0" />
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={zoomValue}
                  onChange={(event) => void changeZoom(Number(event.target.value))}
                  className="min-w-0 flex-1 accent-accent h-1 cursor-pointer"
                  aria-label="Масштаб камеры"
                />
                <span className="w-7 text-right tabular-nums text-[11px] font-mono">{zoomValue.toFixed(1)}×</span>
              </label>
            )}
          </div>
        )}

        {/* Camera Error Message */}
        {cameraError && (
          <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 border border-danger/30 p-2.5 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="leading-tight">{cameraError}</span>
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
          className="flex items-center gap-2 pt-0.5"
        >
          <div className="relative flex-1">
            <Barcode className="w-4 h-4 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Или введите IMEI вручную..."
              className="w-full h-9 pl-8 pr-7 bg-surface-raised border border-border rounded-xl text-xs font-mono text-fg placeholder:font-sans placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
            />
            {manualCode && (
              <button
                type="button"
                onClick={() => setManualCode('')}
                aria-label="Очистить ввод"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 active:scale-90 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="h-9 px-3.5 bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs rounded-xl disabled:opacity-40 transition-all shrink-0 shadow-xs active:scale-95 cursor-pointer flex items-center gap-1"
          >
            <span>Ввести</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </Dialog>
  );
};
