import styles from './components.module.css';

export type SpinnerProps = {
  size?: 'md' | 'lg';
  label?: string;
};

export function Spinner({ size = 'md', label = 'Loading' }: SpinnerProps) {
  return (
    <span
      className={[styles.spinner, size === 'lg' ? styles.spinnerLg : ''].filter(Boolean).join(' ')}
      role="status"
      aria-label={label}
    />
  );
}
