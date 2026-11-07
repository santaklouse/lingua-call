import { RouterProvider, useRouter } from './router/context';
import type { Screen } from './router/state';

const SCREEN_TITLES: Record<Screen, string> = {
  language: '1. Native language',
  lobby: '2. Create or join a chat',
  devices: '3. Camera and microphone',
  call: '4. Call',
  ended: 'Call ended',
};

function RouterDebug() {
  const { state, dispatch, go } = useRouter();

  return (
    <main>
      <h1>LinguaCall</h1>
      <p>P2P video calls with real-time speech translation and dubbing.</p>
      <h2>{SCREEN_TITLES[state.screen]}</h2>
      <p>
        language={state.nativeLanguage ?? '—'} · transportReady=
        {String(state.transportReady)} · devicesReady={String(state.devicesReady)} · callActive=
        {String(state.callActive)}
      </p>
      <div>
        <button type="button" onClick={() => go('language')}>
          language
        </button>{' '}
        <button type="button" onClick={() => go('lobby')}>
          lobby
        </button>{' '}
        <button type="button" onClick={() => go('devices')}>
          devices
        </button>{' '}
        <button type="button" onClick={() => go('call')}>
          call
        </button>{' '}
        <button type="button" onClick={() => go('ended')}>
          ended
        </button>
      </div>
      <hr />
      <div>
        <button type="button" onClick={() => dispatch({ type: 'setLanguage', language: 'ru' })}>
          set ru
        </button>{' '}
        <button type="button" onClick={() => dispatch({ type: 'setLanguage', language: 'en' })}>
          set en
        </button>{' '}
        <button
          type="button"
          onClick={() => dispatch({ type: 'setTransportReady', ready: !state.transportReady })}
        >
          toggle transport
        </button>{' '}
        <button
          type="button"
          onClick={() => dispatch({ type: 'setDevicesReady', ready: !state.devicesReady })}
        >
          toggle devices
        </button>{' '}
        <button
          type="button"
          onClick={() => dispatch({ type: 'setCallActive', active: !state.callActive })}
        >
          toggle call
        </button>
      </div>
    </main>
  );
}

export function App() {
  return (
    <RouterProvider>
      <RouterDebug />
    </RouterProvider>
  );
}
