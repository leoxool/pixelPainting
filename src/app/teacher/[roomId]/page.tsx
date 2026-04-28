export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TeacherRoomClient } from '@/components/teacher/TeacherRoomClient';

interface RoomPageProps {
  params: Promise<{ roomId: string }>;
}

export default async function TeacherRoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  const supabase = await createClient();

  // Try getUser() first, fall back to getSession() if network fails
  const { data: userData, error: userError } = await supabase.auth.getUser();
  let user = userData?.user;

  if (!user && userError) {
    // getUser() failed due to network error, try getSession() as fallback
    const { data: sessionData } = await supabase.auth.getSession();
    user = sessionData?.session?.user ?? null;
  }

  if (!user) {
    redirect('/login');
  }

  // Verify user is the teacher of this room
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room || room.teacher_id !== user.id) {
    redirect('/teacher');
  }

  // Get assets for this room
  const { data: assets } = await supabase
    .from('assets')
    .select('*')
    .eq('room_id', roomId);

  // Get room members (students)
  const { data: members } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('role', 'student');

  return (
    <TeacherRoomClient
      room={room}
      assets={assets || []}
      members={members || []}
    />
  );
}
