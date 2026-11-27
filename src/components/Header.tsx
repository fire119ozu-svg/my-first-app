import type { ReactNode } from 'react';

interface Props {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}

/** 画面上部の固定ヘッダー(左右にボタン、下に任意のサブヘッダー) */
export function Header({ title, left, right, children }: Props) {
  return (
    <header className="app-header">
      <div className="header-bar">
        <div className="header-side">{left}</div>
        <h1>{title}</h1>
        <div className="header-side right">{right}</div>
      </div>
      {children}
    </header>
  );
}

export function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="header-btn" href={href}>
      {children}
    </a>
  );
}
