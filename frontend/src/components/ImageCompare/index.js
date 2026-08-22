'use client';

import { useCallback, useRef, useState } from 'react';

const KEYBOARD_STEP = 5;

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

/**
 * Iki uydu goruntusunu ust uste koyup aralarinda surukleneblir bir ayirac gosterir.
 * Sol taraf "onceki", sag taraf "sonraki" goruntuyu acar.
 *
 * Ust uste soluk/net karisim yerine bu yontem secildi: harmanlanmis bilesikte
 * hangi detayin hangi yila ait oldugu secilemiyordu.
 */
export default function ImageCompare({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
  children,
  onError,
}) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = useCallback((clientX) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;

    setPosition(clampPercent(((clientX - box.left) / box.width) * 100));
  }, []);

  // Pointer Events tek kod yoluyla fare ve dokunmatigi birlikte karsiliyor
  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateFromPointer(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    updateFromPointer(event.clientX);
  };

  const stopDragging = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPosition((prev) => clampPercent(prev - KEYBOARD_STEP));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPosition((prev) => clampPercent(prev + KEYBOARD_STEP));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setPosition(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setPosition(100);
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      className="relative w-full aspect-square overflow-hidden rounded-2xl select-none touch-none bg-gray-100 dark:bg-gray-700 cursor-ew-resize"
    >
      {/* Sonraki (sag taraf) - altta tam olarak duruyor */}
      <img
        src={afterSrc}
        alt={`${afterLabel} yılı uydu görüntüsü`}
        onError={onError}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Onceki (sol taraf) - ayiraca kadar kirpiliyor */}
      <img
        src={beforeSrc}
        alt={`${beforeLabel} yılı uydu görüntüsü`}
        onError={onError}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />

      {/* Tespit kutulari gibi ustte duracak icerik */}
      {children}

      {/* Yil rozetleri */}
      <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 text-white text-sm font-semibold pointer-events-none">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 text-white text-sm font-semibold pointer-events-none">
        {afterLabel}
      </span>

      {/* Ayirac cizgisi */}
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)] pointer-events-none"
        style={{ left: `${position}%` }}
      />

      {/* Tutamak */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Önce ve sonra görüntülerini karşılaştır"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`%${Math.round(position)} ${beforeLabel}`}
        onKeyDown={handleKeyDown}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-700 font-bold focus:outline-none focus:ring-4 focus:ring-blue-400"
        style={{ left: `${position}%` }}
      >
        <span aria-hidden="true" className="text-xs tracking-tighter">
          ◀▶
        </span>
      </div>
    </div>
  );
}
