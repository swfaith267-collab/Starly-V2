export type Role = 'user' | 'model';

export interface Message {
  role: Role;
  text: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

export interface UserProfile {
  name: string;
  background: string;
  preferences: string;
  summary?: string;
  conversations?: Conversation[];
}
