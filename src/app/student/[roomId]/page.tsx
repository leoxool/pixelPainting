'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Room, Asset } from '@/lib/supabase/types';

interface StudentRoomPageProps {
  params: Promise<{ roomId: string }>;
}

export default function StudentRoomPage({ params }: StudentRoomPageProps) {
  const [roomId, setRoomId] = useState<string>('');
  const [room, setRoom] = useState<Room | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [capturedImages, setCapturedImages] = useState<string[]>(Array(10).fill(''));
  const [currentSlot, setCurrentSlot] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState<string>('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>('');
  const [isLeaving, setIsLeaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    params.then((p) => setRoomId(p.roomId));
  }, [params]);

  // Initialize Supabase client
  useEffect(() => {
    supabaseRef.current = createClient();
  }, []);

  const fetchRoomData = useCallback(async () => {
    if (!roomId || !supabaseRef.current) return;
    const supabase = supabaseRef.current;

    // Get room info
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomError || !roomData) {
      alert('房间不存在或已被关闭');
      window.location.href = '/student';
      return;
    }

    setRoom(roomData);
    setSessionStatus(roomData?.status || '');

    // Get existing assets for this student
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: assetData } = await supabase
        .from('assets')
        .select('*')
        .eq('room_id', roomId)
        .eq('student_id', user.id);
      if (assetData && assetData.length > 0) {
        setAssets(assetData);
        setHasSubmitted(true);
      }
    }

    // Initial broadcast URL
    const { data: broadcastData } = supabase.storage
      .from('broadcasts')
      .getPublicUrl(`${roomId}/broadcast.jpg`);
    setBroadcastUrl(`${broadcastData.publicUrl}?t=${Date.now()}`);
  }, [roomId]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error:', err);
    }
  }, []);

  // Subscribe to broadcast updates
  const subscribeToBroadcast = useCallback(() => {
    if (!roomId || !supabaseRef.current) return;
    const supabase = supabaseRef.current;

    const channel = supabase.channel(`broadcast:${roomId}`);

    channel
      .on('broadcast', { event: 'tick' }, (payload) => {
        const timestamp = payload.payload?.timestamp || Date.now();
        setBroadcastUrl(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/broadcasts/${roomId}/broadcast.jpg?t=${timestamp}`
        );
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Subscribe to room deletion (kicked out)
  useEffect(() => {
    if (!roomId || !supabaseRef.current) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel('room-delete-student')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        alert('老师已关闭房间，你已被移出');
        window.location.href = '/student';
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    fetchRoomData();
    startCamera();

    const unsubscribe = subscribeToBroadcast();
    return () => {
      unsubscribe?.();
    };
  }, [roomId, fetchRoomData, startCamera, subscribeToBroadcast]);

  // Restart camera when user clicks "continue submitting"
  useEffect(() => {
    if (!hasSubmitted) {
      startCamera();
    }
  }, [hasSubmitted, startCamera]);

  const leaveRoom = async () => {
    if (!confirm('确定要退出房间吗？')) {
      return;
    }

    setIsLeaving(true);

    if (!supabaseRef.current) return;
    const supabase = supabaseRef.current;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/student';
      return;
    }

    // Stop camera stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    // Remove from room_members
    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user.id);

    window.location.href = '/student';
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = 100;
    canvas.height = 100;
    ctx.drawImage(video, 0, 0, 100, 100);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const newImages = [...capturedImages];
    newImages[currentSlot] = dataUrl;
    setCapturedImages(newImages);

    // Move to next empty slot
    const nextSlot = newImages.findIndex((img, idx) => idx > currentSlot && !img);
    if (nextSlot !== -1) {
      setCurrentSlot(nextSlot);
    } else if (currentSlot < 9) {
      setCurrentSlot(currentSlot + 1);
    }
  };

  const createTextureAtlas = async (): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    for (let i = 0; i < capturedImages.length; i++) {
      if (capturedImages[i]) {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => {
            ctx.drawImage(img, i * 100, 0, 100, 100);
            resolve();
          };
          img.src = capturedImages[i];
        });
      }
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
    });
  };

  const uploadAsset = async () => {
    if (!supabaseRef.current) return;
    const supabase = supabaseRef.current;

    setIsUploading(true);

    const atlas = await createTextureAtlas();
    if (!atlas) {
      alert('Failed to create texture atlas');
      setIsUploading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      alert('Not authenticated');
      setIsUploading(false);
      return;
    }

    const fileName = `${user.id}/${roomId}/${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, atlas, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      alert('Upload failed');
      setIsUploading(false);
      return;
    }

    const { data } = supabase.storage.from('assets').getPublicUrl(fileName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newAsset, error: dbError } = await supabase
      .from('assets')
      .insert({
        room_id: roomId,
        student_id: user.id,
        texture_url: data.publicUrl,
        metadata: {
          brightness_order: [],
          original_dimensions: { width: 1000, height: 100 },
          upload_timestamp: new Date().toISOString(),
        },
      } as any)
      .select()
      .single();

    if (dbError) {
      console.error('DB error:', dbError);
      alert('Failed to save asset record');
      setIsUploading(false);
      return;
    }

    setAssets([...assets, newAsset]);
    setHasSubmitted(true);
    setIsUploading(false);
  };

  const clearSlot = (index: number) => {
    const newImages = [...capturedImages];
    newImages[index] = '';
    setCapturedImages(newImages);
    if (index < currentSlot) {
      setCurrentSlot(index);
    }
  };

  const progress = capturedImages.filter(Boolean).length;

  const resetForNewSubmission = () => {
    setCapturedImages(Array(10).fill(''));
    setCurrentSlot(0);
    setHasSubmitted(false);
  };

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black p-8">
      <main className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
              {room.name || 'Untitled Room'}
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-1">
              Code: <span className="font-mono font-bold">{room.join_code}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`px-3 py-1 text-sm rounded-full ${
                sessionStatus === 'active'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : sessionStatus === 'paused'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {sessionStatus === 'active' ? '进行中' : sessionStatus === 'paused' ? '已暂停' : '等待中'}
            </span>
            <button
              onClick={leaveRoom}
              disabled={isLeaving}
              className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {isLeaving ? 'Leaving...' : 'Leave Room'}
            </button>
          </div>
        </div>

        {hasSubmitted && assets.length > 0 ? (
          // Submitted View
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                已提交 {assets.length} 组作品
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 mt-2">
                你的作品已上传到 Mosaic 中
              </p>
            </div>

            {/* Show all submitted textures */}
            <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
              <h3 className="text-lg font-medium text-black dark:text-zinc-50 mb-3">已提交的作品</h3>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {assets.map((asset, idx) => (
                  <div key={asset.id} className="flex-shrink-0">
                    <img
                      src={asset.texture_url}
                      alt={`作品 ${idx + 1}`}
                      className="w-[200px] h-[20px] object-cover rounded-lg border border-zinc-200 dark:border-zinc-700"
                    />
                    <p className="text-xs text-center text-zinc-500 mt-1">#{idx + 1}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={resetForNewSubmission}
              className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              继续提交作品
            </button>
          </div>
        ) : (
          // Capture View
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Camera / Capture Area */}
            <div className="p-6 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                Capture Brushstrokes
              </h2>

              <div className="relative aspect-square bg-black rounded-lg overflow-hidden mb-4">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                {currentSlot < 10 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <button
                      onClick={captureImage}
                      className="w-16 h-16 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg"
                    >
                      <div className="w-12 h-12 rounded-full border-4 border-gray-400" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Progress: {progress}/10
                </span>
                <div className="w-32 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${(progress / 10) * 100}%` }}
                  />
                </div>
              </div>

              {progress === 10 && (
                <button
                  onClick={uploadAsset}
                  disabled={isUploading}
                  className="w-full mt-4 h-11 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Submit Texture'}
                </button>
              )}
            </div>

            {/* Captured Slots */}
            <div className="p-6 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                Your Texture Strip
              </h2>

              <div className="grid grid-cols-5 gap-2 mb-4">
                {capturedImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => img && clearSlot(idx)}
                    className={`aspect-square rounded-lg border-2 overflow-hidden ${
                      idx === currentSlot
                        ? 'border-blue-500'
                        : 'border-zinc-200 dark:border-zinc-700'
                    } ${!img ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                  >
                    {img ? (
                      <img src={img} alt={`Slot ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-zinc-400">{idx + 1}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Preview Strip */}
              <div className="mt-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">Preview (1000x100)</p>
                <div className="w-full aspect-[10/1] bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                  <div className="w-full h-full grid grid-cols-10">
                    {capturedImages.map((img, idx) => (
                      <div key={idx} className="border-r border-zinc-300 dark:border-zinc-600 last:border-r-0">
                        {img ? (
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-200 dark:bg-zinc-700" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Broadcast Preview */}
        <div className="mt-6 p-6 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
            Live Mosaic Preview
          </h2>
          <div className="aspect-video bg-black rounded-lg flex items-center justify-center overflow-hidden">
            {broadcastUrl ? (
              <img src={broadcastUrl} alt="Live mosaic" className="w-full h-full object-contain" />
            ) : (
              <span className="text-zinc-500">Waiting for teacher broadcast...</span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
