import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import styles from './components.module.css';

export type ModalProps = {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, title, closeLabel, onClose, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={styles.modalDialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <IconButton label={closeLabel} onClick={onClose}>
            ×
          </IconButton>
        </header>
        <div className={styles.modalBody}>{children}</div>
        {footer ? <footer className={styles.modalFooter}>{footer}</footer> : null}
      </div>
    </>
  );
}
