import { useEffect, useMemo, useState } from 'react';
import { createTranslator } from '@linguacall/i18n';
import type { MessageKey } from '@linguacall/i18n';
import { Button, Card, ScreenShell, StatusPill, TextField, TokenField } from '../ui';
import { useRouter } from '../router/context';
import {
  createMockToken,
  shareLinkForToken,
  validateToken,
} from '../token/token';
import { clearSession, loadSession, saveSession } from '../storage/session';
import { legacyTokenFromHash, parseHash } from '../router/url';

const LOBBY_SESSION_KEY = 'linguacall.lobby';

type LobbySession = {
  mode: Mode;
  token: string | null;
  input: string;
};

function readInitialLobby(): LobbySession {
  let pendingInvite: string | null = null;
  try {
    pendingInvite = window.sessionStorage.getItem('linguacall.pendingInvite');
    if (pendingInvite !== null) window.sessionStorage.removeItem('linguacall.pendingInvite');
  } catch {
    pendingInvite = null;
  }
  const route = parseHash(window.location.hash);
  const fromRoute =
    pendingInvite ??
    route?.params['token'] ??
    legacyTokenFromHash(window.location.hash) ??
    null;
  if (fromRoute !== null && fromRoute.length > 0) {
    const state: LobbySession = { mode: 'join', token: null, input: fromRoute };
    saveSession(LOBBY_SESSION_KEY, state);
    return state;
  }
  const saved = loadSession<LobbySession>(LOBBY_SESSION_KEY, (value) => {
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const mode = record['mode'];
    if (mode !== 'create' && mode !== 'join' && mode !== 'choice') return null;
    return {
      mode,
      token: typeof record['token'] === 'string' ? record['token'] : null,
      input: typeof record['input'] === 'string' ? record['input'] : '',
    };
  });
  return saved ?? { mode: 'choice', token: null, input: '' };
}

type Mode = 'choice' | 'create' | 'join';

const VALIDATION_MESSAGES: Record<'empty' | 'prefix' | 'payload', MessageKey> = {
  empty: 'chat.tokenEmpty',
  prefix: 'chat.tokenInvalidPrefix',
  payload: 'chat.tokenInvalidPayload',
};

export function LobbyScreen() {
  const { state, dispatch, go } = useRouter();
  const t = createTranslator(state.nativeLanguage ?? 'en');

  const initial = readInitialLobby();
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [token, setToken] = useState<string | null>(initial.token);
  const [input, setInput] = useState(initial.input);
  const [pendingNavigate, setPendingNavigate] = useState(false);

  // Persist the lobby panel so a refresh keeps the invite/join state.
  useEffect(() => {
    if (mode === 'choice') {
      clearSession(LOBBY_SESSION_KEY);
      return;
    }
    saveSession(LOBBY_SESSION_KEY, { mode, token, input } satisfies LobbySession);
  }, [mode, token, input]);

  useEffect(() => {
    if (pendingNavigate && state.transportReady) {
      setPendingNavigate(false);
      go('devices');
    }
  }, [pendingNavigate, state.transportReady, go]);

  const validation = useMemo(() => (input.trim().length === 0 ? null : validateToken(input)), [input]);

  const startCreate = () => {
    setToken(createMockToken());
    dispatch({ type: 'setTransportReady', ready: true });
    setMode('create');
  };

  const regenerate = () => setToken(createMockToken());

  const startJoin = () => {
    setInput('');
    setMode('join');
  };

  const join = () => {
    if (validation?.valid !== true) return;
    clearSession(LOBBY_SESSION_KEY);
    dispatch({ type: 'setTransportReady', ready: true });
    setPendingNavigate(true);
  };

  const shareLink = token === null ? '' : shareLinkForToken(token, window.location.href);

  return (
    <ScreenShell
      title={t('chat.title')}
      subtitle={t('chat.subtitle')}
      footer={
        mode === 'choice' ? undefined : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => setMode('choice')}>
              {t('common.back')}
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={mode === 'create' ? token === null : validation?.valid !== true}
              onClick={mode === 'create' ? () => go('devices') : join}
            >
              {t('common.continue')}
            </Button>
          </div>
        )
      }
    >
      {mode === 'choice' ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button variant="primary" size="lg" fullWidth onClick={startCreate}>
              {t('chat.create')}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={startJoin}>
              {t('chat.join')}
            </Button>
            <Button variant="primary" size="lg" fullWidth onClick={() => go('translate-demo')}>
              {t('translate.entry')}
            </Button>
            <Button variant="ghost" size="sm" fullWidth onClick={() => go('manual-call')}>
              {t('manual.entry')}
            </Button>
          </div>
        </Card>
      ) : null}

      {mode === 'create' && token !== null ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TokenField
              label={t('chat.token')}
              value={token}
              copyLabel={t('chat.copy')}
              copiedLabel={t('chat.copied')}
              hint={t('chat.shareHint')}
            />
            <TokenField
              label={t('chat.shareLink')}
              value={shareLink}
              copyLabel={t('chat.copy')}
              copiedLabel={t('chat.copied')}
              hint={t('chat.shareHint')}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <StatusPill tone="warning">{t('chat.waiting')}</StatusPill>
              <Button variant="ghost" size="sm" onClick={regenerate}>
                {t('chat.newToken')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {mode === 'join' ? (
        <Card>
          <TextField
            label={t('chat.token')}
            placeholder={t('chat.tokenPlaceholder')}
            value={input}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setInput(event.currentTarget.value)}
            error={
              validation !== null && !validation.valid
                ? t(VALIDATION_MESSAGES[validation.reason])
                : undefined
            }
          />
        </Card>
      ) : null}
    </ScreenShell>
  );
}
