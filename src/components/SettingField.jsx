import { useEffect, useRef } from "react";
import { DEFAULT, isDefault } from "../constants";

// One setting's input: a number box, a text box, or a dropdown.
// Any of them can be set to "Default" (the slicer's / machine's own default).
export default function SettingField({
  def,
  value,
  onChange,
  changed = false,
  compact = false,
  label = true,
}) {
  const id = `setting-${def.id}`;
  const inputRef = useRef(null);
  const focusNext = useRef(false);
  const options = def.options || [];
  const v = value ?? "";
  const onDefault = isDefault(v);

  // After leaving "Default" to type a value, put the cursor straight in the box
  useEffect(() => {
    if (focusNext.current && !onDefault) {
      focusNext.current = false;
      inputRef.current?.focus();
    }
  }, [onDefault]);

  const base = `field ${compact ? "field-sm" : ""} ${changed ? "!border-accent" : ""}`;
  const a11yLabel = label ? undefined : def.label;

  let input;
  if (def.kind === "choice") {
    input = (
      <select
        id={id}
        className={base}
        value={onDefault ? DEFAULT : v}
        onChange={(e) => onChange(e.target.value)}
        aria-label={a11yLabel}
      >
        <option value="">—</option>
        <option value={DEFAULT}>Default</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {v !== "" &&
          !onDefault &&
          !options.some((o) => o.toLowerCase() === String(v).toLowerCase()) && (
            <option value={v}>{v}</option>
          )}
      </select>
    );
  } else if (onDefault) {
    input = (
      <button
        type="button"
        id={id}
        className={`${base} text-left italic text-muted hover:border-accent`}
        onClick={() => {
          focusNext.current = true;
          onChange("");
        }}
        aria-label={`${def.label}: Default. Click to enter your own value.`}
      >
        Default
      </button>
    );
  } else {
    input = (
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          className={`${base} ${def.kind === "number" ? "font-mono" : ""} pr-20`}
          placeholder={compact ? undefined : "Type a value"}
          type={def.kind === "number" ? "number" : "text"}
          step="any"
          inputMode={def.kind === "number" ? "decimal" : undefined}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          aria-label={a11yLabel}
        />
        {/* Always available: switch this one setting to Default */}
        <button
          type="button"
          onClick={() => onChange(DEFAULT)}
          title="Use Default for this setting"
          aria-label={`Use Default for ${def.label}`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
        >
          Default
        </button>
      </div>
    );
  }

  if (!label) return input;

  return (
    <div>
      <label htmlFor={id} className="lbl">
        {def.label}
        {def.unit && <span> ({def.unit})</span>}
      </label>
      {input}
      {changed && def.default_value && (
        <p className="mt-1 text-xs font-semibold text-accent">
          {isDefault(def.default_value)
            ? "Changed from Default"
            : `Changed · default ${def.default_value}`}
        </p>
      )}
    </div>
  );
}
