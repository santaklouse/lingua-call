import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './components.module.css';

export type WidgetProps = {
  id: string;
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

const STORAGE_PREFIX = 'linguacall.widget.';

function initialOpen(id: string, defaultOpen: boolean): boolean {
  try {
    const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (saved === 'open') return true;
    if (saved === 'closed') return false;
  } catch {
    // Storage may be unavailable; fall back to the default.
  }
  return defaultOpen;
}

/** Collapsible sidebar panel; its state is remembered per widget id. */
export function Widget({ id, title, badge, actions, defaultOpen = false, children }: WidgetProps) {
  const [open, setOpen] = useState(() => initialOpen(id, defaultOpen));

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, open ? 'open' : 'closed');
    } catch {
      // Ignore persistence failures.
    }
  }, [id, open]);

  return (
    <section className={styles.widget}>
      <header className={styles.widgetHeader}>
        <button
          type="button"
          className={styles.widgetToggle}
          aria-expanded={open}
          aria-controls={`widget-body-${id}`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={[styles.widgetChevron, open ? styles.widgetChevronOpen : ''].join(' ')} aria-hidden="true">
            ▸
          </span>
          <span className={styles.widgetTitle}>{title}</span>
          {badge !== undefined ? <span className={styles.widgetBadge}>{badge}</span> : null}
        </button>
        {actions !== undefined ? <div className={styles.widgetActions}>{actions}</div> : null}
      </header>
      {open ? (
        <div id={`widget-body-${id}`} className={styles.widgetBody}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
