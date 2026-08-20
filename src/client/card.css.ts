/** Stylesheet for the AutoRouter plugin card. Scoped by `.dsh-autorouter`. */

export const CARD_STYLE_ID = 'dsh-llm-autorouter-card-css'

/**
 * Visual language copied from the in-tree Plugins cards (`PluginCard` /
 * `fields`): accordion chrome, labelled controls, and pill badges, using the
 * same `--dsw-alias-*` tokens so this out-of-tree card sits next to 网页搜索.
 */
export const CARD_CSS = `
.dsh-autorouter {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
  transition: border-color .16s, background .16s;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter:hover { border-color: var(--dsw-alias-label-dimmed); }
.dsh-autorouter.is-open {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-autorouter-header {
  width: 100%;
  appearance: none;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
}
.dsh-autorouter-header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh-autorouter-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-autorouter-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-description {
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-pending {
  flex: none;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh-autorouter-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transition: transform .16s;
}
.dsh-autorouter.is-open .dsh-autorouter-chevron { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) {
  .dsh-autorouter, .dsh-autorouter-chevron { transition: none; }
}
.dsh-autorouter-body {
  border-top: 1px solid var(--dsw-alias-border-l2);
  margin: 0 16px;
  padding-bottom: 8px;
}
.dsh-autorouter-readonly {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}
.dsh-autorouter-field + .dsh-autorouter-field {
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-autorouter-field-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-autorouter-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-badges {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dsh-autorouter-badge {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  font-weight: 500;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh-autorouter-badge.is-muted {
  background: none;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-reset {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh-autorouter-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dsh-autorouter-reset:disabled { cursor: default; }
.dsh-autorouter-input,
.dsh-autorouter-search {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-input:focus-visible,
.dsh-autorouter-search:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.dsh-autorouter-input:disabled,
.dsh-autorouter-search:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.dsh-autorouter-hint,
.dsh-autorouter-status {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-status.is-error { color: var(--dsw-alias-label-error); }
.dsh-autorouter-status.is-ok { color: var(--dsw-alias-label-secondary); }
.dsh-autorouter-footer,
.dsh-autorouter-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-autorouter-toolbar { justify-content: space-between; }
.dsh-autorouter-toolbar .dsh-autorouter-hint,
.dsh-autorouter-toolbar .dsh-autorouter-status { flex: 1; min-width: 0; }
.dsh-autorouter-footer .dsh-autorouter-status,
.dsh-autorouter-footer .dsh-autorouter-hint { flex: 1; min-width: 0; }
.dsh-autorouter-toolbar-actions { display: flex; gap: 8px; }
.dsh-autorouter-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh-autorouter-btn.is-ghost {
  border-color: var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh-autorouter-btn.is-ghost:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-autorouter-btn.is-primary {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
}
.dsh-autorouter-btn:disabled { opacity: 0.4; cursor: default; }
.dsh-autorouter-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-autorouter-models {
  border-top: 1px solid var(--dsw-alias-border-l2);
  padding: 12px 0 4px;
}
.dsh-autorouter-models-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.dsh-autorouter-models-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}
.dsh-autorouter-models-meta {
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-group {
  padding: 10px 0;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-autorouter-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}
.dsh-autorouter-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.dsh-autorouter-list > li { min-width: 0; }
.dsh-autorouter-model {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.dsh-autorouter-model:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-model input { margin-top: 3px; accent-color: var(--dsw-alias-label-primary); }
.dsh-autorouter-model-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-wrap: anywhere;
}
.dsh-autorouter-model-id {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
`

/** Install the card stylesheet once per document. */
export function ensureCardStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(CARD_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = CARD_STYLE_ID
  style.textContent = CARD_CSS
  document.head.appendChild(style)
}
