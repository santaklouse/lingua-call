import { useEffect, useMemo, useState } from 'react';
import {
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  createTranslator,
  translate,
} from '@linguacall/i18n';
import type { Language } from '@linguacall/i18n';
import { Button, Card, ScreenShell, TextField } from '../ui';
import { useRouter } from '../router/context';
import { loadLanguage, saveLanguage } from '../storage/preferences';

export function LanguageScreen() {
  const { state, setLanguage, go } = useRouter();
  const [selected, setSelected] = useState<Language | null>(state.nativeLanguage);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (state.nativeLanguage !== null) return;
    const saved = loadLanguage();
    if (saved !== null) {
      setSelected(saved);
      setLanguage(saved);
    }
  }, [setLanguage, state.nativeLanguage]);

  const uiLanguage: Language = selected ?? 'en';
  const t = createTranslator(uiLanguage);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SUPPORTED_LANGUAGES.filter((code) => {
      if (needle.length === 0) return true;
      const names = LANGUAGE_NAMES[code];
      return (
        names.native.toLowerCase().includes(needle) ||
        names.english.toLowerCase().includes(needle) ||
        code.includes(needle)
      );
    });
  }, [query]);

  const choose = (language: Language) => {
    setSelected(language);
    setLanguage(language);
  };

  const proceed = () => {
    if (selected === null) return;
    saveLanguage(selected);
    go('lobby');
  };

  return (
    <ScreenShell
      title={t('language.title')}
      subtitle={t('language.description')}
      footer={
        <Button variant="primary" fullWidth disabled={selected === null} onClick={proceed}>
          {t('language.continue')}
        </Button>
      }
    >
      <TextField
        label={t('language.search')}
        placeholder={t('language.search')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      <Card>
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>{t('language.noResults')}</p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {filtered.map((code) => {
              const names = LANGUAGE_NAMES[code];
              const active = code === selected;
              return (
                <li key={code}>
                  <Button
                    variant={active ? 'primary' : 'secondary'}
                    fullWidth
                    aria-pressed={active}
                    onClick={() => choose(code)}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span>{names.native}</span>
                    <span style={{ opacity: 0.7, fontWeight: 400 }}>{names.english}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {selected !== null ? (
        <p style={{ color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
          {translate(selected, 'language.description')}
        </p>
      ) : null}
    </ScreenShell>
  );
}
