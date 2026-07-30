interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ success: boolean; results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface DurableObjectId {}

interface DurableObjectNamespace<T = unknown> {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): T;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

interface DurableObject {
  fetch(request: Request): Promise<Response>;
}

interface WebSocket {
  serializeAttachment(attachment: unknown): void;
  deserializeAttachment(): unknown;
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface ResponseInit {
  webSocket?: WebSocket | null;
}

interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, context: ExecutionContext): Response | Promise<Response>;
  scheduled?(event: ScheduledEvent, env: Env, context: ExecutionContext): void | Promise<void>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
}

declare namespace Rpc {
  interface DurableObjectBranded {}
}
