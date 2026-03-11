import { HIGHLIGHT_COLORS } from "./RichTextEditor";
import "./HighlightColorPicker.css";

interface HighlightColorPickerProps {
  onSelectColor: (color: string) => void;
  onRemove: () => void;
  showRemove: boolean;
}

export function HighlightColorPicker({
  onSelectColor,
  onRemove,
  showRemove,
}: HighlightColorPickerProps) {
  return (
    <div className="highlight-color-picker">
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c.name}
          className={`highlight-swatch highlight-swatch--${c.name}`}
          onClick={() => onSelectColor(c.name)}
          title={c.label}
        />
      ))}
      {showRemove && (
        <>
          <span className="highlight-picker-divider" />
          <button
            className="highlight-remove-btn"
            onClick={onRemove}
            title="Remove highlight"
          >
            &times;
          </button>
        </>
      )}
    </div>
  );
}
