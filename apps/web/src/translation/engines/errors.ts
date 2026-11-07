export class UnsupportedEngineError extends Error {
  readonly engine: string;

  constructor(engine: string) {
    super(`${engine} is not supported by this browser`);
    this.name = 'UnsupportedEngineError';
    this.engine = engine;
  }
}
