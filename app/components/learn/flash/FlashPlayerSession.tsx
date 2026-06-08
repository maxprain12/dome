import { useEffect } from 'react';
import { useLearnStore } from '@/lib/store/useLearnStore';
import FlashPlayer from './FlashPlayer';

interface FlashPlayerSessionProps {
  deckId: string;
  onClose: () => void;
}

export default function FlashPlayerSession({ deckId, onClose }: FlashPlayerSessionProps) {
  const startStudy = useLearnStore((s) => s.startStudy);
  const isStudying = useLearnStore((s) => s.isStudying);

  useEffect(() => {
    void startStudy(deckId);
  }, [deckId, startStudy]);

  if (!isStudying) return null;

  return <FlashPlayer onSessionEnd={onClose} />;
}
