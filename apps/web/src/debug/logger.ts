export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export type DebugEntry = {
  id: number;
  time: number;
  level: DebugLevel;
  message: string;
};

type Listener = (entries: readonly DebugEntry[]) => void;

/** In-memory debug log for the call screen; no network telemetry. */
export class DebugLogger {
  private entries: DebugEntry[] = [];
  private readonly listeners = new Set<Listener>();
  private nextId = 1;

  constructor(private readonly limit = 300) {}

  log(level: DebugLevel, message: string): void {
    const entry: DebugEntry = { id: this.nextId, time: Date.now(), level, message };
    this.nextId += 1;
    this.entries = [...this.entries.slice(-(this.limit - 1)), entry];
    this.emit();
  }

  debug(message: string): void {
    this.log('debug', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  snapshot(): readonly DebugEntry[] {
    return this.entries;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.entries);
  }
}
