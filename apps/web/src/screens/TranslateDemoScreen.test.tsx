import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider } from '../router/context';
import { TranslateDemoScreen } from './TranslateDemoScreen';

afterEach(cleanup);

describe('translation demo screen', () => {
  it('explains unsupported browser APIs and disables start', () => {
    render(
      <RouterProvider>
        <TranslateDemoScreen />
      </RouterProvider>,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Live translation demo');
    expect(screen.getByText(/Speech recognition is not supported/i)).toBeTruthy();
    expect(screen.getByText(/Built-in translation is not available/i)).toBeTruthy();

    const start = screen.getByRole('button', { name: 'Start listening' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });
});
