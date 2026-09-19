import {
  AuthorityVerificationQuery,
  AuthorityVerificationResult,
  LegalSourceProvider,
  SearchOptions,
} from '../contracts/legal-source-provider.js';
import { JurisprudenceDocument } from '@forgelex/legal-data';

export class SourceRouterError extends Error {
  public readonly code: 'UNSUPPORTED_COURT' | 'SOURCE_PROVIDER_UNAVAILABLE' | 'SOURCE_PROVIDER_TIMEOUT';

  constructor(code: SourceRouterError['code'], message: string) {
    super(message);
    this.name = 'SourceRouterError';
    this.code = code;
  }
}

function normalizeDate(value: string): string {
  const brazilianDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return brazilianDate ? `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}` : value.slice(0, 10);
}

export class SourceRouter {
  private readonly providers: LegalSourceProvider[] = [];
  private readonly timeoutMs: number;
  private enabledCourts?: ReadonlySet<string>;

  constructor(options: { timeoutMs?: number; enabledCourts?: readonly string[] } = {}) {
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.enabledCourts = options.enabledCourts
      ? new Set(options.enabledCourts.map((court) => court.trim().toUpperCase()))
      : undefined;
  }

  public registerProvider(provider: LegalSourceProvider): void {
    this.providers.push(provider);
  }

  public getProviders(): LegalSourceProvider[] {
    return [...this.providers];
  }

  public setEnabledCourts(courts: readonly string[]): void {
    this.enabledCourts = new Set(courts.map((court) => court.trim().toUpperCase()));
  }

  public getDefaultSearchCourt(): string | undefined {
    return this.enabledCourts?.size === 1 ? [...this.enabledCourts][0] : undefined;
  }

  public isCourtSearchable(court: string): boolean {
    const normalizedCourt = court.trim().toUpperCase();
    if (this.enabledCourts && !this.enabledCourts.has(normalizedCourt)) return false;
    return this.providers.some((provider) => provider.supportsCourt(normalizedCourt));
  }

  /**
   * Consulta os provedores elegíveis e reconcilia resultados por dedupeKey,
   * garantindo que acórdãos idênticos vindos de fontes distintas não dupliquem.
   */
  public async search(query: string, options: SearchOptions = {}): Promise<JurisprudenceDocument[]> {
    const requestedCourt = options.court?.trim().toUpperCase()
      ?? (this.enabledCourts?.size === 1 ? [...this.enabledCourts][0] : undefined);

    if (requestedCourt && !this.isCourtSearchable(requestedCourt)) {
      throw new SourceRouterError(
        'UNSUPPORTED_COURT',
        `O tribunal '${requestedCourt}' não está habilitado para pesquisa.`,
      );
    }

    const eligibleProviders = this.providers.filter((p) => {
      if (!requestedCourt) return true;
      return p.supportsCourt(requestedCourt);
    });

    // Um catálogo sem provedor não é uma pesquisa sem resultados.
    if (eligibleProviders.length === 0) {
      throw new SourceRouterError(
        'UNSUPPORTED_COURT',
        requestedCourt
          ? `O tribunal '${requestedCourt}' não possui provedor habilitado.`
          : 'Nenhum provedor de fonte está habilitado para pesquisa.',
      );
    }

    // Provedores oficiais têm prioridade, mas a consulta ainda reconcilia
    // respostas de todos os provedores elegíveis.
    eligibleProviders.sort((left, right) => Number(right.isOfficial) - Number(left.isOfficial));

    // Consulta todos os provedores em paralelo com timeout explícito.
    const searchPromises = eligibleProviders.map((p) =>
      this.withTimeout(
        p.search(query, requestedCourt ? { ...options, court: requestedCourt } : options),
        p.id,
      ).catch((err) => ({ providerId: p.id, error: err }))
    );

    const allResultsArrays = await Promise.all(searchPromises);
    const failures = allResultsArrays.filter((item): item is { providerId: string; error: unknown } => 'error' in item);
    const combined = allResultsArrays
      .filter((item): item is JurisprudenceDocument[] => Array.isArray(item))
      .flat();

    if (combined.length === 0 && failures.length > 0) {
      const error = failures[0].error;
      const message = error instanceof Error ? error.message : 'Todos os provedores de fonte falharam.';
      const code = /TIMEOUT/i.test(message) ? 'SOURCE_PROVIDER_TIMEOUT' : 'SOURCE_PROVIDER_UNAVAILABLE';
      throw new SourceRouterError(code, `Nenhum provedor conseguiu concluir a pesquisa: ${message}`);
    }

    if (failures.length > 0) {
      console.warn(
        `[SourceRouter] ${failures.length} provedor(es) falharam; resultados parciais preservados.`,
        failures.map((failure) => failure.providerId)
      );
    }

    // Reconciliação determinística por dedupeKey
    const deduplicatedMap = new Map<string, JurisprudenceDocument>();

    for (const doc of combined) {
      const existing = deduplicatedMap.get(doc.dedupeKey);
      if (!existing) {
        deduplicatedMap.set(doc.dedupeKey, doc);
      } else {
        // Se já existe, atualiza lastSeenAt para a data mais recente
        // e preserva a proveniência oficial se o novo não for oficial
        const earliestFirstSeen =
          new Date(doc.firstSeenAt) < new Date(existing.firstSeenAt) ? doc.firstSeenAt : existing.firstSeenAt;
        const latestLastSeen =
          new Date(doc.lastSeenAt) > new Date(existing.lastSeenAt) ? doc.lastSeenAt : existing.lastSeenAt;

        const existingProvider = this.providers.find((provider) => provider.id === existing.provenance.source.provider);
        const currentProvider = this.providers.find((provider) => provider.id === doc.provenance.source.provider);
        const preferred = currentProvider?.isOfficial && !existingProvider?.isOfficial ? doc : existing;

        deduplicatedMap.set(doc.dedupeKey, {
          ...preferred,
          firstSeenAt: earliestFirstSeen,
          lastSeenAt: latestLastSeen,
        });
      }
    }

    const finalResults = Array.from(deduplicatedMap.values());
    const limit = options.limit ?? 20;
    return finalResults.slice(0, limit);
  }

  public async verifyAuthority(query: AuthorityVerificationQuery): Promise<AuthorityVerificationResult> {
    const checkedAt = new Date().toISOString();
    const documents = await this.search(query.processNumber, { court: query.court, limit: 20 });
    const normalizedNumber = query.processNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const matches = documents.filter(
      (item) => item.processNumber.replace(/[^a-z0-9]/gi, '').toUpperCase() === normalizedNumber
    );

    if (matches.length === 0) {
      return { status: 'NOT_FOUND', checkedAt };
    }

    const selected = matches.find((item) =>
      this.providers.find((provider) => provider.id === item.provenance.source.provider)?.isOfficial
    ) ?? matches[0];
    if (
      query.judgmentDate &&
      !matches.some((item) => normalizeDate(item.judgmentDate) === normalizeDate(query.judgmentDate!))
    ) {
      return {
        status: 'CONFLICTING_METADATA',
        providerId: selected.provenance.source.provider,
        checkedAt,
        document: selected,
        reason: 'A data de julgamento informada diverge das fontes consultadas.',
      };
    }

    const selectedProvider = this.providers.find((provider) => provider.id === selected.provenance.source.provider);
    return {
      status: selected.provenance.verified
        ? selectedProvider?.isOfficial
          ? 'VERIFIED_OFFICIAL'
          : 'VERIFIED_PROVIDER'
        : 'UNVERIFIED',
      providerId: selected.provenance.source.provider,
      checkedAt,
      document: selected,
    };
  }

  private async withTimeout<T>(promise: Promise<T>, providerId: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new SourceRouterError('SOURCE_PROVIDER_TIMEOUT', `Timeout no provedor '${providerId}'.`)),
        this.timeoutMs
      );
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
