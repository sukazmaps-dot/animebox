'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  calculateProfileMediaCropRect,
  PROFILE_MEDIA_ASPECT,
  type ProfileMediaKind,
} from '@/lib/profile-media-crop-client';
import type { PremiumMediaTransform } from '@/lib/premium-studio';

type Props = {
  kind: ProfileMediaKind;
  src: string;
  value: PremiumMediaTransform;
  onChange: (next: PremiumMediaTransform) => void;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export default function PremiumMediaCropEditor({
  kind,
  src,
  value,
  onChange,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const avatar = kind === 'avatar';

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';

    imageRef.current = null;
    setImageReady(false);
    setImageFailed(false);

    image.onload = () => {
      if (cancelled) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        setImageFailed(true);
        return;
      }
      imageRef.current = image;
      setImageReady(true);
    };

    image.onerror = () => {
      if (cancelled) return;
      imageRef.current = null;
      setImageFailed(true);
    };

    image.src = src;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      if (imageRef.current === image) imageRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!surface || !canvas || !image || !imageReady) return;

    const draw = () => {
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      const crop = calculateProfileMediaCropRect(
        image.naturalWidth,
        image.naturalHeight,
        kind,
        value,
      );

      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image,
        crop.left,
        crop.top,
        crop.width,
        crop.height,
        0,
        0,
        pixelWidth,
        pixelHeight,
      );
    };

    draw();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(draw);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [imageReady, kind, value.x, value.y, value.zoom]);

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: value.x,
      startY: value.y,
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const surface = surfaceRef.current;
    if (!drag || !surface || drag.pointerId !== event.pointerId) return;

    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const nextX = clamp(
      drag.startX - ((event.clientX - drag.startClientX) / rect.width) * 100,
      0,
      100,
    );
    const nextY = clamp(
      drag.startY - ((event.clientY - drag.startClientY) / rect.height) * 100,
      0,
      100,
    );

    onChange({
      ...value,
      x: round(nextX),
      y: round(nextY),
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      className={`premium-media-crop ${avatar ? 'is-avatar' : 'is-banner'}`}
      style={{ '--crop-aspect': String(PROFILE_MEDIA_ASPECT[kind]) } as React.CSSProperties}
    >
      <div className="premium-media-crop__head">
        <span>
          <strong>{avatar ? 'Кадрирование аватара' : 'Кадрирование баннера'}</strong>
          <small>
            {avatar
              ? 'То, что видно внутри рамки, пиксель-в-пиксель попадёт в итоговый аватар.'
              : 'Рамка повторяет мобильный баннер AnimeBox. Никакого растягивания: изображение только кадрируется и масштабируется.'}
          </small>
        </span>
        <button
          type="button"
          onClick={() => onChange({ x: 50, y: 50, zoom: 1 })}
        >
          {avatar ? 'Сбросить кадр' : 'Сбросить кадрирование'}
        </button>
      </div>

      <div
        ref={surfaceRef}
        className={[
          'premium-media-crop__surface',
          !imageReady && !imageFailed ? 'is-image-loading' : '',
          imageFailed ? 'is-image-error' : '',
        ].filter(Boolean).join(' ')}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="application"
        aria-label={avatar ? 'Кадрирование аватара' : 'Кадрирование баннера'}
      >
        <canvas ref={canvasRef} aria-hidden="true" />

        {!imageReady && !imageFailed && (
          <span className="premium-media-crop__loading" role="status">
            Готовим предпросмотр…
          </span>
        )}

        {imageFailed && (
          <span className="premium-media-crop__error" role="alert">
            Не удалось открыть изображение. Попробуй другой JPG, PNG или WebP.
          </span>
        )}

        <div className="premium-media-crop__guide" aria-hidden="true" />
        <span className="premium-media-crop__hint" aria-hidden="true">
          {avatar ? 'Перетащи для кадрирования' : 'Перетащи изображение'}
        </span>
      </div>

      <label className="premium-media-crop__zoom">
        <span>
          <strong>Масштаб</strong>
          <small>{Math.round(value.zoom * 100)}%</small>
        </span>
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={value.zoom}
          onChange={(event) =>
            onChange({
              ...value,
              zoom: round(clamp(Number(event.target.value), 1, 3), 2),
            })
          }
        />
      </label>
    </div>
  );
}
