/**
 * Logo e símbolo do ForgeLex (27/11), vetorizados do desenho aprovado por Boni: "Forge" em azul-marinho com o traço
 * dourado no F e "Lex" em dourado; o símbolo é o F com coluna e balança. O nome acessível fica no link ou botão que os
 * envolve, por isso as imagens são decorativas.
 */
export const LOGO_SRC = '/brand/forgelex-logo.svg';
export const SYMBOL_SRC = '/brand/forgelex-simbolo.svg';

/** Proporção do desenho (largura / altura do viewBox), para reservar o espaço antes de a imagem carregar. */
const LOGO_RATIO = 670.75 / 181.25;

export function BrandLogo({ height = 30, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      height={height}
      width={Math.round(height * LOGO_RATIO)}
      className={`block shrink-0 ${className}`}
      style={{ height, width: 'auto' }}
    />
  );
}

export function BrandSymbol({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src={SYMBOL_SRC} alt="" width={size} height={size} className={`block shrink-0 ${className}`} />;
}
