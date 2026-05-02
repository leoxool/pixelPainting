'use client';

// Camera view component for brush capture
interface CameraViewProps {
  cameraStream: MediaStream | null;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  cameraPreviewRef: React.RefObject<HTMLCanvasElement | null>;
  onTakePhoto: () => void;
  onCancel: () => void;
}

export function CameraView({
  cameraStream,
  cameraVideoRef,
  onTakePhoto,
  onCancel,
}: CameraViewProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-[400px] h-[400px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900">
        <video
          ref={cameraVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onTakePhoto} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium">拍摄</button>
        <button onClick={onCancel} className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">取消</button>
      </div>
    </div>
  );
}