import { useEffect, useMemo, useState } from 'react';
import { createTranslator } from '@linguacall/i18n';
import type { MessageKey } from '@linguacall/i18n';
import { Button, Card, ScreenShell, StatusPill, TextField, TokenField } from '../ui';
import { useRouter } from '../router/context';
import {
  createMockToken,
  readTokenFromHash,
  shareLinkForToken,
  validateToken,
} from '../token/token';

type Mode = 'choice' | 'create' | 'join';

const VALIDATION_MESSAGES: Record<'empty' | 'prefix' | 'payload', MessageKey> = {
  empty: 'chat.tokenEmpty',
  prefix: 'chat.tokenInvalidPrefix',
  payload: 'chat.tokenInvalidPayload',
};

export function LobbyScreen() {
  const { state, dispatch, go } = useRouter();
  const t = createTranslator(state.nativeLanguage ?? 'en');

  const [mode, setMode] = useState<Mode>('choice');
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [pendingNavigate, setPendingNavigate] = useState(false);

  // Invite links open as #token=pnc1_… and land straight in the join panel.
  useEffect(() => {
    const fromHash = readTokenFromHash(window.location.hash);
    if (fromHash !== null) {
      setInput(fromHash);
      setMode('join');
    }
  }, []);

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
