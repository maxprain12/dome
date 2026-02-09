
/**
 * ReadingIndicator - Animated typing indicator (3 dots)
 * Shows while the AI is processing/thinking
 */

interface ReadingIndicatorProps {
  className?: string;
}

export default function ReadingIndicator({ className = '' }: ReadingIndicatorProps) {
  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <span 
        className="w-2 h-2 rounded-full bg-current animate-bounce"
        style={{ animationDelay: '0ms', animationDuration: '600ms' }}
      />
      <span 
        className="w-2 h-2 rounded-full bg-current animate-bounce"
        style={{ animationDelay: '150ms', animationDuration: '600ms' }}
      />
      <span 
        className="w-2 h-2 rounded-full bg-current animate-bounce"
        style={{ animationDelay: '300ms', animationDuration: '600ms' }}
      />
    </div>
  );
}
