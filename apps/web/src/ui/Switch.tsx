import { useId } from 'react';
import styles from './components.module.css';

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function Switch({ checked, onChange, label, description, disabled = false }: SwitchProps) {
  const id = useId();
  return (
    <label className={styles.switchRow} htmlFor={id}>
      <input
        id={id}
        className={styles.switchInput}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <span className={styles.switchText}>
        <span className={styles.switchLabel}>{label}</span>
        {description ? <span className={styles.switchDescription}>{description}</span> : null}
      </span>
    </label>
  );
}
