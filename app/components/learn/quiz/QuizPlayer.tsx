import Quiz from '@/components/studio/Quiz';
import type { QuizData } from '@/types';

interface QuizPlayerProps {
  data: QuizData;
  title?: string;
  studioOutputId: string;
  onClose: () => void;
}

export default function QuizPlayer({ data, title, studioOutputId, onClose }: QuizPlayerProps) {
  return (
    <Quiz
      data={data}
      title={title}
      onClose={onClose}
      learnMode
      studioOutputId={studioOutputId}
    />
  );
}
