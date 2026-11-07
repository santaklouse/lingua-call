import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import styles from './components.module.css';

export type TokenFieldProps = {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  hint?: string;
  onCopied?: () => void;
};

export function TokenField({ label, value, copyLabel, copiedLabel, hint, onCopied }: TokenFieldProps) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.tokenField}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <textarea
          id={id}
          className={styles.textarea}
          value={value}
          readOnly
          rows={3}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      <div className={styles.tokenActions}>
        <Button size="sm" variant="secondary" onClick={() => void copy()} aria-live="polite">
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
    </div>
  );
}
