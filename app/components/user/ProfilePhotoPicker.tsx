import { useRef } from 'react';
import { Button } from '@/components/ui/button';

type ProfilePhotoPickerProps = {
  label: string;
  busy?: boolean;
  onFile: (file: File) => void;
};

export default function ProfilePhotoPicker({ label, busy = false, onFile }: ProfilePhotoPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {label}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </>
  );
}
