import styles from './components.module.css';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export type StatusPillProps = {
  tone?: StatusTone;
  children: string;
};

export function StatusPill({ tone = 'neutral', children }: StatusPillProps) {
  return (
    <span className={[styles.statusPill, styles[tone]].join(' ')}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
