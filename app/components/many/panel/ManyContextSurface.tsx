import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface ManyContextPin {
  id: string;
  title: string;
  type?: string;
}

export interface ManyContextCapability {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

interface ManyContextSurfaceProps {
  pageTitle: string;
  pageDescription: string;
  pageUrl?: string;
  pins: ManyContextPin[];
  capabilities: ManyContextCapability[];
  modelLabel: string;
  providerLabel: string;
  contextTitle: string;
  contextEmpty: string;
  capabilitiesTitle: string;
  configurationTitle: string;
  noPinsLabel: string;
  usage?: ReactNode;
  pageTools?: ReactNode;
  className?: string;
}

/** Portable equivalent of ManyContextView for browser and remote clients. */
export default function ManyContextSurface({
  pageTitle,
  pageDescription,
  pageUrl,
  pins,
  capabilities,
  modelLabel,
  providerLabel,
  contextTitle,
  contextEmpty,
  capabilitiesTitle,
  configurationTitle,
  noPinsLabel,
  usage,
  pageTools,
  className,
}: ManyContextSurfaceProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3', className)}>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{contextTitle}</CardTitle>
          <CardDescription>{pageDescription || contextEmpty}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {pageTitle ? (
            <Badge variant="outline" className="max-w-full">
              <span className="truncate">{pageTitle}</span>
            </Badge>
          ) : null}
          {pageUrl ? (
            <a
              href={pageUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-muted-foreground"
            >
              {pageUrl}
            </a>
          ) : null}
          {pins.length > 0 ? (
            <div className="flex flex-col gap-1">
              {pins.map((pin) => (
                <div
                  key={pin.id}
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-muted px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {pin.title}
                  </span>
                  {pin.type ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {pin.type}
                    </Badge>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{noPinsLabel}</p>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{capabilitiesTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {capabilities.map((capability) => (
            <div key={capability.id} className="flex items-center gap-2.5">
              <Label htmlFor={capability.id} className="min-w-0 flex-1 font-normal">
                {capability.label}
              </Label>
              <Switch
                id={capability.id}
                size="sm"
                checked={capability.checked}
                onCheckedChange={capability.onCheckedChange}
                disabled={capability.disabled}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{configurationTitle}</CardTitle>
          <CardDescription>{providerLabel}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-medium">{modelLabel}</span>
          {usage}
        </CardContent>
      </Card>
      {pageTools}
    </div>
  );
}
