import type { HTMLAttributes, ReactNode } from 'react';
import styles from './components.module.css';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  muted?: boolean;
  children: ReactNode;
};

export function Card({ muted = false, className, children, ...rest }: CardProps) {
  const classes = [styles.card, muted ? styles.cardMuted : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
