'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  premiumMediaStyle,
  type PremiumMediaTransform,
} from '@/lib/premium-studio';

type Props = {
  kind: 'avatar' | 'banner';
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
  const [imageFailed, setImageFailed] = useState(false);
  const avatar = kind === 'avatar';

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

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

    /*
     * Moving the picture to the right reveals more of its left side, so the
     * focal point moves in the opposite direction. Keeping the values as
     * percentages makes the crop resolution-independent and cheap to store.
     */
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

  const imageStyle = premiumMediaStyle(value) as CSSProperties;

  return (
    <div className={`premium-media-crop ${avatar ? 'is-avatar' : 'is-banner'}`}>
      <div className="premium-media-crop__head">
        <span>
          <strong>{avatar ? 'Кадрирование аватара' : 'Подгонка баннера'}</strong>
          <small>{avatar
            ? 'Квадрат показывает реальный кадр аватара. Перетаскивай изображение и меняй масштаб.'
            : 'Широкая рамка повторяет баннер профиля. Перетаскивай изображение, чтобы важная часть оставалась в видимой области.'}</small>
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
        className={`premium-media-crop__surface ${imageFailed ? 'is-image-error' : ''}`}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="application"
        aria-label={avatar ? 'Кадрирование аватара' : 'Подгонка баннера'}
      >
        <img
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={imageStyle}
          onLoad={() => setImageFailed(false)}
          onError={() => setImageFailed(true)}
        />
        {imageFailed && (
          <span className="premium-media-crop__error" role="status">
            Не удалось открыть изображение. Выбери файл заново.
          </span>
        )}
        <div className="premium-media-crop__guide" aria-hidden="true" />
        <span className="premium-media-crop__hint" aria-hidden="true">
          {avatar ? 'Перетащи для кадрирования' : 'Перетащи для подгонки'}
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
