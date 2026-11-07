import { Button, Card, ScreenShell, StatusPill } from './ui';
import { LanguageScreen } from './screens/LanguageScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ManualCallScreen } from './screens/ManualCallScreen';
import { RouterProvider, useRouter } from './router/context';
import type { Screen } from './router/state';

const SCREEN_TITLES: Record<Screen, string> = {
  language: '1. Native language',
  lobby: '2. Create or join a chat',
  'manual-call': 'Simple WebRTC call',
  devices: '3. Camera and microphone',
  call: '4. Call',
  ended: 'Call ended',
};

function ScreenStub() {
  const { state, dispatch, go } = useRouter();
  const [tone, label] =
    state.screen === 'call'
      ? (['success', 'In call'] as const)
      : state.transportReady
        ? (['warning', 'Connected, not in call'] as const)
        : (['neutral', 'Idle'] as const);

  return (
    <ScreenShell
      title={SCREEN_TITLES[state.screen]}
      subtitle="Router stub — screens will replace this"
      footer={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => go('language')}>
            Language
          </Button>
          <Button variant="secondary" onClick={() => go('lobby')}>
            Lobby
          </Button>
          <Button variant="secondary" onClick={() => go('devices')}>
            Devices
          </Button>
          <Button variant="primary" onClick={() => go('call')}>
            Start call
          </Button>
          <Button variant="danger" onClick={() => go('ended')}>
            End
          </Button>
        </div>
      }
    >
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Router state</strong>
          <StatusPill tone={tone}>{label}</StatusPill>
        </div>
        <p style={{ marginTop: 12, color: 'var(--color-text-muted)' }}>
          language={state.nativeLanguage ?? '—'} · transportReady=
          {String(state.transportReady)} · devicesReady={String(state.devicesReady)} · callActive=
          {String(state.callActive)}
        </p>
      </Card>

      <Card muted>
        <strong>Debug toggles</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <Button size="sm" onClick={() => dispatch({ type: 'setLanguage', language: 'ru' })}>
            lang ru
          </Button>
          <Button size="sm" onClick={() => dispatch({ type: 'setLanguage', language: 'en' })}>
            lang en
          </Button>
          <Button
            size="sm"
            onClick={() => dispatch({ type: 'setTransportReady', ready: !state.transportReady })}
          >
            transport
          </Button>
          <Button
            size="sm"
            onClick={() => dispatch({ type: 'setDevicesReady', ready: !state.devicesReady })}
          >
            devices
          </Button>
          <Button
            size="sm"
            onClick={() => dispatch({ type: 'setCallActive', active: !state.callActive })}
          >
            callActive
          </Button>
        </div>
      </Card>
    </ScreenShell>
  );
}

function CurrentScreen() {
  const { state } = useRouter();
  if (state.screen === 'language') return <LanguageScreen />;
  if (state.screen === 'lobby') return <LobbyScreen />;
  if (state.screen === 'manual-call') return <ManualCallScreen />;
  return <ScreenStub />;
}

export function App() {
  return (
    <RouterProvider>
      <CurrentScreen />
    </RouterProvider>
  );
}
