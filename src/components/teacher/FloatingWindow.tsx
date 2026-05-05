'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface FloatingWindowProps {
  title: string;
  initialPosition: { x: number; y: number };
  initialSize?: { width: number; height: number };
  children: React.ReactNode;
  onClose: () => void;
  isOpen: boolean;
  className?: string;
  showTitleBar?: boolean;
}

export function FloatingWindow({
  title,
  initialPosition,
  initialSize = { width: 320, height: 400 },
  children,
  onClose,
  isOpen,
  className = '',
  showTitleBar = true,
}: FloatingWindowProps) {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // Z-index management - active window gets highest z-index
  useEffect(() => {
    if (isFocused && windowRef.current) {
      const windows = document.querySelectorAll('[data-floating-window]');
      let maxZ = 0;
      windows.forEach((w) => {
        const z = parseInt(getComputedStyle(w).zIndex || '0', 10);
        if (z > maxZ) maxZ = z;
      });
      windowRef.current.style.zIndex = String(maxZ + 1);
    }
  }, [isFocused]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    setIsDragging(true);
    setIsFocused(true);
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      data-floating-window
      className={`absolute bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 flex flex-col overflow-hidden ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: isFocused ? 40 : 30,
      }}
      onMouseDown={() => setIsFocused(true)}
    >
      {showTitleBar && (
        <div
          className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-700 cursor-move select-none shrink-0"
          onMouseDown={handleMouseDown}
        >
          <span className="text-sm font-medium text-zinc-200">{title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
          >
            <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content - draggable when no title bar */}
      <div
        className="flex-1 overflow-auto cursor-move"
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>
    </div>
  );
}