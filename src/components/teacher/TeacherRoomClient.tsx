'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TeacherStudio } from '@/components/teacher/TeacherStudio';
import type { Asset, RoomMember } from '@/lib/supabase/types';

interface Room {
  id: string;
  name: string;
  join_code: string;
  status: string;
  config: {
    gridWidth: number;
    gridHeight: number;
    sourceType: 'webcam' | 'image';
  };
}

interface TeacherRoomClientProps {
  room: Room;
  assets: Asset[];
  members?: RoomMember[];
}

export function TeacherRoomClient({ room, assets: initialAssets, members = [] }: TeacherRoomClientProps) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [isSessionActive, setIsSessionActive] = useState(room.status === 'active');
  const [isClosing, setIsClosing] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedMember, setSelectedMember] = useState<RoomMember | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel('room-assets')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'assets',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        console.log('New asset received:', payload.new);
        setAssets(prev => [...prev, payload.new as Asset]);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'assets',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        setAssets(prev => prev.filter(a => a.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [room.id, supabase]);

  const toggleSession = async () => {
    const newStatus = isSessionActive ? 'paused' : 'active';
    setIsSessionActive(newStatus === 'active');

    await supabase
      .from('rooms')
      .update({ status: newStatus })
      .eq('id', room.id);
  };

  const closeRoom = async () => {
    if (!confirm('确定关闭房间吗？所有学生将被移出。')) {
      return;
    }

    setIsClosing(true);

    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', room.id);

    if (error) {
      console.error('Error closing room:', error);
      alert('关闭房间失败');
      setIsClosing(false);
      return;
    }

    window.location.href = '/teacher';
  };

  const leaveRoom = async () => {
    if (!confirm('离开此房间？')) {
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', room.id)
      .eq('user_id', user.id);

    window.location.href = '/teacher';
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#09090b]">
      {/* Top Bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#27272a] bg-[#18181b] px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-[#fafafa]">
            {room.name || 'Untitled Room'}
          </h1>
          <span className="rounded bg-[#27272a] px-2 py-1 font-mono text-xs text-[#a1a1aa]">
            {room.join_code}
          </span>
          <span className={`rounded px-2 py-1 text-xs font-medium ${
            isSessionActive
              ? 'bg-green-900/50 text-green-400'
              : 'bg-yellow-900/50 text-yellow-400'
          }`}>
            {isSessionActive ? 'Live' : 'Paused'}
          </span>
          <span className="text-sm text-[#71717a]">
            {assets.length} 作品
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSession}
            disabled={isClosing}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              isSessionActive
                ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
            title={isSessionActive ? '暂停' : '开始'}
          >
            {isSessionActive ? (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
          <button
            onClick={leaveRoom}
            disabled={isClosing}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] transition-colors"
            title="离开"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
          </button>
          <button
            onClick={closeRoom}
            disabled={isClosing}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            title="关闭房间"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <TeacherStudio />
      </div>

      {/* Student Submissions Sidebar Toggle */}
      <div className="absolute right-0 top-1/2 z-20 -translate-y-1/2">
        <button
          onClick={() => setSelectedAsset(selectedAsset ? null : assets[0] || null)}
          className="relative flex h-12 w-10 items-center justify-center rounded-l-lg border border-r-0 border-[#27272a] bg-[#18181b] text-[#a1a1aa] hover:bg-[#27272a] transition-colors"
          title="学生作品"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
          </svg>
          {assets.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
              {assets.length}
            </span>
          )}
        </button>
      </div>

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="max-w-4xl overflow-hidden rounded-2xl border border-[#27272a] bg-[#18181b]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#27272a] p-4">
              <div>
                <h3 className="text-lg font-semibold text-[#fafafa]">
                  {selectedMember?.nickname || '学生作品'}
                </h3>
                <p className="text-sm text-[#71717a]">查看细节</p>
              </div>
              <button
                onClick={() => setSelectedAsset(null)}
                className="rounded-lg p-2 text-[#71717a] hover:bg-[#27272a] hover:text-[#fafafa] transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-6">
              <img
                src={selectedAsset.texture_url}
                alt="学生作品"
                className="w-full rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
