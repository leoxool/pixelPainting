'use client';

import { TeacherParticleCanvas } from '../TeacherParticleCanvas';
import { SettingsPanel } from './SettingsPanel';

interface RenderOutputPanelProps {
  isWebcamActive: boolean;
  sourceAspectRatio: number;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  transform: { scale: number; x: number; y: number };
  setTransform: (t: { scale: number; x: number; y: number }) => void;
  resetTransform: () => void;
  isPanning: boolean;
  sourceResolution: { width: number; height: number };
  gridSizeX: number;
  gridSizeY: number;
  brushLayers: (BrushLayer | null)[];
  sourceCanvas: HTMLCanvasElement | null;
  sizeJitter: number;
  rotationJitter: number;
  enableFlip: boolean;
  enableMergeOptimization: boolean;
  canvasBackgroundColor: string;
  gridSamplingSize: number;
  setGridSamplingSize: (v: number) => void;
  setSizeJitter: (v: number) => void;
  setRotationJitter: (v: number) => void;
  setEnableFlip: (v: boolean) => void;
  setEnableMergeOptimization: (v: boolean) => void;
  setCanvasBackgroundColor: (v: string) => void;
  renderTrigger: number;
  outputCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  showSettingsPanel: boolean;
  setShowSettingsPanel: (v: boolean) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  renderArt: () => void;
}

interface BrushLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isDrawing: boolean;
}

export function RenderOutputPanel({
  isWebcamActive,
  sourceAspectRatio,
  isFullscreen,
  setIsFullscreen,
  transform,
  setTransform,
  resetTransform,
  isPanning,
  sourceResolution,
  gridSizeX,
  gridSizeY,
  brushLayers,
  sourceCanvas,
  sizeJitter,
  rotationJitter,
  enableFlip,
  enableMergeOptimization,
  canvasBackgroundColor,
  gridSamplingSize,
  setGridSamplingSize,
  setSizeJitter,
  setRotationJitter,
  setEnableFlip,
  setEnableMergeOptimization,
  setCanvasBackgroundColor,
  renderTrigger,
  outputCanvasRef,
  showSettingsPanel,
  setShowSettingsPanel,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  renderArt,
}: RenderOutputPanelProps) {
  return (
    <div className="flex-1 flex flex-col p-3">
      {/* Output status + fullscreen */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-zinc-500">
          {isWebcamActive ? '实时' : '静止'} · {sourceAspectRatio >= 1 ? '横版' : '竖版'}
        </span>
        {!isFullscreen && (
          <button
            onClick={() => { setIsFullscreen(true); resetTransform(); }}
            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
            </svg>
            全屏
          </button>
        )}
      </div>

      {/* Output Canvas Container - WebGL */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Canvas wrapper with transform */}
        <div
          className={`rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-40 flex items-center justify-center' : 'max-w-[600px] w-full h-auto bg-white'}`}
          style={isFullscreen ? { cursor: isPanning ? 'grabbing' : 'grab', backgroundColor: '#ececec' } : { aspectRatio: sourceAspectRatio }}
        >
          <div
            style={{
              transform: isFullscreen ? `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` : 'none',
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out'
            }}
          >
            <TeacherParticleCanvas
              sourceWidth={sourceResolution.width}
              sourceHeight={sourceResolution.height}
              gridSizeX={gridSizeX}
              gridSizeY={gridSizeY}
              brushLayers={brushLayers}
              sourceCanvas={sourceCanvas}
              sizeJitter={sizeJitter}
              rotationJitter={rotationJitter}
              enableFlip={enableFlip}
              enableMergeOptimization={enableMergeOptimization}
              backgroundColor={canvasBackgroundColor}
              isFullscreen={isFullscreen}
              transform={transform}
              onTransformChange={setTransform}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              updateTrigger={renderTrigger}
            />
          </div>
        </div>

        {/* Zoom indicator in fullscreen */}
        {isFullscreen && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-zinc-800/80 rounded-lg text-sm">
            滚轮缩放 | 拖拽平移 | 当前缩放: {Math.round(transform.scale * 100)}%
          </div>
        )}

        {/* Floating Settings Panel in fullscreen */}
        {isFullscreen && (
          <div className="fixed top-4 left-4 z-50">
            <button
              onClick={() => setShowSettingsPanel(!showSettingsPanel)}
              className="p-3 bg-zinc-800/80 hover:bg-zinc-700 rounded-lg text-white transition-colors"
              title="设置"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>

            {/* Expandable Settings Panel */}
            {showSettingsPanel && (
              <div className="mt-2 w-72 bg-zinc-800/95 backdrop-blur rounded-lg p-4 shadow-xl border border-zinc-700">
                <h3 className="text-sm font-semibold mb-3 text-zinc-300">采样精度</h3>
                <div className="mb-4">
                  <label className="text-xs text-zinc-400 flex justify-between">
                    <span>网格采样</span>
                    <span>{gridSamplingSize}px</span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="1"
                    value={gridSamplingSize}
                    onChange={(e) => setGridSamplingSize(Number(e.target.value))}
                    className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                    <span>精细</span>
                    <span>粗糙</span>
                  </div>
                </div>

                <h3 className="text-sm font-semibold mb-3 text-zinc-300">笔触效果</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-400 flex justify-between">
                      <span>大小抖动</span>
                      <span>{sizeJitter}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={sizeJitter}
                      onChange={(e) => setSizeJitter(Number(e.target.value))}
                      className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 flex justify-between">
                      <span>旋转抖动</span>
                      <span>{Math.round(rotationJitter)}°</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      step="1"
                      value={rotationJitter}
                      onChange={(e) => setRotationJitter(Number(e.target.value))}
                      className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableFlip}
                      onChange={(e) => setEnableFlip(e.target.checked)}
                      className="w-3 h-3 rounded border-zinc-600"
                    />
                    <span>随机翻转</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMergeOptimization}
                      onChange={(e) => setEnableMergeOptimization(e.target.checked)}
                      className="w-3 h-3 rounded border-zinc-600"
                    />
                    <span>笔触合并优化</span>
                  </label>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-700">
                    <span className="text-xs text-zinc-400">背景色</span>
                    <input
                      type="color"
                      value={canvasBackgroundColor}
                      onChange={(e) => setCanvasBackgroundColor(e.target.value)}
                      className="w-6 h-6 rounded border border-zinc-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen controls - top right, OUTSIDE the canvas container */}
      {isFullscreen && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <button
            onClick={resetTransform}
            className="px-3 py-2 bg-zinc-800/80 hover:bg-zinc-700 rounded-lg text-sm"
          >
            重置
          </button>
          <button
            onClick={() => { setIsFullscreen(false); resetTransform(); }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
            退出
          </button>
        </div>
      )}

      {/* Action buttons - below canvas */}
      {!isFullscreen && (
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={renderArt} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">
            刷新
          </button>
          <button onClick={() => {
            const link = document.createElement('a');
            link.download = 'mosaic-art.png';
            link.href = outputCanvasRef.current?.toDataURL() || '';
            link.click();
          }} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs">
            下载
          </button>
        </div>
      )}
    </div>
  );
}