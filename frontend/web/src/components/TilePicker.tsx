import type { ReactNode } from 'react';
import './TilePicker.css';

// Picking one value out of a grid of large squares, two to a row. The browser
// half of frontend/mobile/src/components/TilePicker.tsx.
//
// **The pattern is the founder's instruction and not one screen's styling**, and
// his words apply to the browser exactly as they do to the phone: wherever data
// is entered it should be big tappable squares, and the horizontal strips of
// chips are "the single most uncomfortable thing about the experience". The web
// client had never been given the pattern at all (docs/open-items.md says so in
// as many words), so this is where it arrives.
//
// The API is the mobile component's, prop for prop, so that a screen ported
// between the two clients is the same file with different tags: `value` is the
// identity handed back to onSelect, `caption` is the small second line under a
// label, `actions` are the dashed squares rendered after the values, and
// `emptyHint` is the sentence an empty grid needs.
//
// **What is deliberately not shared is the measuring.** The mobile component
// computes a pixel size for its tiles because a wrapping flex row stretches its
// children and discards their aspect ratio; CSS grid has no such problem, so
// here `aspect-ratio: 1` is the whole of it. See TilePicker.css.

export type TileOption = {
  value: string;
  label: string;
  caption?: string;
};

export type TileAction = {
  key: string;
  label: string;
  onPress: () => void;
};

export function TilePicker({
  id,
  title,
  subtitle,
  options,
  selectedValue,
  onSelect,
  actions,
  emptyHint,
  disabled,
  footer,
}: {
  // Ties the grid to its own question for a screen reader. There is no single
  // input element to point a label at -- the control is a group of buttons --
  // so the group is labelled by the heading it already shows.
  id: string;
  title: string;
  subtitle?: string;
  options: readonly TileOption[];
  // null when nothing is picked yet. Every step of a fresh walk starts here.
  selectedValue: string | null;
  onSelect: (value: string) => void;
  actions?: readonly TileAction[];
  emptyHint?: string;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const busy = disabled === true;

  return (
    <div className="tile-picker">
      <div className="tile-picker__heading">
        <h2 className="tile-picker__title" id={id}>
          {title}
        </h2>
        {subtitle !== undefined && <span className="tile-picker__subtitle">{subtitle}</span>}
      </div>

      {options.length === 0 && emptyHint !== undefined && (
        <p className="tile-picker__empty">{emptyHint}</p>
      )}

      <div className="tile-picker__grid" role="group" aria-labelledby={id}>
        {options.map((option) => {
          const active = option.value === selectedValue;
          return (
            <button
              key={option.value}
              type="button"
              className={
                active ? 'tile-picker__tile tile-picker__tile--active' : 'tile-picker__tile'
              }
              onClick={() => onSelect(option.value)}
              disabled={busy}
              aria-pressed={active}
            >
              <span>{option.label}</span>
              {option.caption !== undefined && (
                <span className="tile-picker__caption">{option.caption}</span>
              )}
            </button>
          );
        })}

        {(actions ?? []).map((action) => (
          <button
            key={action.key}
            type="button"
            className="tile-picker__tile tile-picker__tile--action"
            onClick={action.onPress}
            disabled={busy}
          >
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {footer}
    </div>
  );
}
