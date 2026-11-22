import { AlertTriangle, BadgeCheck, CircleHelp, Sparkles, XCircle } from 'lucide-react';
import type { SearchResultItem } from '../../operations/contracts';
import { verificationSeal, type SealTone } from './verification-seal';

const TONE: Record<SealTone, { text: string; Icon: typeof BadgeCheck }> = {
  ok: { text: 'text-ok', Icon: BadgeCheck },
  neutral: { text: 'text-muted', Icon: CircleHelp },
  warn: { text: 'text-warn', Icon: AlertTriangle },
  danger: { text: 'text-danger', Icon: XCircle },
};

const base = 'inline-flex items-center gap-1.5 text-sm font-semibold';

/** Selo de verificação: ícone e texto, nunca só a cor. */
export function VerificationSeal({ status }: { status: SearchResultItem['verificationStatus'] | undefined }) {
  const seal = verificationSeal(status);
  const { text, Icon } = TONE[seal.tone];
  return (
    <span className={`${base} ${text}`} data-seal="verification" data-tone={seal.tone}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {seal.label}
    </span>
  );
}

/** Selo da análise da IA: sempre rotulado, em cor própria, separado da verificação. */
export function AiSeal() {
  return (
    <span className={`${base} text-accent-strong`} data-seal="ai">
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
      Análise da IA
    </span>
  );
}
