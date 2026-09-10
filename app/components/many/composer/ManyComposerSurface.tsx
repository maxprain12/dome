import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowUp02Icon,
  Attachment01Icon,
  Cancel01Icon,
  StopCircleIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

export interface ManyComposerImage {
  id: string;
  name: string;
  dataUrl: string;
}

export interface ManyComposerPin {
  id: string;
  title: string;
  type?: string;
}

interface ManyComposerSurfaceProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onFiles: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onRemovePin: (id: string) => void;
  images: ManyComposerImage[];
  pins: ManyComposerPin[];
  placeholder: string;
  sendLabel: string;
  stopLabel: string;
  attachLabel: string;
  removeLabel: string;
  isLoading: boolean;
  disabled?: boolean;
  maxLength?: number;
  accept?: string;
  controls?: ReactNode;
  usage?: ReactNode;
  pickers?: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement>;
  className?: string;
}

function imageFilesFromClipboard(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  return Array.from(event.clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/**
 * Full portable Many composer island. It owns keyboard, paste, drag/drop and
 * attachment controls; host adapters inject catalogs, capability controls and
 * transport state without importing Electron APIs.
 */
export default function ManyComposerSurface({
  value,
  onValueChange,
  onSend,
  onStop,
  onFiles,
  onRemoveImage,
  onRemovePin,
  images,
  pins,
  placeholder,
  sendLabel,
  stopLabel,
  attachLabel,
  removeLabel,
  isLoading,
  disabled = false,
  maxLength,
  accept = 'image/png,image/jpeg,image/webp,image/gif',
  controls,
  usage,
  pickers,
  inputRef,
  className,
}: ManyComposerSurfaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canSend = !disabled && Boolean(value.trim() || images.length > 0);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend && !isLoading) onSend();
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (files.length > 0) onFiles(files);
  };

  return (
    <form
      className={cn('relative flex shrink-0 flex-col gap-1.5 px-3 pb-3 pt-1', className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend && !isLoading) onSend();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <Input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        aria-label={attachLabel}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <InputGroup
        data-disabled={disabled || isLoading ? true : undefined}
        className={cn(
          'h-auto max-h-[min(55vh,24rem)] w-full min-w-0 shrink-0 flex-col items-stretch gap-0 overflow-hidden rounded-2xl border border-input bg-card shadow-sm',
          dragging && 'border-primary/50 bg-primary/5 ring-2 ring-primary/15',
        )}
      >
        {pins.length > 0 || images.length > 0 ? (
          <InputGroupAddon
            align="block-start"
            className="flex min-w-0 flex-wrap justify-start gap-1.5 px-2 pt-2"
          >
            {pins.map((pin) => (
              <span
                key={pin.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 px-2 py-1 text-[11px]"
              >
                <span className="truncate">{pin.title}</span>
                <button
                  type="button"
                  onClick={() => onRemovePin(pin.id)}
                  aria-label={`${removeLabel}: ${pin.title}`}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </span>
            ))}
            {images.map((image) => (
              <span
                key={image.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-muted/50 p-1 text-[11px]"
              >
                <img src={image.dataUrl} alt="" className="size-7 rounded object-cover" />
                <span className="max-w-24 truncate">{image.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveImage(image.id)}
                  aria-label={`${removeLabel}: ${image.name}`}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </span>
            ))}
          </InputGroupAddon>
        ) : null}

        <InputGroupTextarea
          ref={inputRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const files = imageFilesFromClipboard(event);
            if (files.length === 0) return;
            event.preventDefault();
            onFiles(files);
          }}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          rows={1}
          className="min-h-14 max-h-44 px-3 py-2.5 text-sm"
        />
        <InputGroupAddon
          align="block-end"
          className="shrink-0 justify-between gap-2 border-0 px-2 pb-2 pt-0.5"
        >
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isLoading}
              title={attachLabel}
              aria-label={attachLabel}
            >
              <HugeiconsIcon icon={Attachment01Icon} />
            </Button>
            {controls}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {usage}
            {isLoading ? (
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                className="rounded-full"
                onClick={onStop}
                title={stopLabel}
                aria-label={stopLabel}
              >
                <HugeiconsIcon icon={StopCircleIcon} />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-sm"
                className="rounded-full"
                disabled={!canSend}
                title={sendLabel}
                aria-label={sendLabel}
              >
                <HugeiconsIcon icon={ArrowUp02Icon} />
              </Button>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
      {pickers}
    </form>
  );
}
