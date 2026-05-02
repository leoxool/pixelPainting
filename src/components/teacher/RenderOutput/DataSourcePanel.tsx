'use client';

// Data source panel for render output tab
interface DataSourcePanelProps {
  dataSource: 'webcam' | 'image';
  isWebcamActive: boolean;
  sourceAspectRatio: number;
  onDataSourceChange: (source: 'webcam' | 'image') => void;
  onStartWebcam: () => void;
  onStopWebcam: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenBrushLibrary: () => void;
  imageInputRef?: React.RefObject<HTMLInputElement | null>;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export function DataSourcePanel({
  dataSource,
  isWebcamActive,
  sourceAspectRatio,
  onDataSourceChange,
  onStartWebcam,
  onStopWebcam,
  onImageUpload,
  onOpenBrushLibrary,
  imageInputRef,
  videoRef,
}: DataSourcePanelProps) {
  return (
    <div className="flex w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-[#27272a] bg-[#18181b] p-3">
      {/* Data Source */}
      <div>
        <div className="mb-2 flex gap-1">
          <button
            onClick={() => { onDataSourceChange('webcam'); onStartWebcam(); }}
            disabled={isWebcamActive}
            className={`rounded px-2 py-1 text-xs ${dataSource === 'webcam' && isWebcamActive ? 'bg-green-600 text-white' : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'}`}
          >
            摄像头
          </button>
          <button
            onClick={() => { onStopWebcam(); onDataSourceChange('image'); imageInputRef?.current?.click(); }}
            className={`rounded px-2 py-1 text-xs ${dataSource === 'image' ? 'bg-blue-600 text-white' : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'}`}
          >
            载入参考图
          </button>
        </div>
        {/* Hidden file input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={onImageUpload}
          className="hidden"
        />
        <div className="relative w-full bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" style={{ aspectRatio: sourceAspectRatio }}>
          <canvas id="source-display-canvas" className="absolute inset-0 w-full h-full object-contain" />
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity ${dataSource === 'webcam' ? 'opacity-100' : 'opacity-0'}`}
            playsInline
            muted
          />
        </div>
      </div>

      {/* Brush Library Button */}
      <button
        onClick={onOpenBrushLibrary}
        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
        </svg>
        笔刷库
      </button>
    </div>
  );
}