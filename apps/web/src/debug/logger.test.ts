import { describe, expect, it } from 'bun:test';
import { DebugLogger } from './logger';

describe('DebugLogger', () => {
  it('stores entries and notifies subscribers', () => {
    const logger = new DebugLogger();
    const seen: string[] = [];
    const unsubscribe = logger.subscribe((entries) => seen.push(entries.map((e) => e.message).join(',')));
    logger.info('one');
    logger.warn('two');
    expect(seen).toEqual(['', 'one', 'one,two']);
    expect(logger.snapshot().map((entry) => entry.level)).toEqual(['info', 'warn']);
    unsubscribe();
    logger.info('three');
    expect(seen).toHaveLength(3);
  });

  it('keeps a bounded window and clears', () => {
    const logger = new DebugLogger(3);
    for (const message of ['a', 'b', 'c', 'd']) logger.debug(message);
    expect(logger.snapshot().map((entry) => entry.message)).toEqual(['b', 'c', 'd']);
    logger.clear();
    expect(logger.snapshot()).toEqual([]);
  });
});
