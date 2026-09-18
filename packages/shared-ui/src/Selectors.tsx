export function ChipRow<T extends string>({
  options, value, onChange, multi,
}: {
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  multi?: boolean;
}) {
  function toggle(opt: T) {
    if (multi) {
      onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
    } else {
      onChange([opt]);
    }
  }
  return (
    <div className="hg-chip-row">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={'hg-chip' + (value.includes(opt) ? ' on' : '')}
          onClick={() => toggle(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="hg-seg">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === value ? 'on' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value, onChange, min = 1, max = 20,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="hg-stepper">
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="val">{value}</span>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
