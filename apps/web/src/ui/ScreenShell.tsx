import type { ReactNode } from 'react';
import styles from './components.module.css';

export type ScreenShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function ScreenShell({ title, subtitle, children, footer }: ScreenShellProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.screenHeader}>
        <h1 className={styles.screenTitle}>{title}</h1>
        {subtitle ? <p className={styles.screenSubtitle}>{subtitle}</p> : null}
      </header>
      <div className={styles.screenBody}>{children}</div>
      {footer ? <div className={styles.screenFooter}>{footer}</div> : null}
    </div>
  );
}
