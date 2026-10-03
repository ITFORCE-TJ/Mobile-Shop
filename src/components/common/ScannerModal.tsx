import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Html5QrcodeShim } from 'html5-qrcode/esm/code-decoder';
import { BaseLoggger } from 'html5-qrcode/esm/core';
import { AlertCircle, ArrowRight, Barcode, Flashlight, FlashlightOff, Focus, X } from 'lucide-react';
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

// IMEI labels are Code 128 (occasionally Code 39); some brands add a QR/DataMatrix with
// both IMEIs. EAN/ITF can never hold a 15-digit IMEI, so they aren't decoded at all —
// fewer symbologies also means less per-frame work and faster recognition.
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

/** Aiming band in CSS pixels of the preview. Generous framing so barcodes anywhere on the box are scanned easily. */
function aimingBand(previewWidth: number, previewHeight?: number) {
  const width = Math.min(440, previewWidth * 0.9);
  const height = Math.min(200, Math.max(120, (previewHeight || 280) * 0.6));
  return { width, height };
}

/**
 * The single scanner surface for the whole app — every page's "Сканировать" button calls
 * openScanner(callback) from AppContext, which just flips isScannerOpen/scannerCallback.
 *
 * Uses browser-native hardware-accelerated BarcodeDetector (Chrome/Android/PWA) for instant
 * full-frame barcode recognition under any angle, with graceful fallback to ZXing.
 */
export const ScannerModal: React.FC = () => {
  const { isScannerOpen, scannerCallback, closeScanner } = useAppFields('isScannerOpen', 'scannerCallback', 'closeScanner');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopCameraRef = useRef<() => void>(() => {});
  const scanLockedRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [focusSupported, setFocusSupported] = useState(false);
  const [isFocusing, setIsFocusing] = useState(false);
  const [scanHint, setScanHint] = useState(SCAN_HINTS.aim);
  const [manualCode, setManualCode] = useState('');
  const [band, setBand] = useState(() => aimingBand(340, 260));

  const resolveScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || scanLockedRef.current) return;
    scanLockedRef.current = true;
    // Release the camera before delivering the code or waiting for React cleanup.
    stopCameraRef.current();
    soundEffects.playAddToCartSuccess();
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([40, 30, 40]);
      }
    } catch {
      // Haptics not available
    }
    try {
      scannerCallback?.(trimmed);
    } finally {
      closeScanner();
    }
  };

  // Instant recognition for valid barcodes
  const confirmScan = (decodedText: string) => {
    if (scanLockedRef.current) return;
    const imeis = extractImeis(decodedText);
    if (imeis.length === 0) {
      setScanHint(SCAN_HINTS.notImei);
      return;
    }
    const code = imeis[0];
    setScanHint(SCAN_HINTS.hold);
    resolveScan(code);
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

    // Native hardware-accelerated BarcodeDetector (Chrome on Android / PWA)
    type BrowserBarcode = {
      rawValue?: string;
      boundingBox?: DOMRectReadOnly;
      cornerPoints?: { x: number; y: number }[];
    };
    let nativeDetector: { detect: (source: HTMLVideoElement) => Promise<BrowserBarcode[]> } | null = null;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const formats = ['code_128', 'code_39', 'code_93', 'qr_code', 'data_matrix', 'ean_13', 'upc_a'];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nativeDetector = new (window as any).BarcodeDetector({ formats });
      } catch {
        nativeDetector = null;
      }
    }

    const decoder = new Html5QrcodeShim(SUPPORTED_FORMATS, true, false, new BaseLoggger(false));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const decodeLoop = async () => {
      const video = videoRef.current;
      if (cancelled) return;
      if (video && video.readyState >= 2 && video.videoWidth && video.clientWidth) {
        let detected = false;

        // Path 1: Native BarcodeDetector (Instant, full-frame GPU scan on Android Chrome)
        if (nativeDetector) {
          try {
            const barcodes = await nativeDetector.detect(video);
            if (barcodes && barcodes.length > 0) {
              const targetY = (video.videoHeight || video.clientHeight || 400) / 2;
              const targetX = (video.videoWidth || video.clientWidth || 300) / 2;
              const candidates: { code: string; distance: number }[] = [];

              for (const b of barcodes) {
                const imeis = extractImeis(b.rawValue || '');
                for (const imei of imeis) {
                  let centerX = targetX;
                  let centerY = targetY;
                  if (b.boundingBox) {
                    centerX = b.boundingBox.left + b.boundingBox.width / 2;
                    centerY = b.boundingBox.top + b.boundingBox.height / 2;
                  }
                  candidates.push({
                    code: imei,
                    distance: Math.hypot(centerX - targetX, centerY - targetY),
                  });
                }
              }

              if (candidates.length > 0) {
                candidates.sort((a, b) => a.distance - b.distance);
                setScanHint(SCAN_HINTS.hold);
                resolveScan(candidates[0].code);
                detected = true;
              } else {
                setScanHint(SCAN_HINTS.notImei);
              }
            }
          } catch {
            // Native detector busy or failed, fall through to canvas decoder
          }
        }

        // Path 2: Wide-area Canvas fallback (ZXing)
        if (!detected && context) {
          const { videoWidth: vw, videoHeight: vh } = video;
          const cropW = Math.round(vw * 0.92);
          const cropH = Math.round(vh * 0.75);
          const startX = Math.floor((vw - cropW) / 2);
          const startY = Math.floor((vh - cropH) / 2);

          const outScale = Math.min(1, MAX_DECODE_WIDTH / cropW);
          canvas.width = Math.round(cropW * outScale);
          canvas.height = Math.round(cropH * outScale);
          context.imageSmoothingEnabled = outScale < 1;
          context.drawImage(video, startX, startY, cropW, cropH, 0, 0, canvas.width, canvas.height);

          try {
            const result = await decoder.decodeAsync(canvas);
            if (!cancelled && result?.text) {
              confirmScan(result.text);
            }
          } catch {
            // Per-frame "nothing decoded yet" — not an error.
          }
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
      setBand(aimingBand(video.clientWidth || 340, video.clientHeight || 280));
      void decodeLoop();

      try {
        const capabilities = (track?.getCapabilities?.() ?? {}) as BarcodeCameraCapabilities;
        setTorchSupported(!!capabilities.torch);
        const modes = capabilities.focusMode ?? [];
        setFocusSupported(modes.includes('continuous') || modes.includes('single-shot'));

        // Automatic continuous autofocus
        if (modes.includes('continuous')) {
          applyConstraint({ focusMode: 'continuous' }).catch(() => {});
        } else if (modes.includes('single-shot')) {
          applyConstraint({ focusMode: 'single-shot' }).catch(() => {});
        }

        // Lock to 1.0x natural optical zoom (no digital crop blur)
        const zoom = capabilities.zoom;
        if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max)) {
          const naturalZoom = Math.min(zoom.max, Math.max(zoom.min, 1));
          applyConstraint({ zoom: naturalZoom }).catch(() => {});
        }

        // Automatic initial focus pulse after sensor warmup to lock onto nearby barcodes
        window.setTimeout(() => {
          if (!cancelled && trackRef.current === track) {
            void refocus();
          }
        }, 500);
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
        {/* Camera Viewport with Tap-to-Focus */}
        <div
          onClick={refocus}
          className="relative aspect-[4/3] sm:aspect-[16/9] w-full min-h-[250px] max-h-[300px] overflow-hidden rounded-2xl bg-black border border-border shadow-inner cursor-pointer"
          title="Нажмите для фокусировки"
        >
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />

          {/* Tap-to-focus animation ring */}
          {isFocusing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <div className="w-14 h-14 rounded-full border-2 border-accent animate-ping" />
            </div>
          )}

          {!cameraError && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl"
              style={{
                width: band.width,
                height: band.height,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.42)',
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
                  'absolute -top-[1px] -left-[1px] w-5 h-5 border-t-2 border-l-2 rounded-tl-lg transition-all duration-200',
                  isHolding ? 'border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'border-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                )}
              />
              <div
                className={cn(
                  'absolute -top-[1px] -right-[1px] w-5 h-5 border-t-2 border-r-2 rounded-tr-lg transition-all duration-200',
                  isHolding ? 'border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'border-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                )}
              />
              <div
                className={cn(
                  'absolute -bottom-[1px] -left-[1px] w-5 h-5 border-b-2 border-l-2 rounded-bl-lg transition-all duration-200',
                  isHolding ? 'border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'border-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                )}
              />
              <div
                className={cn(
                  'absolute -bottom-[1px] -right-[1px] w-5 h-5 border-b-2 border-r-2 rounded-br-lg transition-all duration-200',
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

          {/* Autofocus trigger overlay (top left) */}
          {focusSupported && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void refocus();
              }}
              aria-label="Автофокус"
              className={cn(
                'absolute top-2.5 left-2.5 z-20 h-8 px-2.5 rounded-full flex items-center gap-1.5 backdrop-blur-md transition-all active:scale-90 shadow-md cursor-pointer text-xs font-semibold',
                isFocusing
                  ? 'bg-accent text-accent-fg shadow-accent/40 font-bold scale-105'
                  : 'bg-black/50 text-white border border-white/20 hover:bg-black/70'
              )}
            >
              <Focus className="w-3.5 h-3.5" />
              <span>{isFocusing ? 'Фокус…' : 'Автофокус'}</span>
            </button>
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
