'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Room } from '@/lib/supabase/types';

export default function TeacherPage() {
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      // Try getUser() first, fall back to getSession() if network fails
      let userObj = null;
      const { data: userData, error } = await supabase.auth.getUser();
      if (userData?.user) {
        userObj = userData.user;
      } else {
        // getUser() failed (network error), try getSession() as fallback
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.user) {
          userObj = sessionData.user;
        }
      }
      if (!userObj) {
        router.push('/login');
        return;
      }
      setUser({ email: userObj.email || '', id: userObj.id });
      fetchRooms();
    };
    getUser();
  }, [supabase, router]);

  const fetchRooms = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    setRooms(data || []);
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除此教室吗？此操作不可恢复。')) {
      return;
    }

    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId);

    if (error) {
      console.error('Error deleting room:', error);
      alert('删除失败');
      return;
    }

    fetchRooms();
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !user) return;

    setIsCreating(true);
    setError('');

    const { data: room, error: createError } = await supabase
      .from('rooms')
      .insert({
        teacher_id: user.id,
        name: roomName.trim(),
        config: {
          gridWidth: 150,
          gridHeight: 100,
          sourceType: 'webcam',
        },
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating room:', createError);
      setError(`创建失败: ${createError.message}`);
      setIsCreating(false);
      return;
    }

    await supabase.from('room_members').insert({
      room_id: room.id,
      user_id: user.id,
      role: 'teacher',
    } as any);

    router.push(`/teacher/${room.id}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <header className="flex h-[60px] items-center justify-between px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold leading-none text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
            教师工作台
          </h1>
          <p className="text-[13px] text-[#71717a]" style={{ fontFamily: 'Inter, sans-serif' }}>
            {user ? user.email : 'Loading...'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="h-9 w-[100px] rounded-lg border border-[#3f3f46] text-[13px] font-medium text-[#fafafa] hover:opacity-80 transition-opacity"
          style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
        >
          登出
        </button>
      </header>

      {/* Body */}
      <div className="px-8 pb-8">
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Cards Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Create Room Card */}
          <div className="flex h-[280px] flex-col gap-4 rounded-xl bg-[#0A0A0A] p-6">
            <h2 className="text-[18px] font-semibold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              新建教室
            </h2>
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-3">
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="教室名称"
                maxLength={30}
                required
                className="h-11 rounded-lg bg-[#1A1A1A] px-4 text-[#fafafa] placeholder-[#52525b]"
              />
              <button
                type="submit"
                disabled={isCreating || !roomName.trim()}
                className="h-11 rounded-lg bg-[#cb1b1b] text-sm font-medium text-[#fafafa] hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
              >
                {isCreating ? '创建中...' : '确定'}
              </button>
            </form>
          </div>

          {/* Rooms Card */}
          <div className="flex h-[280px] flex-col gap-4 rounded-xl bg-[#0A0A0A] p-6">
            <h2 className="text-[18px] font-semibold text-[#fafafa]" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              已建教室
            </h2>
            {rooms.length > 0 ? (
              <div className="flex-1 space-y-2 overflow-y-auto">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex h-14 items-center justify-between rounded-lg bg-[#1A1A1A] p-3 transition-colors hover:bg-[#27272a]"
                  >
                    <Link
                      href={`/teacher/${room.id}`}
                      className="flex flex-1 flex-col gap-1"
                    >
                      <span className="font-medium text-[#fafafa] text-sm">
                        {room.name || 'Untitled Room'}
                      </span>
                      <span className="text-xs text-[#71717a]">
                        Code: {room.join_code}
                      </span>
                    </Link>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDeleteRoom(room.id, e)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors"
                        title="删除教室"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-[#71717a]">
                暂无教室
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
