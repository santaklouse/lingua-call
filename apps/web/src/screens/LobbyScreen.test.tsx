import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';
import { createMockToken } from '../token/token';

function enterEnglish() {
  fireEvent.click(screen.getByRole('button', { name: /English/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

describe('lobby screen', () => {
  it('creates a mock chat token and a shareable invite link', () => {
    render(<App />);
    enterEnglish();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Start a call');

    fireEvent.click(screen.getByRole('button', { name: 'Create a chat' }));

    expect(screen.getByDisplayValue(/^pnc1_/)).toBeTruthy();
    expect(screen.getByDisplayValue(/#token=/)).toBeTruthy();
    expect(screen.getByText('Waiting for the other participant…')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Camera and microphone');
  });

  it('joins with a valid token and rejects invalid ones', () => {
    render(<App />);
    enterEnglish();

    fireEvent.click(screen.getByRole('button', { name: 'Join with a token' }));
    const input = screen.getByLabelText('Invite token');

    fireEvent.change(input, { target: { value: 'bad-token' } });
    expect(screen.getByText('Token must start with pnc1_')).toBeTruthy();

    fireEvent.change(input, { target: { value: createMockToken() } });
    expect(screen.queryByText('Token must start with pnc1_')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Camera and microphone');
  });

  it('prefills the join form from an invite link hash', () => {
    window.location.hash = `#token=${createMockToken()}`;
    render(<App />);
    enterEnglish();

    expect((screen.getByLabelText('Invite token') as HTMLInputElement).value).toMatch(/^pnc1_/);
  });
});
