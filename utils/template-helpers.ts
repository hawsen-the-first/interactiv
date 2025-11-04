/**
 * Template helpers for type-safe HTML and CSS strings
 * Provides branded types to prevent mixing HTML/CSS strings with regular strings
 *
 * @example
 * import { html, css } from './utils/template-helpers';
 */

// Branded string types for better type safety
type HTMLString = string & { __brand: "html" };
type CSSString = string & { __brand: "css" };

/**
 * Creates type-safe HTML template strings
 * @example
 * const template = html`<div class="card">${content}</div>`;
 */
export const html = (strings: TemplateStringsArray, ...values: unknown[]): HTMLString =>
  strings.reduce((result, string, i) => result + string + (values[i] || ""), "") as HTMLString;

/**
 * Creates type-safe CSS template strings
 * @example
 * const styles = css`
 *   .card {
 *     padding: ${spacing}px;
 *     color: ${color};
 *   }
 * `;
 */
export const css = (strings: TemplateStringsArray, ...values: unknown[]): CSSString =>
  strings.reduce((result, string, i) => result + string + (values[i] || ""), "") as CSSString;
