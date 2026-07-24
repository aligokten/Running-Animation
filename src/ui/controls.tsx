import type { ReactNode } from 'react';

export function Panel({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
        {right}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__label">{label}</span>
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <div className="slider">
      <div className="slider__top">
        <span>{label}</span>
        <b>{format ? format(value) : `${value}${suffix ?? ''}`}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${full ? ' btn--full' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="text-input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Notice({ kind, children }: { kind: 'info' | 'error' | 'success'; children: ReactNode }) {
  return <div className={`notice notice--${kind}`}>{children}</div>;
}
