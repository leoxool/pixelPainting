'use client';

import React from 'react';

type Stage = 'single' | 'group' | 'render';
type ShortcutKey = Stage | 'fullscreen';

interface ShortcutSidebarProps {
  currentStage: Stage;
  onStageChange: (stage: Stage) => void;
  onFullscreen: () => void;
}

const shortcuts: { key: string; label: string; stage: ShortcutKey; icon: string }[] = [
  { key: '1', label: '单个笔刷', stage: 'single', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
  { key: '2', label: '笔刷组', stage: 'group', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12 0a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { key: '3', label: '渲染输出', stage: 'render', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'F', label: '全屏', stage: 'fullscreen', icon: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4' },
];

export function ShortcutSidebar({ currentStage, onStageChange, onFullscreen }: ShortcutSidebarProps) {
  const handleClick = (stage: ShortcutKey) => {
    if (stage === 'fullscreen') {
      onFullscreen();
    } else {
      onStageChange(stage as Stage);
    }
  };

  return (
    <div className="w-12 bg-zinc-900 border-r border-zinc-700 flex flex-col items-center py-2 gap-1 shrink-0">
      {shortcuts.map((s) => {
        const isActive = s.stage !== 'fullscreen' && currentStage === s.stage;
        return (
          <button
            key={s.key}
            onClick={() => handleClick(s.stage)}
            className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
            title={`${s.label} (${s.key})`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
            </svg>
            <span className="text-[10px] mt-0.5">{s.key}</span>
          </button>
        );
      })}
    </div>
  );
}