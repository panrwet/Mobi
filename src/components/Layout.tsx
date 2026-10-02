import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

export function Page({ title, back, actions, children }: { title: string; back?: boolean | string; actions?: ReactNode; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        {back && (
          <button
            className="icon-btn"
            aria-label="Zurück"
            onClick={() => (typeof back === 'string' ? nav(back) : window.history.length > 1 ? nav(-1) : nav('/'))}
          >
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        {actions}
      </header>
      <main className="content">{children}</main>
    </>
  );
}

const tabs: [string, string, string][] = [
  ['/', 'home', 'Start'],
  ['/patienten', 'users', 'Patienten'],
  ['/kalender', 'calendar', 'Kalender'],
  ['/rechnungen', 'euro', 'Rechnungen'],
  ['/mehr', 'more', 'Mehr'],
];

export function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Hauptnavigation">
      {tabs.map(([to, icon, label]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={icon} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
