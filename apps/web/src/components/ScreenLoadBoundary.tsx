import React from 'react';

export class ScreenLoadBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  public state = { failed: false };

  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  public render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="page-container py-16">
        <div role="alert" className="surface max-w-2xl space-y-4 p-6">
          <h1 className="font-editorial text-2xl font-bold text-stone-900">Não foi possível abrir esta página</h1>
          <p className="text-sm text-stone-600">
            Isso pode acontecer após uma atualização ou uma falha de conexão. Verifique sua conexão e atualize a página
            para tentar novamente.
          </p>
          <button className="btn-primary" type="button" onClick={() => window.location.reload()}>
            Atualizar página
          </button>
        </div>
      </section>
    );
  }
}
