export type RoomStatus = 'waiting' | 'active' | 'paused' | 'completed';

export interface RoomConfig {
  gridWidth: number;
  gridHeight: number;
  sourceType: 'webcam' | 'image';
}

export interface Room {
  id: string;
  teacher_id: string;
  name: string;
  join_code: string;
  status: RoomStatus;
  config: RoomConfig;
  created_at: string;
  updated_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'teacher' | 'student';
  nickname?: string;
  joined_at: string;
  profile?: {
    username: string;
    display_name?: string;
  };
}

export interface Profile {
  id: string;
  username: string;
  display_name?: string;
  role: 'teacher' | 'student';
}

export interface AssetMetadata {
  brightness_order?: number[];
  original_dimensions?: { width: number; height: number };
  upload_timestamp?: string;
}

export interface Asset {
  id: string;
  room_id: string;
  student_id: string;
  texture_url: string;
  metadata: AssetMetadata;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: Room;
        Insert: Omit<Room, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Room, 'id' | 'created_at'>>;
      };
      room_members: {
        Row: RoomMember;
        Insert: Omit<RoomMember, 'id' | 'joined_at'> & { id?: string };
        Update: Partial<Omit<RoomMember, 'id' | 'room_id' | 'user_id'>>;
      };
      assets: {
        Row: Asset;
        Insert: Omit<Asset, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Asset, 'id' | 'room_id' | 'student_id' | 'created_at'>>;
      };
    };
    Enums: {
      room_status: RoomStatus;
    };
  };
}
