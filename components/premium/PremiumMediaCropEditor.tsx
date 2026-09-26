'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';

import {
  PROFILE_MEDIA_ASPECT,
  type ProfileMediaKind,
} from '@/lib/profile-media-crop-client';
import {
  premiumMediaStyle,
  type PremiumMediaTransform,
} from '@/lib/premium-studio';

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
  const dragRef = useRef<DragState | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const avatar = kind === 'avatar';

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
      style={{ '--crop-aspect': String(PROFILE_MEDIA_ASPECT[kind]) } as CSSProperties}
    >
      <div className="premium-media-crop__head">
        <span>
          <strong>{avatar ? 'Живое кадрирование аватара' : 'Живая подгонка баннера'}</strong>
          <small>
            {avatar
              ? 'GIF и Animated WebP продолжают двигаться прямо в редакторе. Круг показывает реальный итоговый аватар.'
              : 'Анимированный баннер продолжает двигаться. Позиция и масштаб совпадают с итоговым hero профиля.'}
          </small>
        </span>

        <button
          type="button"
          onClick={() => onChange({ x: 50, y: 50, zoom: 1 })}
        >
          {avatar ? 'Сбросить кадр' : 'Сбросить подгонку'}
        </button>
      </div>

      <div
        ref={surfaceRef}
        className={[
          'premium-media-crop__surface',
          'is-live-media',
          !imageReady && !imageFailed ? 'is-image-loading' : '',
          imageFailed ? 'is-image-error' : '',
        ].filter(Boolean).join(' ')}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="application"
        aria-label={avatar ? 'Живое кадрирование аватара' : 'Живая подгонка баннера'}
      >
        <img
          className="premium-media-crop__live-image"
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          style={premiumMediaStyle(value) as CSSProperties}
          onLoad={() => {
            setImageReady(true);
            setImageFailed(false);
          }}
          onError={() => {
            setImageReady(false);
            setImageFailed(true);
          }}
        />

        {!imageReady && !imageFailed && (
          <span className="premium-media-crop__loading" role="status">
            Готовим живой предпросмотр…
          </span>
        )}

        {imageFailed && (
          <span className="premium-media-crop__error" role="alert">
            Не удалось открыть изображение. Попробуй другой JPG, PNG, WebP или GIF.
          </span>
        )}

        <div className="premium-media-crop__guide" aria-hidden="true" />
        <span className="premium-media-crop__hint" aria-hidden="true">
          {avatar ? 'Перетащи · анимация остаётся живой' : 'Перетащи баннер'}
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
