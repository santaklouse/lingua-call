import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_LANGUAGE,
  createTranslator,
  isLanguage,
  normalizeLanguage,
  translate,
} from './index';

describe('i18n', () => {
  it('translates known keys for every supported language', () => {
    expect(translate('ru', 'language.title')).toBe('Ваш родной язык');
    expect(translate('en', 'language.title')).toBe('Your native language');
  });

  it('interpolates parameters', () => {
    expect(translate('en', 'chat.create', {})).toBe('Create a chat');
    expect(translate('en', 'app.tagline', {})).toContain('P2P');
  });

  it('creates a language-bound translator', () => {
    const t = createTranslator('ru');
    expect(t('call.subtitles')).toBe('Субтитры включены');
  });

  it('validates and normalizes language codes', () => {
    expect(isLanguage('ru')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(normalizeLanguage('de')).toBe(DEFAULT_LANGUAGE);
    expect(normalizeLanguage('ru')).toBe('ru');
  });
});
