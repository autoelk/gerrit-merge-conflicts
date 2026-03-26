/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {css, html, LitElement, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import '../../shared/gr-button/gr-button';
import {
  NumericChangeId,
  PatchSetNum,
  RepoName,
  RevisionPatchSetNum,
} from '../../../types/common';
import {
  ConflictDataInfo,
  ConflictFileInfo,
  ConflictHunkInfo,
  ConflictResolutionChoice,
  ResolveConflictsInput,
} from '../../../api/rest-api';
import {getAppContext} from '../../../services/app-context';
import {assertIsDefined} from '../../../utils/common-util';
import {resolve} from '../../../models/dependency';
import {navigationToken} from '../../core/gr-navigation/gr-navigation';
import {createChangeUrl} from '../../../models/views/change';

type HunkDecision = {
  choice: ConflictResolutionChoice;
  customResultLines?: string[];
};

@customElement('gr-conflict-resolution-view')
export class GrConflictResolutionView extends LitElement {
  @property({attribute: false}) changeNum?: NumericChangeId;
  @property({attribute: false}) patchNum?: PatchSetNum;
  @property({attribute: false}) repo?: RepoName;

  @state() private loading = true;
  @state() private submitting = false;
  @state() private errorMessage = '';
  @state() private data?: ConflictDataInfo;
  @state() private selectedFileIndex = 0;
  @state() private selectedHunkIndex = 0;

  private readonly restApiService = getAppContext().restApiService;
  private readonly getNavigation = resolve(this, navigationToken);
  private readonly navigationBlockReason = 'Unsaved conflict resolution changes.';
  private readonly decisions = new Map<string, HunkDecision>();

  override connectedCallback(): void {
    super.connectedCallback();
    this.load();
    this.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback(): void {
    this.releaseNavigationIfBlocked();
    this.removeEventListener('keydown', this.onKeyDown);
    super.disconnectedCallback();
  }

  static override styles = css`
    :host {
      display: block;
      padding: var(--spacing-l);
    }
    .layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: var(--spacing-l);
      min-height: 600px;
    }
    .sidebar {
      border: 1px solid var(--border-color);
      background: var(--view-background-color);
      padding: var(--spacing-s);
      overflow: auto;
    }
    .fileButton {
      width: 100%;
      text-align: left;
      border: 1px solid var(--border-color);
      background: var(--background-color-secondary);
      color: var(--primary-text-color);
      margin-bottom: var(--spacing-s);
      padding: var(--spacing-s);
      cursor: pointer;
    }
    .fileButton.active {
      border-color: var(--link-color);
    }
    .main {
      border: 1px solid var(--border-color);
      background: var(--view-background-color);
      padding: var(--spacing-l);
    }
    .panes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-m);
    }
    pre {
      margin: 0;
      padding: var(--spacing-m);
      border: 1px solid var(--border-color);
      background: var(--background-color-secondary);
      overflow: auto;
      white-space: pre-wrap;
      font-family: var(--monospace-font-family);
    }
    textarea {
      width: 100%;
      min-height: 220px;
      box-sizing: border-box;
      font-family: var(--monospace-font-family);
      border: 1px solid var(--border-color);
      padding: var(--spacing-m);
      background: var(--background-color-secondary);
      color: var(--primary-text-color);
    }
    .controls {
      display: flex;
      gap: var(--spacing-s);
      margin: var(--spacing-m) 0;
      flex-wrap: wrap;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: var(--spacing-l);
    }
    .error {
      color: var(--warning-foreground);
      margin-bottom: var(--spacing-m);
    }
  `;

  override render() {
    if (this.loading) return html`<div>Loading conflicts...</div>`;
    if (this.errorMessage) return html`<div class="error">${this.errorMessage}</div>`;
    if (!this.data || this.data.files.length === 0) {
      return html`<div>No conflicted files found.</div>`;
    }
    const selectedFile = this.getSelectedFile();
    const selectedHunk = this.getSelectedHunk();
    if (!selectedFile || !selectedHunk) return html`<div>Invalid conflict data.</div>`;

    return html`
      <div class="layout" tabindex="0">
        <div class="sidebar">
          ${this.data.files.map((file, idx) => {
            const unresolved = file.hunks.filter(h => !this.hasDecision(file.path, h.id)).length;
            return html`<button
              class="fileButton ${idx === this.selectedFileIndex ? 'active' : ''}"
              @click=${() => this.selectFile(idx)}
            >
              ${file.path} (${unresolved} unresolved)
            </button>`;
          })}
        </div>
        <div class="main">
          <div><strong>${selectedFile.path}</strong></div>
          <div>
            Hunk ${this.selectedHunkIndex + 1} / ${selectedFile.hunks.length}
          </div>
          <div class="controls">
            <gr-button @click=${this.useOurs}>Use ours</gr-button>
            <gr-button @click=${this.useTheirs}>Use theirs</gr-button>
            <gr-button @click=${this.editCustom}>Edit result</gr-button>
            <gr-button @click=${this.prevHunk}>Previous hunk</gr-button>
            <gr-button @click=${this.nextHunk}>Next hunk</gr-button>
          </div>
          <div class="panes">
            <div>
              <h4>Ours</h4>
              <pre>${this.joinLines(selectedHunk.ours_lines)}</pre>
            </div>
            <div>
              <h4>Theirs</h4>
              <pre>${this.joinLines(selectedHunk.theirs_lines)}</pre>
            </div>
          </div>
          <h4>Result</h4>
          <textarea
            .value=${this.resultText(selectedHunk)}
            @input=${this.onResultEdited}
          ></textarea>
          <div class="footer">
            <div>${this.totalUnresolvedCount()} hunks unresolved</div>
            <gr-button
              primary
              .disabled=${this.totalUnresolvedCount() > 0 || this.submitting}
              @click=${this.submit}
            >
              ${this.submitting ? 'Submitting...' : 'Create resolved patchset'}
            </gr-button>
          </div>
        </div>
      </div>
    `;
  }

  private async load() {
    this.loading = true;
    this.errorMessage = '';
    this.decisions.clear();
    this.releaseNavigationIfBlocked();
    if (!this.changeNum || !this.patchNum) {
      this.errorMessage = 'Missing change or revision number.';
      this.loading = false;
      return;
    }
    this.data = await this.restApiService.getRevisionConflicts(
      this.changeNum,
      this.patchNum
    );
    this.loading = false;
  }

  private getSelectedFile(): ConflictFileInfo | undefined {
    return this.data?.files[this.selectedFileIndex];
  }

  private getSelectedHunk(): ConflictHunkInfo | undefined {
    const file = this.getSelectedFile();
    if (!file) return undefined;
    return file.hunks[this.selectedHunkIndex];
  }

  private decisionKey(path: string, hunkId: string): string {
    return `${path}::${hunkId}`;
  }

  private hasDecision(path: string, hunkId: string): boolean {
    return this.decisions.has(this.decisionKey(path, hunkId));
  }

  private selectFile(idx: number) {
    this.selectedFileIndex = idx;
    this.selectedHunkIndex = 0;
  }

  private useOurs = () => {
    const file = this.getSelectedFile();
    const hunk = this.getSelectedHunk();
    if (!file || !hunk) return;
    this.decisions.set(this.decisionKey(file.path, hunk.id), {
      choice: ConflictResolutionChoice.OURS,
    });
    this.requestUpdate();
    this.blockNavigationIfDirty();
  };

  private useTheirs = () => {
    const file = this.getSelectedFile();
    const hunk = this.getSelectedHunk();
    if (!file || !hunk) return;
    this.decisions.set(this.decisionKey(file.path, hunk.id), {
      choice: ConflictResolutionChoice.THEIRS,
    });
    this.requestUpdate();
    this.blockNavigationIfDirty();
  };

  private editCustom = () => {
    const file = this.getSelectedFile();
    const hunk = this.getSelectedHunk();
    if (!file || !hunk) return;
    const defaultLines = hunk.ours_lines ?? [];
    this.decisions.set(this.decisionKey(file.path, hunk.id), {
      choice: ConflictResolutionChoice.CUSTOM,
      customResultLines: defaultLines,
    });
    this.requestUpdate();
    this.blockNavigationIfDirty();
  };

  private onResultEdited = (e: Event) => {
    const file = this.getSelectedFile();
    const hunk = this.getSelectedHunk();
    if (!file || !hunk) return;
    const value = (e.target as HTMLTextAreaElement).value;
    this.decisions.set(this.decisionKey(file.path, hunk.id), {
      choice: ConflictResolutionChoice.CUSTOM,
      customResultLines: value.split('\n'),
    });
    this.blockNavigationIfDirty();
  };

  private prevHunk = () => {
    this.selectedHunkIndex = Math.max(0, this.selectedHunkIndex - 1);
  };

  private nextHunk = () => {
    const file = this.getSelectedFile();
    if (!file) return;
    this.selectedHunkIndex = Math.min(
      file.hunks.length - 1,
      this.selectedHunkIndex + 1
    );
  };

  private resultText(hunk: ConflictHunkInfo): string {
    const file = this.getSelectedFile();
    if (!file) return '';
    const decision = this.decisions.get(this.decisionKey(file.path, hunk.id));
    if (!decision) return '';
    if (decision.choice === ConflictResolutionChoice.OURS) {
      return this.joinLines(hunk.ours_lines);
    }
    if (decision.choice === ConflictResolutionChoice.THEIRS) {
      return this.joinLines(hunk.theirs_lines);
    }
    return this.joinLines(decision.customResultLines);
  }

  private joinLines(lines?: string[]): string {
    return (lines ?? []).join('\n');
  }

  private totalUnresolvedCount(): number {
    if (!this.data) return 0;
    let unresolved = 0;
    for (const file of this.data.files) {
      for (const hunk of file.hunks) {
        if (!this.hasDecision(file.path, hunk.id)) unresolved++;
      }
    }
    return unresolved;
  }

  private buildResolveInput(): ResolveConflictsInput {
    assertIsDefined(this.data);
    return {
      conflict_version: this.data.conflict_version,
      files: this.data.files.map(file => ({
        path: file.path,
        hunks: file.hunks.map(hunk => {
          const decision = this.decisions.get(this.decisionKey(file.path, hunk.id));
          assertIsDefined(decision, `missing decision for ${file.path}#${hunk.id}`);
          return {
            id: hunk.id,
            choice: decision.choice,
            custom_result_lines: decision.customResultLines,
          };
        }),
      })),
    };
  }

  private async submit() {
    if (!this.changeNum || !this.patchNum || this.totalUnresolvedCount() > 0) return;
    this.submitting = true;
    this.errorMessage = '';
    try {
      const result = await this.restApiService.resolveRevisionConflicts(
        this.changeNum,
        this.patchNum,
        this.buildResolveInput()
      );
      this.releaseNavigationIfBlocked();
      const patchNum = result?.patch_set_number;
      if (patchNum && this.repo) {
        this.getNavigation().setUrl(
          createChangeUrl({
            repo: this.repo,
            changeNum: this.changeNum,
            patchNum: patchNum as RevisionPatchSetNum,
          })
        );
      } else if (this.repo) {
        this.getNavigation().setUrl(
          createChangeUrl({
            repo: this.repo,
            changeNum: this.changeNum,
          })
        );
      }
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : 'Failed to submit resolution.';
    } finally {
      this.submitting = false;
    }
  }

  private blockNavigationIfDirty() {
    if (this.decisions.size > 0) {
      this.getNavigation().blockNavigation(this.navigationBlockReason);
    }
  }

  private releaseNavigationIfBlocked() {
    this.getNavigation().releaseNavigation(this.navigationBlockReason);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'j') this.nextHunk();
    if (e.key === 'k') this.prevHunk();
    if (e.key === 'o') this.useOurs();
    if (e.key === 't') this.useTheirs();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'gr-conflict-resolution-view': GrConflictResolutionView;
  }
}
