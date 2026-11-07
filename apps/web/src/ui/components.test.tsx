// @vitest-environment jsdom
import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';
import { Switch } from './Switch';
import { TextField } from './TextField';

describe('Button', () => {
  it('renders children and handles clicks', () => {
    const onClick = mock();
    render(<Button onClick={onClick}>Start call</Button>);
    const button = screen.getByRole('button', { name: 'Start call' });
    fireEvent.click(button);
    expect(onClick.mock.calls.length).toBe(1);
  });

  it('does not fire when disabled', () => {
    const onClick = mock();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(onClick.mock.calls.length).toBe(0);
  });
});

describe('Switch', () => {
  it('reports the next checked state', () => {
    const onChange = mock();
    render(<Switch checked={false} onChange={onChange} label="Dubbing" />);
    fireEvent.click(screen.getByRole('switch', { name: /Dubbing/ }));
    expect(onChange.mock.calls[0]).toEqual([true]);
  });
});

describe('TextField', () => {
  it('links label, hint and error to the input', () => {
    render(<TextField label="Token" hint="Starts with pnc1_" error="Invalid" />);
    const input = screen.getByLabelText('Token');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Invalid');
    expect(screen.getByText('Starts with pnc1_')).toBeTruthy();
  });
});
