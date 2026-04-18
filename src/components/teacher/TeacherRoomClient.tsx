'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedMember, setSelectedMember] = useState<RoomMember | null>(null);
  const [onlineMembers, setOnlineMembers] = useState<RoomMember[]>(members);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showStudentPanel, setShowStudentPanel] = useState(true);
  const [studentListCollapsed, setStudentListCollapsed] = useState(false);
  const supabase = createClient();
  const teacherStudioRef = useRef<{ importBrushStrip: (imageUrl: string) => Promise<void>; loadSourceImage: (imageUrl: string) => Promise<void> }>(null);

  // Fetch online members
  const fetchOnlineMembers = useCallback(async () => {
    const { data } = await supabase
      .from('room_members')
      .select('*, profile:user_id(username, display_name)')
      .eq('room_id', room.id);
    if (data) {
      setOnlineMembers(data);
    }
  }, [room.id, supabase]);

  // Initial fetch + subscribe to room_members changes
  useEffect(() => {
    fetchOnlineMembers();

    const channel = supabase
      .channel('room-members')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_members',
        filter: `room_id=eq.${room.id}`
      }, () => {
        fetchOnlineMembers();
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'room_members',
        filter: `room_id=eq.${room.id}`
      }, () => {
        fetchOnlineMembers();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [room.id, supabase, fetchOnlineMembers]);

  // Subscribe to assets changes
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

  const handleImportToBrushSlots = async () => {
    if (!selectedAsset || !teacherStudioRef.current) return;
    try {
      await teacherStudioRef.current.importBrushStrip(selectedAsset.texture_url);
      setSelectedAsset(null);
      alert('笔刷已导入到槽位！');
    } catch (err) {
      console.error('Import error:', err);
      alert('导入失败，请重试');
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#09090b]">
      {/* Top Bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#27272a] bg-[#18181b] px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowStudentPanel(!showStudentPanel)}
            className="flex items-center gap-2 hover:text-[#fafafa] transition-colors"
            title={showStudentPanel ? '隐藏学生列表' : '显示学生列表'}
          >
            <svg className={`h-5 w-5 transition-transform ${showStudentPanel ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
            <h1 className="text-lg font-bold text-[#fafafa]">
              {room.name || 'Untitled Room'}
            </h1>
          </button>
          <span className="rounded bg-[#27272a] px-2 py-1 font-mono text-xs text-[#a1a1aa]">
            {room.join_code}
          </span>
          <span className="text-sm text-[#71717a]">
            {assets.length} 作品
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={leaveRoom}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] transition-colors"
            title="离开"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Body: Student Panel + Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Student List Panel */}
        {showStudentPanel && (
          <div className="w-72 border-r border-[#27272a] bg-[#18181b] overflow-y-auto flex-shrink-0">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#fafafa]">
                  在线学生 ({onlineMembers.length})
                </h3>
                <button
                  onClick={() => setStudentListCollapsed(!studentListCollapsed)}
                  className="p-1 hover:bg-[#27272a] rounded transition-colors"
                  title={studentListCollapsed ? '展开列表' : '折叠列表'}
                >
                  <svg
                    className={`h-4 w-4 text-[#71717a] transition-transform ${studentListCollapsed ? '-rotate-90' : 'rotate-90'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
              {!studentListCollapsed && (
                onlineMembers.length === 0 ? (
                  <p className="text-xs text-[#71717a] text-center py-4">暂无在线学生</p>
                ) : (
                  <div className="space-y-2">
                    {onlineMembers.map((member) => {
                      const studentAssetCount = assets.filter(a => a.student_id === member.user_id).length;
                      const isSelected = selectedStudentId === member.user_id;
                      return (
                        <div key={member.id}>
                          <button
                            onClick={() => setSelectedStudentId(isSelected ? null : member.user_id)}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              isSelected ? 'bg-[#27272a]' : 'hover:bg-[#27272a]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[#fafafa]">
                                  {member.nickname || '未知学生'}{member.profile?.username && ` (@${member.profile.username})`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {studentAssetCount > 0 && (
                                  <span className="text-xs text-blue-400">{studentAssetCount}作品</span>
                                )}
                                <svg
                                  className={`h-4 w-4 text-[#71717a] transition-transform ${isSelected ? 'rotate-90' : ''}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                                </svg>
                              </div>
                            </div>
                          </button>
                          {/* Student's submitted assets */}
                          {isSelected && studentAssetCount > 0 && (
                            <div className="mt-2 ml-2 space-y-2 border-l-2 border-[#27272a] pl-3">
                              {assets.filter(a => a.student_id === member.user_id).map((asset) => (
                                <div key={asset.id} className="p-2 bg-[#27272a] rounded-lg">
                                  <img
                                    src={asset.texture_url}
                                    alt="学生作品"
                                    className="w-full h-6 object-cover rounded border border-[#3f3f46]"
                                  />
                                  <div className="mt-1">
                                    <button
                                      onClick={() => {
                                        setSelectedAsset(asset);
                                        setSelectedMember(member);
                                      }}
                                      className="w-full px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white"
                                    >
                                      详情
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <TeacherStudio ref={teacherStudioRef} />
        </div>
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
              <div className="mt-4 flex items-center gap-3">
                <img
                  src={selectedAsset.texture_url}
                  alt="条带预览"
                  className="h-10 rounded border border-[#27272a]"
                />
                <button
                  onClick={handleImportToBrushSlots}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  导入到笔刷槽
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
