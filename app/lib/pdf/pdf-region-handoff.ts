/**
 * Markdown to hand off PDF region Q&A from Many into a follow-up with the cloud assistant.
 * Link: [Ver: Title p. N](dome://resource/ID/pdf?page=N)
 */

export interface PdfRegionHandoffLabels {
  contextIntro: string;
  questionLabel: string;
  answerLabel: string;
  /** e.g. "modelo de IA configurado" */
  answerSourceNote: string;
  followUpPrompt: string;
}

export interface PdfRegionHandoffParams {
  resourceId: string;
  resourceTitle: string;
  page: number;
  question: string;
  answer: string;
  labels: PdfRegionHandoffLabels;
}

export function buildPdfRegionHandoff({
  resourceId,
  resourceTitle,
  page,
  question,
  answer,
  labels,
}: PdfRegionHandoffParams): string {
  const title = resourceTitle.trim() || 'PDF';
  const safePage = Math.max(1, Math.floor(page));
  const linkLabel = `${title} (p. ${safePage})`;
  const linkUrl = `dome://resource/${resourceId}/pdf?page=${safePage}`;

  const parts: string[] = [
    labels.contextIntro.trim(),
    '',
    `[Ver: ${linkLabel}](${linkUrl})`,
    '',
    `**${labels.questionLabel}**`,
    question.trim(),
    '',
    `**${labels.answerLabel}** (${labels.answerSourceNote})`,
    answer.trim(),
    '',
    labels.followUpPrompt.trim(),
  ];

  return parts.join('\n');
}
