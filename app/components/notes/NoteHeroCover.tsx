interface NoteHeroCoverProps {
  visible: boolean;
  emoji?: string | null;
  readOnly?: boolean;
}

/**
 * Cabecera estilo prototipo (“cover blur” + emoji).
 * El emoji vive en `resource.metadata.dome_note_icon`; el gradiente usa tokens del tema.
 */
export default function NoteHeroCover({
  visible,
  emoji,
  readOnly = false,
}: NoteHeroCoverProps) {
  if (!visible) return null;

  const display = emoji?.trim() || '📝';

  return (
    <div className="note-hero-cover">
      <div className="note-hero-cover__blur" aria-hidden />
      <div className={`note-hero-cover__badge${readOnly ? ' note-hero-cover__badge--readonly' : ''}`} aria-hidden>
        {display}
      </div>
    </div>
  );
}
