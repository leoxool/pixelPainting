'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Room } from '@/lib/supabase/types';
import { StudentStudio } from '@/components/student/StudentStudio';

interface StudentRoomPageProps {
  params: Promise<{ roomId: string }>;
}

export default function StudentRoomPage({ params }: StudentRoomPageProps) {
  const [roomId, setRoomId] = useState<string>('');
  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [isLeaving, setIsLeaving] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    params.then((p) => {
      setRoomId(p.roomId);
    });
  }, [params]);

  // Initialize Supabase client and user
  useEffect(() => {
    const getUser = async () => {
      // Try getUser() first, fall back to getSession() if network fails
      let userObj = null;
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        userObj = userData.user;
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          userObj = sessionData.session.user ?? null;
        }
      }
      if (userObj) {
        setUserId(userObj.id);
      }
    };
    getUser();
  }, [supabase]);

  const fetchRoomData = useCallback(async () => {
    if (!roomId) return;

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
    // Load nickname from localStorage
    const savedNickname = localStorage.getItem(`pixel_nickname_${roomId}`);
    if (savedNickname) {
      setNickname(savedNickname);
    }
  }, [roomId, supabase]);

  // Subscribe to room deletion (kicked out)
  useEffect(() => {
    if (!roomId) return;

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
  }, [roomId, supabase]);

  useEffect(() => {
    if (!roomId) return;
    fetchRoomData();
  }, [roomId, fetchRoomData]);

  const leaveRoom = async () => {
    if (!confirm('确定要退出房间吗？')) {
      return;
    }

    setIsLeaving(true);

    // Remove from room_members
    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    window.location.href = '/student';
  };

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#09090b]">
        <p className="text-[#71717a]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[#09090b]">
      {/* Top Bar */}
      <div className="flex h-14 items-center justify-between border-b border-[#27272a] bg-[#18181b] px-4">
        <div>
          <h1 className="text-lg font-bold text-[#fafafa]">
            欢迎 <span style={{ color: '#EF857D' }}>{nickname}</span> 来到 {room.name || 'Untitled Room'}
          </h1>
          <p className="text-xs text-[#71717a]">
            Code: <span className="font-mono">{room.join_code}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={leaveRoom}
            disabled={isLeaving}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] transition-colors"
            title="离开"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {userId && <StudentStudio roomId={roomId} userId={userId} />}
      </div>
    </div>
  );
}
