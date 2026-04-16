/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import '../../shared/gr-button/gr-button';
import {sharedStyles} from '../../../styles/shared-styles';
import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {fire} from '../../../utils/event-util';
import {Modifier} from '../../../utils/dom-util';
import {ShortcutController} from '../../lit/shortcut-controller';
import {
  applyBothChoice,
  applyConflictChoice,
  parseConflictRegions,
} from '../../../utils/merge-conflict-parser';

const UNDO_STACK_LIMIT = 10;

const SHORTCUTS = [
  {key: 'Alt+C', desc: 'Accept Current'},
  {key: 'Alt+I', desc: 'Accept Incoming'},
  {key: 'Alt+B', desc: 'Accept Both (Current first)'},
  {key: 'Alt+N', desc: 'Next conflict'},
  {key: 'Alt+P', desc: 'Previous conflict'},
  {key: 'Alt+U', desc: 'Undo last resolution'},
] as const;

@customElement('gr-merge-editor')
export class GrMergeEditor extends LitElement {
  /**
   * Fired when the content of the result pane changes.
   *
   * @event content-change
   */

  @property({type: String})
  fileContent = '';

  /** Parent 1 ("Current") file text for context */
  @property({type: String})
  currentRef = '';

  /** Parent 2 ("Incoming") file text for context */
  @property({type: String})
  incomingRef = '';

  /** Optional merge base column */
  @property({type: String})
  baseRef = '';

  @property({type: Boolean})
  showBaseColumn = false;

  @query('#panes')
  private panes?: HTMLDivElement;

  @query('#result')
  private resultTextarea?: HTMLTextAreaElement;

  @state()
  private activeConflictIndex = 0;

  @state()
  private wordWrap = false;

  /**
   * Conflict count at the time the file was last set from outside (or on
   * initial load).  Used to compute the progress bar percentage.
   */
  @state()
  private initialConflictCount = 0;

  /**
   * Stack of previous fileContent strings so the user can undo individual
   * conflict resolutions.  Not @state — changes are picked up because setting
   * fileContent always triggers a re-render.
   */
  private undoStack: string[] = [];

  /**
   * True while we are applying a resolution internally, so willUpdate knows
   * not to reset initialConflictCount / undoStack.
   */
  private _internalUpdate = false;

  private syncScrollSource?: HTMLTextAreaElement;

  private readonly shortcuts = new ShortcutController(this);

  constructor() {
    super();
    this.shortcuts.addLocal(
      {key: 'c', modifiers: [Modifier.ALT_KEY]},
      () => this.applyChoice('current')
    );
    this.shortcuts.addLocal(
      {key: 'i', modifiers: [Modifier.ALT_KEY]},
      () => this.applyChoice('incoming')
    );
    this.shortcuts.addLocal(
      {key: 'b', modifiers: [Modifier.ALT_KEY]},
      () => this.applyBoth('current-first')
    );
    this.shortcuts.addLocal({key: 'n', modifiers: [Modifier.ALT_KEY]}, () =>
      this.onNext()
    );
    this.shortcuts.addLocal({key: 'p', modifiers: [Modifier.ALT_KEY]}, () =>
      this.onPrevious()
    );
    this.shortcuts.addLocal(
      {key: 'u', modifiers: [Modifier.ALT_KEY]},
      () => this.undo()
    );
  }

  static override get styles() {
    return [
      sharedStyles,
      css`
        :host {
          display: block;
        }
        #panes {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-m);
          margin: 0 var(--spacing-l);
          min-height: 60vh;
        }
        .top-row {
          display: flex;
          gap: var(--spacing-m);
          width: 100%;
        }
        .top-row .column {
          flex: 1;
        }
        .bottom-row {
          display: flex;
          margin-top: var(--spacing-m);
          width: 100%;
        }
        .bottom-row .column {
          flex: 1;
        }
        .column {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .column header {
          border-left: 3px solid transparent;
          font-family: var(--header-font-family);
          font-size: var(--font-size-h3);
          font-weight: var(--font-weight-normal);
          margin-bottom: var(--spacing-s);
          padding-left: var(--spacing-s);
        }
        .column header .hint {
          color: var(--deemphasized-text-color);
          display: block;
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-normal);
        }
        .column.base header {
          border-left-color: var(--gray-foreground, #888);
        }
        .column.current header {
          border-left-color: var(--info-foreground, #1a73e8);
        }
        .column.incoming header {
          border-left-color: var(--success-foreground, #188038);
        }
        .column.result header {
          border-left-color: var(--warning-foreground, #e37400);
        }
        textarea {
          border: 1px solid var(--border-color);
          box-sizing: border-box;
          flex: 1;
          font-family: var(--monospace-font-family);
          font-size: var(--font-size-code);
          line-height: calc(var(--font-size-code) + var(--spacing-s));
          min-height: 50vh;
          overflow: auto;
          resize: vertical;
          white-space: pre;
          width: 100%;
        }
        textarea:focus {
          outline: none;
        }
        textarea[readonly] {
          background-color: var(--table-header-background);
        }
        #panes.wrap textarea {
          white-space: pre-wrap;
        }
        .toolbar {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--spacing-s);
          margin: var(--spacing-m) var(--spacing-l);
          position: relative;
        }
        .toolbar .status {
          font-family: var(--header-font-family);
          margin-right: var(--spacing-m);
        }
        .conflict-badge {
          align-items: center;
          border-radius: 12px;
          display: inline-flex;
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-bold);
          gap: var(--spacing-xs);
          padding: 2px var(--spacing-s);
        }
        .conflict-badge.has-conflicts {
          background-color: var(--error-background, #fce8e6);
          color: var(--error-foreground, #c5221f);
        }
        .conflict-badge.resolved {
          background-color: var(--success-background, #e6f4ea);
          color: var(--success-foreground, #188038);
        }
        .progress-bar {
          background: var(--border-color, #ddd);
          border-radius: 4px;
          height: 6px;
          overflow: hidden;
          width: 100px;
        }
        .progress-fill {
          background: var(--success-foreground, #188038);
          height: 100%;
          transition: width 0.2s ease;
        }
        .shortcut-legend {
          color: var(--deemphasized-text-color);
          cursor: pointer;
          font-size: var(--font-size-sm);
          margin-left: auto;
        }
        .shortcut-legend summary {
          list-style: none;
          padding: var(--spacing-xs) var(--spacing-s);
          user-select: none;
        }
        .shortcut-legend summary::-webkit-details-marker {
          display: none;
        }
        .shortcut-legend[open] {
          color: var(--primary-text-color);
        }
        .shortcut-legend table {
          background: var(--dialog-background-color, var(--view-background-color));
          border: 1px solid var(--border-color);
          border-radius: 4px;
          border-spacing: 0;
          padding: var(--spacing-s);
          position: absolute;
          right: 0;
          top: 100%;
          z-index: 10;
        }
        .shortcut-legend td {
          padding: 2px var(--spacing-s);
        }
        .shortcut-legend td:first-child {
          font-family: var(--monospace-font-family);
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-bold);
          white-space: nowrap;
        }
      `,
    ];
  }

  override willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('fileContent')) {
      if (!this._internalUpdate) {
        // External assignment — re-baseline the progress counter and clear undo.
        this.initialConflictCount = parseConflictRegions(
          this.fileContent
        ).length;
        this.undoStack = [];
      }
      this._internalUpdate = false;
      const conflicts = parseConflictRegions(this.fileContent);
      if (conflicts.length === 0) {
        this.activeConflictIndex = 0;
      } else if (this.activeConflictIndex >= conflicts.length) {
        this.activeConflictIndex = conflicts.length - 1;
      }
    }
    if (changedProperties.has('activeConflictIndex')) {
      this.updateComplete.then(() => this.scrollToActiveConflict());
    }
  }

  override render() {
    const conflicts = parseConflictRegions(this.fileContent);
    const conflictNum = conflicts.length ? this.activeConflictIndex + 1 : 0;
    const hasConflict = conflicts.length > 0;
    const paneClasses = [
      this.showBaseColumn ? 'four' : '',
      this.wordWrap ? 'wrap' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const resolvedCount = Math.max(
      0,
      this.initialConflictCount - conflicts.length
    );
    const showProgress = this.initialConflictCount > 0;
    const progressPct = showProgress
      ? Math.round((resolvedCount / this.initialConflictCount) * 100)
      : 0;

    const badge = hasConflict
      ? html`<span class="conflict-badge has-conflicts"
            >${conflictNum} / ${conflicts.length} conflict${
              conflicts.length > 1 ? 's' : ''
            }</span
          >`
      : this.initialConflictCount > 0
        ? html`<span class="conflict-badge resolved"
              >All ${this.initialConflictCount} resolved</span
            >`
        : html`<span class="conflict-badge resolved">No conflicts</span>`;

    return html`
      <div id="panes" class=${paneClasses}>
        <div class="top-row">
          <div class="column current">
            <header>
              Current
              <span class="hint">This patch set's first parent</span>
            </header>
            <textarea
              class="merge-pane"
              readonly
              .value=${this.currentRef}
              @scroll=${this.handleScroll}
            ></textarea>
          </div>
          <div class="column incoming">
            <header>
              Incoming
              <span class="hint">This patch set's second parent</span>
            </header>
            <textarea
              class="merge-pane"
              readonly
              .value=${this.incomingRef}
              @scroll=${this.handleScroll}
            ></textarea>
          </div>
        </div>
        <div class="bottom-row">
          <div class="column result">
            <header>Result <span class="hint">Your edit (saved)</span></header>
            <textarea
              id="result"
              class="merge-pane"
              .value=${this.fileContent}
              @input=${this.handleResultInput}
              @scroll=${this.handleScroll}
            ></textarea>
          </div>
        </div>
      </div>
      <div class="toolbar">
        <span class="status">${badge}</span>
        ${showProgress
          ? html`<div
                class="progress-bar"
                title="${resolvedCount} of ${this.initialConflictCount} resolved"
              >
                <div
                  class="progress-fill"
                  style="width: ${progressPct}%"
                ></div>
              </div>`
          : ''}
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptCurrent}
          title="Keep the Current (first parent) side for this conflict (Alt+C)"
          >Accept Current</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptIncoming}
          title="Keep the Incoming (second parent) side for this conflict (Alt+I)"
          >Accept Incoming</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptBothCurrentFirst}
          title="Accept both sides: Current first, then Incoming (Alt+B)"
          >Accept Both</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptBothIncomingFirst}
          title="Accept both sides: Incoming first, then Current"
          >Accept Both (Incoming First)</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptAllCurrent}
          title="Accept Current for all remaining conflicts"
          >Accept All Current</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptAllIncoming}
          title="Accept Incoming for all remaining conflicts"
          >Accept All Incoming</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict || this.activeConflictIndex <= 0}
          link=""
          @click=${this.onPrevious}
          title="Previous conflict (Alt+P)"
          >Previous conflict</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict ||
          this.activeConflictIndex >= conflicts.length - 1}
          link=""
          @click=${this.onNext}
          title="Next conflict (Alt+N)"
          >Next conflict</gr-button
        >
        <gr-button
          ?disabled=${this.undoStack.length === 0}
          link=""
          @click=${this.undo}
          title="Undo last conflict resolution (Alt+U)"
          >Undo</gr-button
        >
        <gr-button
          link=""
          @click=${this.toggleWordWrap}
          title="Toggle word wrap"
          >Word Wrap${this.wordWrap ? ' \u2713' : ''}</gr-button
        >
        <details class="shortcut-legend">
          <summary>\u2328 Shortcuts</summary>
          <table>
            ${SHORTCUTS.map(
              ({key, desc}) => html`
                <tr>
                  <td>${key}</td>
                  <td>${desc}</td>
                </tr>
              `
            )}
          </table>
        </details>
      </div>
    `;
  }

  private handleScroll = (e: Event) => {
    const src = e.target as HTMLTextAreaElement;
    if (this.syncScrollSource === src) return;
    this.syncScrollSource = src;
    const top = src.scrollTop;
    this.panes?.querySelectorAll('textarea.merge-pane').forEach(el => {
      const ta = el as HTMLTextAreaElement;
      if (ta !== src) ta.scrollTop = top;
    });
    requestAnimationFrame(() => {
      this.syncScrollSource = undefined;
    });
  };

  private handleResultInput(e: Event) {
    const value = (e.target as HTMLTextAreaElement).value;
    this.fileContent = value;
    fire(this, 'content-change', {value});
  }

  private onAcceptCurrent = () => {
    this.applyChoice('current');
  };

  private onAcceptIncoming = () => {
    this.applyChoice('incoming');
  };

  private onAcceptBothCurrentFirst = () => {
    this.applyBoth('current-first');
  };

  private onAcceptBothIncomingFirst = () => {
    this.applyBoth('incoming-first');
  };

  private onAcceptAllCurrent = () => {
    this.applyAllChoices('current');
  };

  private onAcceptAllIncoming = () => {
    this.applyAllChoices('incoming');
  };

  private toggleWordWrap = () => {
    this.wordWrap = !this.wordWrap;
  };

  private pushUndo() {
    this.undoStack = [
      ...this.undoStack.slice(-(UNDO_STACK_LIMIT - 1)),
      this.fileContent,
    ];
  }

  // private but used in tests
  applyChoice(side: 'current' | 'incoming') {
    const conflicts = parseConflictRegions(this.fileContent);
    const cur = conflicts[this.activeConflictIndex];
    if (!cur) return;
    this.pushUndo();
    this._internalUpdate = true;
    const merged = applyConflictChoice(this.fileContent, cur, side);
    this.fileContent = merged;
    fire(this, 'content-change', {value: merged});
    const nextConflicts = parseConflictRegions(merged);
    if (nextConflicts.length === 0) {
      this.activeConflictIndex = 0;
    } else if (this.activeConflictIndex >= nextConflicts.length) {
      this.activeConflictIndex = nextConflicts.length - 1;
    }
  }

  // private but used in tests
  applyAllChoices(side: 'current' | 'incoming') {
    const conflicts = parseConflictRegions(this.fileContent);
    if (conflicts.length === 0) return;
    this.pushUndo();
    this._internalUpdate = true;
    let text = this.fileContent;
    for (let i = conflicts.length - 1; i >= 0; i--) {
      text = applyConflictChoice(text, conflicts[i], side);
    }
    this.fileContent = text;
    fire(this, 'content-change', {value: text});
    this.activeConflictIndex = 0;
  }

  // private but used in tests
  applyBoth(order: 'current-first' | 'incoming-first') {
    const conflicts = parseConflictRegions(this.fileContent);
    const cur = conflicts[this.activeConflictIndex];
    if (!cur) return;
    this.pushUndo();
    this._internalUpdate = true;
    const merged = applyBothChoice(this.fileContent, cur, order);
    this.fileContent = merged;
    fire(this, 'content-change', {value: merged});
    const nextConflicts = parseConflictRegions(merged);
    if (nextConflicts.length === 0) {
      this.activeConflictIndex = 0;
    } else if (this.activeConflictIndex >= nextConflicts.length) {
      this.activeConflictIndex = nextConflicts.length - 1;
    }
  }

  // private but used in tests
  undo() {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this._internalUpdate = true;
    this.fileContent = prev;
    fire(this, 'content-change', {value: prev});
    // undoStack mutation isn't reactive — request re-render so the button
    // disabled state reflects the new (smaller) stack.
    this.requestUpdate();
  }

  private onPrevious = () => {
    if (this.activeConflictIndex > 0) this.activeConflictIndex -= 1;
  };

  private onNext = () => {
    const conflicts = parseConflictRegions(this.fileContent);
    if (this.activeConflictIndex < conflicts.length - 1) {
      this.activeConflictIndex += 1;
    }
  };

  private scrollToActiveConflict() {
    const ta = this.resultTextarea;
    if (!ta) return;
    const conflicts = parseConflictRegions(this.fileContent);
    const cur = conflicts[this.activeConflictIndex];
    if (!cur) return;
    const textBefore = this.fileContent.slice(0, cur.start);
    const linesBefore = (textBefore.match(/\n/g) ?? []).length;
    const lineHeightPx =
      parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const targetTop = linesBefore * lineHeightPx;
    const center = targetTop - ta.clientHeight / 2;
    ta.scrollTop = Math.max(0, center);
    // sync other panes
    this.panes?.querySelectorAll('textarea.merge-pane').forEach(el => {
      const t = el as HTMLTextAreaElement;
      if (t !== ta) t.scrollTop = ta.scrollTop;
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gr-merge-editor': GrMergeEditor;
  }
}
