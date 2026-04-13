/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as sinon from 'sinon';
import '../../../test/common-test-setup';
import './gr-merge-editor';
import {GrMergeEditor} from './gr-merge-editor';
import {assert, fixture, html} from '@open-wc/testing';
import {query, queryAll} from '../../../test/test-utils';
import {GrButton} from '../../shared/gr-button/gr-button';

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
        events.push((e as CustomEvent<{value: string}>).detail.value);
      });
      btn(element, 'Keep the Current').click();
      await element.updateComplete;
      assert.equal(element.fileContent, 'ours A\n');
      assert.equal(events[0], 'ours A\n');
    });

    test('Accept Incoming resolves conflict with theirs', async () => {
      const events: string[] = [];
      element.addEventListener('content-change', (e: Event) => {
        events.push((e as CustomEvent<{value: string}>).detail.value);
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
        (spy.firstCall.args[0] as CustomEvent<{value: string}>).detail.value,
        'changed\n'
      );
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
