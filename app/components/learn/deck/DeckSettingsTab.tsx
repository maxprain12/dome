import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
export interface DeckSettings { shuffleByDefault?: boolean; timeboxedSessions?: boolean; }
interface DeckSettingsTabProps { title: string; deckId?: string; settings?: DeckSettings; onEdit?: () => void; onDelete?: () => void; onSettingsChange?: (settings: DeckSettings) => void; }
export default function DeckSettingsTab({ title, deckId, settings, onEdit, onDelete, onSettingsChange }: DeckSettingsTabProps) {
  const { t } = useTranslation();
  const [shuffle, setShuffle] = useState(settings?.shuffleByDefault ?? false);
  const [timeboxed, setTimeboxed] = useState(settings?.timeboxedSessions ?? false);
  useEffect(() => { setShuffle(settings?.shuffleByDefault ?? false); setTimeboxed(settings?.timeboxedSessions ?? false); }, [settings]);
  const persist = async (next: DeckSettings) => { onSettingsChange?.(next); if (deckId) await window.electron.db.flashcards.updateDeck({ id: deckId, settings: JSON.stringify(next) }); };
  return <Card className="max-w-xl"><CardHeader><CardTitle>{t('learn.deck_tab_settings', 'Settings')}</CardTitle><CardDescription>{t('learn.deck_settings_description', 'Choose how this deck behaves during study sessions.')}</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="deck-name">{t('learn.deck_settings_name', 'Deck name')}</FieldLabel><Input id="deck-name" value={title} readOnly /></Field>{deckId ? <><Field orientation="horizontal"><div className="flex flex-1 flex-col gap-1"><FieldLabel htmlFor="deck-shuffle">{t('learn.settings_shuffle', 'Shuffle by default')}</FieldLabel><FieldDescription>{t('learn.settings_shuffle_description', 'Change the order of cards for each session.')}</FieldDescription></div><Switch id="deck-shuffle" checked={shuffle} onCheckedChange={(checked) => { setShuffle(checked); void persist({ shuffleByDefault: checked, timeboxedSessions: timeboxed }); }} /></Field><Field orientation="horizontal"><div className="flex flex-1 flex-col gap-1"><FieldLabel htmlFor="deck-timeboxed">{t('learn.settings_timeboxed', 'Time-boxed sessions')}</FieldLabel><FieldDescription>{t('learn.settings_timeboxed_description', 'Keep review sessions focused and concise.')}</FieldDescription></div><Switch id="deck-timeboxed" checked={timeboxed} onCheckedChange={(checked) => { setTimeboxed(checked); void persist({ shuffleByDefault: shuffle, timeboxedSessions: checked }); }} /></Field></> : null}</FieldGroup></CardContent><CardFooter className="justify-between">{onEdit ? <Button type="button" variant="outline" onClick={onEdit}>{t('ui.edit', 'Edit')}</Button> : <span />}{onDelete ? <Button type="button" variant="destructive" onClick={onDelete}>{t('ui.delete', 'Delete')}</Button> : null}</CardFooter></Card>;
}
