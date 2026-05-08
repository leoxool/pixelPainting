'use client';

import React from 'react';

type Stage = 'single' | 'group' | 'render';

interface TopBarProps {
  currentStage: Stage;
  onStageChange: (stage: Stage) => void;
}

const stageIcons: { stage: Stage; icon: string; title: string }[] = [
  {
    stage: 'single',
    title: '单个笔刷',
    icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  },
  {
    stage: 'group',
    title: '笔刷组',
    icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12 0a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  },
  {
    stage: 'render',
    title: '渲染输出',
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
];

export function TopBar({ currentStage, onStageChange }: TopBarProps) {
  return (
    <div className="flex items-center gap-1">
      {stageIcons.map((s) => {
        const isActive = currentStage === s.stage;
        return (
          <button
            key={s.stage}
            onClick={() => onStageChange(s.stage)}
            className={`p-2 rounded-lg transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
            title={s.title}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}