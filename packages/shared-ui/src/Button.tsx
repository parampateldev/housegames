import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  ghost?: boolean;
  wide?: boolean;
  small?: boolean;
};

export function Button({ ghost, wide, small, className, ...rest }: Props) {
  const cls = [
    'hg-btn',
    ghost && 'hg-ghost',
    wide && 'hg-wide',
    small && 'hg-small',
    className,
  ].filter(Boolean).join(' ');
  return <button className={cls} {...rest} />;
}
