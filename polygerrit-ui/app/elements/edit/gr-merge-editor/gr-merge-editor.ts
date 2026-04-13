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
import {
  applyConflictChoice,
  parseConflictRegions,
} from '../../../utils/merge-conflict-parser';

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

  @state()
  private activeConflictIndex = 0;

  private syncScrollSource?: HTMLTextAreaElement;

  static override get styles() {
    return [
      sharedStyles,
      css`
        :host {
          display: block;
        }
        #panes {
          display: grid;
          gap: var(--spacing-m);
          grid-template-columns: repeat(var(--merge-cols, 3), minmax(0, 1fr));
          margin: 0 var(--spacing-l);
          min-height: 60vh;
        }
        #panes.four {
          --merge-cols: 4;
        }
        .column {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .column header {
          font-family: var(--header-font-family);
          font-size: var(--font-size-h3);
          font-weight: var(--font-weight-normal);
          margin-bottom: var(--spacing-s);
        }
        .column header .hint {
          color: var(--deemphasized-text-color);
          display: block;
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-normal);
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
        .toolbar {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--spacing-s);
          margin: var(--spacing-m) var(--spacing-l);
        }
        .toolbar .status {
          font-family: var(--header-font-family);
          margin-right: var(--spacing-m);
        }
      `,
    ];
  }

  override willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('fileContent')) {
      const conflicts = parseConflictRegions(this.fileContent);
      if (conflicts.length === 0) {
        this.activeConflictIndex = 0;
      } else if (this.activeConflictIndex >= conflicts.length) {
        this.activeConflictIndex = conflicts.length - 1;
      }
    }
  }

  override render() {
    const conflicts = parseConflictRegions(this.fileContent);
    const conflictNum = conflicts.length
      ? this.activeConflictIndex + 1
      : 0;
    const hasConflict = conflicts.length > 0;
    const paneClass = this.showBaseColumn ? 'four' : '';

    return html`
      <div id="panes" class=${paneClass}>
        ${this.showBaseColumn
          ? html`
              <div class="column">
                <header>
                  Base
                  <span class="hint">Common ancestor (when available)</span>
                </header>
                <textarea
                  class="merge-pane"
                  readonly
                  .value=${this.baseRef}
                  @scroll=${this.handleScroll}
                ></textarea>
              </div>
            `
          : ''}
        <div class="column">
          <header>
            Current
            <span class="hint">This patch set’s first parent</span>
          </header>
          <textarea
            class="merge-pane"
            readonly
            .value=${this.currentRef}
            @scroll=${this.handleScroll}
          ></textarea>
        </div>
        <div class="column">
          <header>
            Incoming
            <span class="hint">This patch set’s second parent</span>
          </header>
          <textarea
            class="merge-pane"
            readonly
            .value=${this.incomingRef}
            @scroll=${this.handleScroll}
          ></textarea>
        </div>
        <div class="column">
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
      <div class="toolbar">
        <span class="status">
          ${hasConflict
            ? `Conflict ${conflictNum} of ${conflicts.length}`
            : 'No conflict markers'}
        </span>
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptCurrent}
          title="Keep the Current (first parent) side for this conflict"
          >Accept Current</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict}
          link=""
          @click=${this.onAcceptIncoming}
          title="Keep the Incoming (second parent) side for this conflict"
          >Accept Incoming</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict || this.activeConflictIndex <= 0}
          link=""
          @click=${this.onPrevious}
          >Previous conflict</gr-button
        >
        <gr-button
          ?disabled=${!hasConflict ||
          this.activeConflictIndex >= conflicts.length - 1}
          link=""
          @click=${this.onNext}
          >Next conflict</gr-button
        >
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

  private applyChoice(side: 'current' | 'incoming') {
    const conflicts = parseConflictRegions(this.fileContent);
    const cur = conflicts[this.activeConflictIndex];
    if (!cur) return;
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

  private onPrevious = () => {
    if (this.activeConflictIndex > 0) this.activeConflictIndex -= 1;
  };

  private onNext = () => {
    const conflicts = parseConflictRegions(this.fileContent);
    if (this.activeConflictIndex < conflicts.length - 1) {
      this.activeConflictIndex += 1;
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'gr-merge-editor': GrMergeEditor;
  }
}
