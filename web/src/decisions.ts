// What the card of asks and the done card send, shared by the website's
// dock (App.tsx) and the Tauri app's thread screen: the same words the Mac
// sends (Decisions.message, Decisions.followUpMessage).
type Ask = { options?: string[]; reply?: string };

// What an ask offers: its options, else the reply it wants ("done").
export function choices(a: Ask): string[] {
  if (a.options?.length) return a.options;
  return a.reply?.trim() ? [a.reply.trim()] : [];
}

// The message the Mac sends for picked asks (Decisions.message): each
// question then its answer, numbered when the card had several, then
// anything else typed.
export function answerMessage(count: number, answers: { index: number; action: string; answer: string }[], extra: string): string {
  const parts = answers.map((a) => (count === 1 ? `${a.action}\n${a.answer}` : `${a.index + 1}. ${a.action}\n   ${a.answer.replace(/\n/g, '\n   ')}`));
  if (extra) parts.push(extra);
  return parts.join('\n\n');
}

// Ticked follow-ups (Decisions.followUpMessage): one on its own, several as
// a list, then anything else typed.
export function followUpMessage(follow: string[], extra: string): string {
  let body = follow.length === 1 ? follow[0]! : follow.map((f) => `- ${f}`).join('\n');
  if (extra) body += `\n\n${extra}`;
  return body;
}
