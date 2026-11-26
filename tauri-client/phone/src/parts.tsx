// Small pieces the screens share: a project's tile, an icon button, a
// dropdown menu, a spinner, and a clock that ticks.
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './icon';
import type { LineName } from './line-icons';
import { projectLetter } from './row-status';

/** A project's tile: its picture, else the title's first letter on a quiet square. */
export function ProjectTile({ picture, title, size = 38 }: { picture?: string; title: string; size?: number }) {
  const style = { width: size, height: size, borderRadius: size * 0.26, fontSize: size * 0.42 };
  if (picture) return <img className="tile" style={style} src={picture} alt="" />;
  return (
    <span className="tile" style={style}>
      {title ? projectLetter(title) : <Icon name="folder" size={size * 0.5} className="muted" />}
    </span>
  );
}

export function IconButton({ name, label, onClick, size = 22, className = '', disabled }: { name: LineName; label: string; onClick: () => void; size?: number; className?: string; disabled?: boolean }) {
  return (
    <button className={`icon-button ${className}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <Icon name={name} size={size} />
    </button>
  );
}

// keepOpen: the item opens another menu in this one's place.
export type MenuItem = { label: string; icon: LineName; run: () => void; keepOpen?: boolean } | { info: string; icon: LineName } | 'divider';

/** A Material dropdown under its button: actions, dividers, and quiet lines of what something is. */
export function Menu({ items, close, align = 'left' }: { items: MenuItem[]; close: () => void; align?: 'left' | 'right' }) {
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className={`dropdown ${align}`} role="menu">
        {items.map((item, i) =>
          item === 'divider' ? (
            <hr key={i} />
          ) : 'info' in item ? (
            <div key={i} className="dropdown-info">
              <Icon name={item.icon} size={16} />
              <span>{item.info}</span>
            </div>
          ) : (
            <button
              key={i}
              role="menuitem"
              onClick={() => {
                if (!item.keepOpen) close();
                item.run();
              }}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Working" />;
}

export function Empty({ icon, title, text }: { icon: LineName; title: string; text: string }): ReactNode {
  return (
    <div className="empty">
      <Icon name={icon} size={28} className="faint" />
      <div className="empty-title">{title}</div>
      <div className="empty-text">{text}</div>
    </div>
  );
}

/** Now, every few seconds, so "Working 38s" and "5m" stay honest. */
export function useNow(everyMs = 5000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
