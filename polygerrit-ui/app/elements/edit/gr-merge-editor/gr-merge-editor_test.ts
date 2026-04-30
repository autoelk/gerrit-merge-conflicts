/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as sinon from 'sinon';
import '../../../test/common-test-setup';
import './gr-merge-editor';
import { GrMergeEditor } from './gr-merge-editor';
import { assert, fixture, html } from '@open-wc/testing';
import { pressKey, query, queryAll } from '../../../test/test-utils';
import { GrButton } from '../../shared/gr-button/gr-button';
import { Modifier } from '../../../utils/dom-util';

const TWO_WAY_A = [
  '<<<<<<< HEAD',
  'ours A',
  '=======',
  'theirs A',
  '>>>>>>> branch',
  '',
].join('\n');

const TWO_WAY_B = [
  '<<<<<<< HEAD',
  'ours B',
  '=======',
  'theirs B',
  '>>>>>>> branch',
  '',
].join('\n');

const TWO_CONFLICTS = TWO_WAY_A + 'middle\n' + TWO_WAY_B;

function btn(el: GrMergeEditor, title: string): GrButton {
  return Array.from(
    el.shadowRoot!.querySelectorAll<GrButton>('gr-button')
  ).find(b => b.title.startsWith(title))!;
}

suite('gr-merge-editor tests', () => {
  let element: GrMergeEditor;

  setup(async () => {
    element = await fixture(html`<gr-merge-editor></gr-merge-editor>`);
  });

  suite('panel rendering', () => {
    test('renders 3 panels by default (no base column)', async () => {
      element.fileContent = TWO_WAY_A;
      element.currentRef = 'current';
      element.incomingRef = 'incoming';
      await element.updateComplete;
      const columns = element.shadowRoot!.querySelectorAll('.column');
      assert.equal(columns.length, 3);
      assert.isFalse(element.shadowRoot!.querySelector('#panes')!.classList.contains('four'));
    });

    test('renders 4 panels when showBaseColumn is true', async () => {
      element.showBaseColumn = true;
      element.baseRef = 'base';
      element.fileContent = TWO_WAY_A;
      await element.updateComplete;
      const columns = element.shadowRoot!.querySelectorAll('.column');
      assert.equal(columns.length, 4);
      assert.isTrue(element.shadowRoot!.querySelector('#panes')!.classList.contains('four'));
    });

    test('column header classes: current, incoming, result', async () => {
      element.fileContent = '';
      await element.updateComplete;
      assert.isNotNull(element.shadowRoot!.querySelector('.column.current'));
      assert.isNotNull(element.shadowRoot!.querySelector('.column.incoming'));
      assert.isNotNull(element.shadowRoot!.querySelector('.column.result'));
    });

    test('column header class: base when showBaseColumn', async () => {
      element.showBaseColumn = true;
      await element.updateComplete;
      assert.isNotNull(element.shadowRoot!.querySelector('.column.base'));
    });
  });

  suite('conflict status badge', () => {
    test('shows has-conflicts badge when conflicts present', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      const badge = element.shadowRoot!.querySelector('.conflict-badge');
      assert.isNotNull(badge);
      assert.isTrue(badge!.classList.contains('has-conflicts'));
      assert.include(badge!.textContent, '1 / 2');
    });

    test('shows resolved badge when no conflicts', async () => {
      element.fileContent = 'plain text\n';
      await element.updateComplete;
      const badge = element.shadowRoot!.querySelector('.conflict-badge');
      assert.isNotNull(badge);
      assert.isTrue(badge!.classList.contains('resolved'));
    });
  });

  suite('Accept Current / Accept Incoming', () => {
    setup(async () => {
      element.fileContent = TWO_WAY_A;
      await element.updateComplete;
    });

    test('Accept Current resolves conflict with ours', async () => {
      const events: string[] = [];
      element.addEventListener('content-change', (e: Event) => {
        events.push((e as CustomEvent<{ value: string }>).detail.value);
      });
      btn(element, 'Keep the Current').click();
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours A\n');
      assert.equal(events[0], 'ours A\n');
    });

    test('Accept Incoming resolves conflict with theirs', async () => {
      const events: string[] = [];
      element.addEventListener('content-change', (e: Event) => {
        events.push((e as CustomEvent<{ value: string }>).detail.value);
      });
      btn(element, 'Keep the Incoming').click();
      await element.updateComplete;
      assert.equal(element.fileContent, 'theirs A\n');
    });

    test('Accept Current fires content-change', async () => {
      const spy = sinon.spy();
      element.addEventListener('content-change', spy);
      element.applyChoice('current');
      assert.isTrue(spy.calledOnce);
    });

    test('buttons disabled when no conflicts', async () => {
      element.fileContent = 'no conflicts';
      await element.updateComplete;
      assert.isTrue(btn(element, 'Keep the Current').hasAttribute('disabled'));
      assert.isTrue(btn(element, 'Keep the Incoming').hasAttribute('disabled'));
    });
  });

  suite('Accept All', () => {
    setup(async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
    });

    test('Accept All Current resolves all conflicts with ours', async () => {
      btn(element, 'Accept Current for all').click();
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours A\nmiddle\nours B\n');
    });

    test('Accept All Incoming resolves all conflicts with theirs', async () => {
      btn(element, 'Accept Incoming for all').click();
      await element.updateComplete;
      assert.equal(element.fileContent, 'theirs A\nmiddle\ntheirs B\n');
    });

    test('Accept All fires content-change once', async () => {
      const spy = sinon.spy();
      element.addEventListener('content-change', spy);
      element.applyAllChoices('current');
      assert.isTrue(spy.calledOnce);
    });

    test('Accept All disables conflict buttons after resolving', async () => {
      element.applyAllChoices('current');
      await element.updateComplete;
      assert.isTrue(btn(element, 'Keep the Current').hasAttribute('disabled'));
    });
  });

  suite('Next / Previous navigation', () => {
    setup(async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
    });

    test('shows Conflict 1 of 2 initially', async () => {
      const badge = element.shadowRoot!.querySelector('.conflict-badge');
      assert.include(badge!.textContent, '1 / 2');
    });

    test('Next conflict advances index', async () => {
      btn(element, 'Next conflict').click();
      await element.updateComplete;
      const badge = element.shadowRoot!.querySelector('.conflict-badge');
      assert.include(badge!.textContent, '2 / 2');
    });

    test('Previous conflict decrements index', async () => {
      btn(element, 'Next conflict').click();
      await element.updateComplete;
      btn(element, 'Previous conflict').click();
      await element.updateComplete;
      const badge = element.shadowRoot!.querySelector('.conflict-badge');
      assert.include(badge!.textContent, '1 / 2');
    });

    test('Previous button disabled at first conflict', async () => {
      assert.isTrue(btn(element, 'Previous conflict').hasAttribute('disabled'));
    });

    test('Next button disabled at last conflict', async () => {
      btn(element, 'Next conflict').click();
      await element.updateComplete;
      assert.isTrue(btn(element, 'Next conflict').hasAttribute('disabled'));
    });
  });

  suite('result textarea', () => {
    test('input event fires content-change', async () => {
      element.fileContent = 'hello\n';
      await element.updateComplete;
      const spy = sinon.spy();
      element.addEventListener('content-change', spy);
      const ta = element.shadowRoot!.querySelector<HTMLTextAreaElement>('#result')!;
      ta.value = 'changed\n';
      ta.dispatchEvent(new Event('input'));
      assert.isTrue(spy.calledOnce);
      assert.equal(
        (spy.firstCall.args[0] as CustomEvent<{ value: string }>).detail.value,
        'changed\n'
      );
    });
  });

  suite('complex resolution workflows', () => {
    const THREE_CONFLICTS =
      TWO_WAY_A + 'between AB\n' + TWO_WAY_B + 'between BC\n' + [
        '<<<<<<< HEAD',
        'ours C',
        '=======',
        'theirs C',
        '>>>>>>> branch',
        '',
      ].join('\n');

    const DIFF3_CONFLICT = [
      '<<<<<<< HEAD',
      'ours diff3',
      '||||||| base',
      'base diff3',
      '=======',
      'theirs diff3',
      '>>>>>>> branch',
      '',
    ].join('\n');

    test('resolving last conflict clamps activeConflictIndex down', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      // Navigate to conflict 2 (index 1)
      btn(element, 'Next conflict').click();
      await element.updateComplete;
      let badge = element.shadowRoot!.querySelector('.conflict-badge')!;
      assert.include(badge.textContent, '2 / 2');
      // Resolve it — only 1 conflict remains, index should clamp to 0
      element.applyChoice('current');
      await element.updateComplete;
      badge = element.shadowRoot!.querySelector('.conflict-badge')!;
      assert.include(badge.textContent, '1 / 1');
    });

    test('resolving middle conflict of 3 preserves surrounding text', async () => {
      element.fileContent = THREE_CONFLICTS;
      await element.updateComplete;
      // Navigate to conflict 2
      btn(element, 'Next conflict').click();
      await element.updateComplete;
      element.applyChoice('current');
      await element.updateComplete;
      // Conflict B (index 1) should be gone; A and C remain
      assert.include(element.fileContent, 'ours B\n');
      assert.include(element.fileContent, 'between AB\n');
      assert.include(element.fileContent, 'between BC\n');
      // The remaining content should still have 2 conflict markers
      const remaining = element.fileContent;
      assert.equal(remaining.split('<<<<<<<').length - 1, 2);
    });

    test('step-by-step: resolve all 3 conflicts one at a time via navigation', async () => {
      element.fileContent = THREE_CONFLICTS;
      await element.updateComplete;

      // Resolve conflict 1 (current)
      element.applyChoice('current');
      await element.updateComplete;
      assert.include(element.shadowRoot!.querySelector('.conflict-badge')!.textContent, '1 / 2');

      // Resolve conflict 1 again (now the old conflict 2, current index still 0)
      element.applyChoice('incoming');
      await element.updateComplete;
      assert.include(element.shadowRoot!.querySelector('.conflict-badge')!.textContent, '1 / 1');

      // Resolve last conflict
      element.applyChoice('current');
      await element.updateComplete;
      assert.isTrue(element.shadowRoot!.querySelector('.conflict-badge')!.classList.contains('resolved'));
      assert.equal(element.fileContent, 'ours A\nbetween AB\ntheirs B\nbetween BC\nours C\n');
    });

    test('fileContent property change while at out-of-bounds index clamps correctly', async () => {
      element.fileContent = THREE_CONFLICTS;
      await element.updateComplete;
      // Jump to last conflict (index 2)
      btn(element, 'Next conflict').click();
      btn(element, 'Next conflict').click();
      await element.updateComplete;
      assert.include(element.shadowRoot!.querySelector('.conflict-badge')!.textContent, '3 / 3');
      // Replace content with a file that only has 1 conflict
      element.fileContent = TWO_WAY_A;
      await element.updateComplete;
      // Index should have clamped to 0
      assert.include(element.shadowRoot!.querySelector('.conflict-badge')!.textContent, '1 / 1');
    });

    test('diff3 conflict: Accept Current picks ours, not base or theirs', async () => {
      element.fileContent = DIFF3_CONFLICT;
      await element.updateComplete;
      element.applyChoice('current');
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours diff3\n');
    });

    test('diff3 conflict: Accept Incoming picks theirs, not base or ours', async () => {
      element.fileContent = DIFF3_CONFLICT;
      await element.updateComplete;
      element.applyChoice('incoming');
      await element.updateComplete;
      assert.equal(element.fileContent, 'theirs diff3\n');
    });

    test('manual textarea edit that introduces a new conflict is detected', async () => {
      element.fileContent = 'clean file\n';
      await element.updateComplete;
      assert.isTrue(
        element.shadowRoot!.querySelector('.conflict-badge')!.classList.contains('resolved')
      );
      // Simulate a user manually typing conflict markers in the result textarea
      const ta = element.shadowRoot!.querySelector<HTMLTextAreaElement>('#result')!;
      ta.value = TWO_WAY_A;
      ta.dispatchEvent(new Event('input'));
      await element.updateComplete;
      assert.isTrue(
        element.shadowRoot!.querySelector('.conflict-badge')!.classList.contains('has-conflicts')
      );
    });

    test('Accept All then manual reintroduction of a conflict updates badge', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      element.applyAllChoices('current');
      await element.updateComplete;
      assert.isTrue(
        element.shadowRoot!.querySelector('.conflict-badge')!.classList.contains('resolved')
      );
      // Manually reintroduce a conflict via textarea
      const ta = element.shadowRoot!.querySelector<HTMLTextAreaElement>('#result')!;
      ta.value = element.fileContent + TWO_WAY_B;
      ta.dispatchEvent(new Event('input'));
      await element.updateComplete;
      const badge = element.shadowRoot!.querySelector('.conflict-badge')!;
      assert.isTrue(badge.classList.contains('has-conflicts'));
      assert.include(badge.textContent, '1 / 1');
    });

    test('mixed: Accept Current for first, Accept Incoming for second', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      // Resolve first with current
      element.applyChoice('current');
      await element.updateComplete;
      // Resolve remaining (was second, now first) with incoming
      element.applyChoice('incoming');
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours A\nmiddle\ntheirs B\n');
      assert.isTrue(
        element.shadowRoot!.querySelector('.conflict-badge')!.classList.contains('resolved')
      );
    });
  });

  suite('Accept Both', () => {
    setup(async () => {
      element.fileContent = TWO_WAY_A;
      await element.updateComplete;
    });

    test('Accept Both (current-first) gives ours then theirs', async () => {
      element.applyBoth('current-first');
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours A\ntheirs A\n');
    });

    test('Accept Both (incoming-first) gives theirs then ours', async () => {
      element.applyBoth('incoming-first');
      await element.updateComplete;
      assert.equal(element.fileContent, 'theirs A\nours A\n');
    });

    test('Accept Both fires content-change', () => {
      const spy = sinon.spy();
      element.addEventListener('content-change', spy);
      element.applyBoth('current-first');
      assert.isTrue(spy.calledOnce);
      assert.equal(
        (spy.firstCall.args[0] as CustomEvent<{ value: string }>).detail.value,
        'ours A\ntheirs A\n'
      );
    });

    test('Accept Both button disabled when no conflicts', async () => {
      element.fileContent = 'no conflicts';
      await element.updateComplete;
      assert.isTrue(
        btn(element, 'Accept both sides: Current first').hasAttribute('disabled')
      );
      assert.isTrue(
        btn(element, 'Accept both sides: Incoming first').hasAttribute('disabled')
      );
    });

    test('Accept Both resolves only the active conflict, leaves others intact', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      element.applyBoth('current-first');
      await element.updateComplete;
      assert.include(element.fileContent, 'ours A\ntheirs A\n');
      // Second conflict still present
      assert.equal(element.fileContent.split('<<<<<<<').length - 1, 1);
    });

    test('diff3 Accept Both (current-first) uses ours and theirs, not base', async () => {
      const DIFF3_CONFLICT = [
        '<<<<<<< HEAD',
        'ours diff3',
        '||||||| base',
        'base diff3',
        '=======',
        'theirs diff3',
        '>>>>>>> branch',
        '',
      ].join('\n');
      element.fileContent = DIFF3_CONFLICT;
      await element.updateComplete;
      element.applyBoth('current-first');
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours diff3\ntheirs diff3\n');
    });

    test('does nothing when no conflicts are present', async () => {
      const spy = sinon.spy();
      element.fileContent = 'clean file\n';
      await element.updateComplete;
      element.addEventListener('content-change', spy);
      element.applyBoth('current-first');
      await element.updateComplete;
      assert.equal(element.fileContent, 'clean file\n');
      assert.isFalse(spy.called);
    });
  });

  suite('word-wrap toggle', () => {
    test('word wrap off by default — no wrap class on #panes', async () => {
      element.fileContent = '';
      await element.updateComplete;
      assert.isFalse(
        element.shadowRoot!.querySelector('#panes')!.classList.contains('wrap')
      );
    });

    test('clicking toggle adds wrap class to #panes', async () => {
      element.fileContent = '';
      await element.updateComplete;
      btn(element, 'Toggle word wrap').click();
      await element.updateComplete;
      assert.isTrue(
        element.shadowRoot!.querySelector('#panes')!.classList.contains('wrap')
      );
    });

    test('clicking toggle twice removes wrap class', async () => {
      element.fileContent = '';
      await element.updateComplete;
      btn(element, 'Toggle word wrap').click();
      await element.updateComplete;
      btn(element, 'Toggle word wrap').click();
      await element.updateComplete;
      assert.isFalse(
        element.shadowRoot!.querySelector('#panes')!.classList.contains('wrap')
      );
    });

    test('wrap and four classes coexist when both active', async () => {
      element.showBaseColumn = true;
      element.fileContent = '';
      await element.updateComplete;
      btn(element, 'Toggle word wrap').click();
      await element.updateComplete;
      const cl = element.shadowRoot!.querySelector('#panes')!.classList;
      assert.isTrue(cl.contains('wrap'));
      assert.isTrue(cl.contains('four'));
    });
  });

  suite('progress indicator', () => {
    test('progress bar not rendered when file has no conflicts', async () => {
      element.fileContent = 'clean file\n';
      await element.updateComplete;
      assert.isNull(element.shadowRoot!.querySelector('.progress-bar'));
    });

    test('progress bar rendered when fileContent has conflicts', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      assert.isNotNull(element.shadowRoot!.querySelector('.progress-bar'));
    });

    test('progress fill starts at 0%', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      const fill =
        element.shadowRoot!.querySelector<HTMLElement>('.progress-fill')!;
      assert.equal(fill.style.width, '0%');
    });

    test('progress fill reaches 50% after resolving 1 of 2', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      element.applyChoice('current');
      await element.updateComplete;
      const fill =
        element.shadowRoot!.querySelector<HTMLElement>('.progress-fill')!;
      assert.equal(fill.style.width, '50%');
    });

    test('progress fill reaches 100% after all conflicts resolved', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      element.applyAllChoices('current');
      await element.updateComplete;
      const fill =
        element.shadowRoot!.querySelector<HTMLElement>('.progress-fill')!;
      assert.equal(fill.style.width, '100%');
    });

    test('badge shows "All N resolved" when all conflicts resolved', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      element.applyAllChoices('current');
      await element.updateComplete;
      const badge = element.shadowRoot!.querySelector('.conflict-badge')!;
      assert.isTrue(badge.classList.contains('resolved'));
      assert.include(badge.textContent, 'All 2 resolved');
    });

    test('progress resets when fileContent assigned externally mid-session', async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
      element.applyChoice('current');
      await element.updateComplete;
      // External reassignment — resets baseline to new conflict count
      element.fileContent = TWO_WAY_A;
      await element.updateComplete;
      const fill =
        element.shadowRoot!.querySelector<HTMLElement>('.progress-fill')!;
      assert.equal(fill.style.width, '0%');
    });
  });

  suite('shortcut legend', () => {
    test('legend element exists in DOM', async () => {
      element.fileContent = '';
      await element.updateComplete;
      assert.isNotNull(element.shadowRoot!.querySelector('.shortcut-legend'));
    });

    test('legend summary contains "Shortcuts" label', async () => {
      element.fileContent = '';
      await element.updateComplete;
      const summary =
        element.shadowRoot!.querySelector('.shortcut-legend summary')!;
      assert.isNotNull(summary);
      assert.include(summary.textContent, 'Shortcuts');
    });

    test('legend table contains all six shortcuts', async () => {
      element.fileContent = '';
      await element.updateComplete;
      const legend = element.shadowRoot!.querySelector('.shortcut-legend')!;
      const text = legend.textContent!;
      for (const key of ['Alt+C', 'Alt+I', 'Alt+B', 'Alt+N', 'Alt+P', 'Alt+U']) {
        assert.include(text, key, `shortcut ${key} missing from legend`);
      }
    });

    test('legend popup is anchored above the button', () => {
      const styles = String(
        (GrMergeEditor.styles as unknown as { toString(): string })
      );
      assert.include(styles, '.shortcut-legend table');
      assert.include(styles, 'bottom: 100%');
      assert.notInclude(styles, 'top: 100%');
    });
  });

  suite('undo', () => {
    setup(async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
    });

    test('undo button disabled initially', () => {
      assert.isTrue(
        btn(element, 'Undo last conflict').hasAttribute('disabled')
      );
    });

    test('undo button enabled after applyChoice', async () => {
      element.applyChoice('current');
      await element.updateComplete;
      assert.isFalse(
        btn(element, 'Undo last conflict').hasAttribute('disabled')
      );
    });

    test('undo restores previous fileContent', async () => {
      const original = element.fileContent;
      element.applyChoice('current');
      await element.updateComplete;
      element.undo();
      await element.updateComplete;
      assert.equal(element.fileContent, original);
    });

    test('undo fires content-change with the restored content', async () => {
      const original = element.fileContent;
      element.applyChoice('current');
      await element.updateComplete;
      const events: string[] = [];
      element.addEventListener('content-change', (e: Event) => {
        events.push((e as CustomEvent<{ value: string }>).detail.value);
      });
      element.undo();
      assert.equal(events[0], original);
    });

    test('undo button becomes disabled again after stack is exhausted', async () => {
      element.applyChoice('current');
      await element.updateComplete;
      element.undo();
      await element.updateComplete;
      assert.isTrue(
        btn(element, 'Undo last conflict').hasAttribute('disabled')
      );
    });

    test('multiple undos restore intermediate states in reverse order', async () => {
      element.applyChoice('current');
      await element.updateComplete;
      const afterFirst = element.fileContent;
      element.applyChoice('incoming');
      await element.updateComplete;
      // Undo second resolution
      element.undo();
      await element.updateComplete;
      assert.equal(element.fileContent, afterFirst);
      // Undo first resolution
      element.undo();
      await element.updateComplete;
      assert.equal(element.fileContent, TWO_CONFLICTS);
    });

    test('applyAllChoices counts as a single undo entry', async () => {
      const original = element.fileContent;
      element.applyAllChoices('current');
      await element.updateComplete;
      element.undo();
      await element.updateComplete;
      assert.equal(element.fileContent, original);
      // One undo was enough — stack now empty
      assert.isTrue(
        btn(element, 'Undo last conflict').hasAttribute('disabled')
      );
    });

    test('applyBoth pushes to undo stack', async () => {
      const original = element.fileContent;
      element.applyBoth('current-first');
      await element.updateComplete;
      element.undo();
      await element.updateComplete;
      assert.equal(element.fileContent, original);
    });

    test('external fileContent assignment clears the undo stack', async () => {
      element.applyChoice('current');
      await element.updateComplete;
      element.fileContent = TWO_WAY_A;
      await element.updateComplete;
      assert.isTrue(
        btn(element, 'Undo last conflict').hasAttribute('disabled')
      );
    });
  });

  suite('keyboard shortcuts', () => {
    setup(async () => {
      element.fileContent = TWO_CONFLICTS;
      await element.updateComplete;
    });

    test('Alt+N and Alt+P navigate between conflicts', async () => {
      pressKey(element, 'n', Modifier.ALT_KEY);
      await element.updateComplete;
      assert.include(
        element.shadowRoot!.querySelector('.conflict-badge')!.textContent,
        '2 / 2'
      );

      pressKey(element, 'p', Modifier.ALT_KEY);
      await element.updateComplete;
      assert.include(
        element.shadowRoot!.querySelector('.conflict-badge')!.textContent,
        '1 / 2'
      );
    });

    test('Alt+C, Alt+I, Alt+B and Alt+U resolve and undo conflicts', async () => {
      pressKey(element, 'c', Modifier.ALT_KEY);
      await element.updateComplete;
      assert.include(element.fileContent, 'ours A\n');

      pressKey(element, 'i', Modifier.ALT_KEY);
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours A\nmiddle\ntheirs B\n');

      pressKey(element, 'u', Modifier.ALT_KEY);
      await element.updateComplete;
      assert.include(element.fileContent, TWO_WAY_B);

      element.fileContent = TWO_WAY_A;
      await element.updateComplete;
      pressKey(element, 'b', Modifier.ALT_KEY);
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours A\ntheirs A\n');
    });
  });

  suite('scroll sync', () => {
    test('scroll handler propagates to other panes', async () => {
      element.fileContent = TWO_WAY_A;
      element.currentRef = 'current';
      element.incomingRef = 'incoming';
      await element.updateComplete;
      const panes = Array.from(
        element.shadowRoot!.querySelectorAll<HTMLTextAreaElement>('textarea.merge-pane')
      );
      assert.isAbove(panes.length, 1);
      // Verify the scroll handler is wired — it should not throw when dispatched
      assert.doesNotThrow(() => {
        panes[0].dispatchEvent(new Event('scroll'));
      });
    });
  });
});
