import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
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
import { PinnedResourceChipList, ManySkillChipList } from '@/components/many/PinnedResourceChipList';

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

export interface ManyComposerSkill {
  id: string;
  title: string;
}

interface ManyComposerSurfaceProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onFiles: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onRemovePin: (id: string) => void;
  onRemoveSkill?: (id: string) => void;
  images: ManyComposerImage[];
  pins: ManyComposerPin[];
  skills?: ManyComposerSkill[];
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
  containerRef?: Ref<HTMLDivElement>;
  onInputKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  onCaretChange?: (value: string, caret: number) => void;
  className?: string;
  islandClassName?: string;
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
  onRemoveSkill,
  images,
  pins,
  skills = [],
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
  containerRef,
  onInputKeyDown,
  onCaretChange,
  className,
  islandClassName,
}: ManyComposerSurfaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canSend =
    !disabled && Boolean(value.trim() || images.length > 0 || pins.length > 0 || skills.length > 0);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onInputKeyDown?.(event)) return;
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
      <div ref={containerRef} className="relative min-w-0">
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
          islandClassName,
        )}
      >
        {pins.length > 0 || images.length > 0 || skills.length > 0 ? (
          <InputGroupAddon
            align="block-start"
            className="min-w-0 overflow-hidden px-0 pt-0"
          >
            <div className="flex min-w-0 w-full flex-col gap-y-2 px-2.5 pt-2">
              <PinnedResourceChipList
                resources={pins.map((pin) => ({
                  id: pin.id,
                  title: pin.title,
                  type: pin.type || 'resource',
                }))}
                onRemove={onRemovePin}
              />
              <ManySkillChipList
                skills={skills.map((skill) => ({ id: skill.id, name: skill.title }))}
                onRemove={onRemoveSkill}
              />
              {images.length > 0 ? (
                <div className="flex min-w-0 flex-wrap gap-1.5">
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
                </div>
              ) : null}
            </div>
          </InputGroupAddon>
        ) : null}

        <InputGroupTextarea
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            onCaretChange?.(event.target.value, event.target.selectionStart ?? event.target.value.length);
          }}
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
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
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
          <div className="relative z-10 flex shrink-0 items-center gap-1">
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
      </div>
    </form>
  );
}
