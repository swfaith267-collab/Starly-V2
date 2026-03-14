export type Role = 'user' | 'model';

export interface Message {
  role: Role;
  text: string;
  timestamp: number;
}

export interface UserProfile {
  name: string;
  background: string;
  preferences: string;
}
