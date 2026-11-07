import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = '';
});

describe('language screen', () => {
  it('lets the user pick a native language and continue to the lobby', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your native language');

    fireEvent.click(screen.getByRole('button', { name: /Русский/ }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ваш родной язык');

    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Начать звонок');
    expect(window.localStorage.getItem('linguacall.language')).toBe('ru');
  });

  it('restores the current screen after a remount (F5)', () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /English/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(window.location.hash).toBe('#/lobby');
    first.unmount();

    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Start a call');
  });

  it('filters languages by search query', () => {
    render(<App />);
    const search = screen.getByLabelText('Search languages');
    fireEvent.change(search, { target: { value: 'рус' } });

    expect(screen.getByRole('button', { name: /Русский/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /English/ })).toBeNull();
  });
});
