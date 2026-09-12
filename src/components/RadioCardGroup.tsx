export function RadioCardGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  variant = 'cards',
}: {
  legend: string;
  name: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  /** 'cards' (default) for options with a description; 'segmented' for a
   * compact pill row of short, same-length choices. */
  variant?: 'cards' | 'segmented';
}) {
  if (variant === 'segmented') {
    return (
      <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBottom: 'var(--ms-space-4)' }}>
        <legend>{legend}</legend>
        <div className="ms-segmented" role="radiogroup" aria-label={legend}>
          {options.map((opt) => (
            <label key={opt.value} className="ms-segmented-option">
              <input type="radio" name={name} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBottom: 'var(--ms-space-4)' }}>
      <legend>{legend}</legend>
      <div className="ms-radio-cards">
        {options.map((opt) => (
          <label key={opt.value} className="ms-radio-card">
            <input type="radio" name={name} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} />
            <span>
              <strong>{opt.label}</strong>
              {opt.hint && <div style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}>{opt.hint}</div>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxChipGroup<T extends string>({
  legend,
  options,
  values,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  values: T[];
  onChange: (v: T[]) => void;
}) {
  function toggle(v: T) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBottom: 'var(--ms-space-4)' }}>
      <legend>{legend}</legend>
      <div className="ms-chip-group">
        {options.map((opt) => (
          <label key={opt.value} className="ms-chip">
            <input type="checkbox" checked={values.includes(opt.value)} onChange={() => toggle(opt.value)} />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
