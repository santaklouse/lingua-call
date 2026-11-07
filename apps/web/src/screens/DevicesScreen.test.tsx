import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider } from '../router/context';
import { DevicesScreen } from './DevicesScreen';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

describe('devices screen', () => {
  it('explains missing media devices and blocks the call', async () => {
    render(
      <RouterProvider>
        <DevicesScreen />
      </RouterProvider>,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Camera and microphone',
    );
    await screen.findByText(/Camera\/microphone access was denied/i);
    const button = screen.getByRole('button', { name: 'Continue to call' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
