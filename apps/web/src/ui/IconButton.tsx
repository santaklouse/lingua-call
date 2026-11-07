import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './components.module.css';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  danger?: boolean;
  children: ReactNode;
};

export function IconButton({ label, danger = false, className, type = 'button', children, ...rest }: IconButtonProps) {
  const classes = [styles.iconButton, danger ? styles.iconButtonDanger : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
