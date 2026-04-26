export type RoomStatus = 'waiting' | 'active' | 'paused' | 'completed';

// Single Brush types
export interface SingleBrush {
  id: string;
  user_id: string;
  name: string;
  category: string;
  image_data: string;  // base64 PNG
  thumbnail_data: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BrushCategory {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

// Brush Group (原有预设概念，10个槽位)
export interface BrushGroup {
  id: string;
  name: string;
  timestamp: number;
  layers: (string | null)[];  // base64 image data for each layer (10 slots)
}

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
      single_brushes: {
        Row: SingleBrush;
        Insert: Omit<SingleBrush, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<SingleBrush, 'id' | 'user_id' | 'created_at'>>;
      };
      brush_categories: {
        Row: BrushCategory;
        Insert: Omit<BrushCategory, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<BrushCategory, 'id' | 'user_id' | 'created_at'>>;
      };
    };
    Enums: {
      room_status: RoomStatus;
    };
  };
}
