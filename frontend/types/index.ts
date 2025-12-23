export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BANNED = 'banned',
}

export interface User {
  id: string;
  email?: string;
  name: string;
  city: string;
  gender: Gender;
  status: UserStatus;
  is_guest: boolean;
  guest_uuid?: string;
  avatar_base64?: string;
  created_at: string;
  online: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ChatMessage {
  message_id: string;
  message: string;
  timestamp: string;
  is_self: boolean;
}

export interface Room {
  room_id: string;
  status: string;
}

export interface WatchRoom {
  id: string;
  host_id: string;
  participants: string[];
  video_url: string;
  current_time: number;
  is_playing: boolean;
}

export interface GameRoom {
  id: string;
  game_type: string;
  host_id: string;
  opponent_id?: string;
  participants: string[];
  game_state: any;
  current_turn?: string;
  status: string;
}
