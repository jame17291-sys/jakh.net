import type { PasswordHasherStub } from "./password-hasher.js";

export interface Env {
  DB: D1Database;
  BATTLE_ROOMS: DurableObjectNamespace<BattleRoomStub>;
  PASSWORD_HASHERS: DurableObjectNamespace<PasswordHasherStub>;
  PASSWORD_PEPPER: string;
  IP_HASH_SALT: string;
  ALLOWED_ORIGINS: string;
  STATIC_ORIGIN: string;
}

export interface BattleRoomStub extends Rpc.DurableObjectBranded {
  fetch(request: Request): Promise<Response>;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  avatar: string;
  role: string;
  tokenHash: string;
}

export interface BattleQuestion {
  id: string;
  question: { en: string; ar: string };
  answer: { en: string; ar: string };
  options: { en: string[]; ar: string[] };
  correctIndex: number;
}

export interface BattlePlayer {
  id: string;
  name: string;
  score: number;
  streak: number;
  isHost: boolean;
}

export interface BattleRoomState {
  code: string;
  category: string;
  difficulty: string;
  hostToken: string;
  players: BattlePlayer[];
  questions: BattleQuestion[];
  currentQ: number;
  phase: "lobby" | "question" | "reveal" | "finished";
  answers: Record<string, { answerIndex: number; timeMs: number }>;
  questionStartTime: number;
  deadline: number;
  createdAt: number;
}
