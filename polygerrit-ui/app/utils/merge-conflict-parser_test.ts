/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {assert} from '@open-wc/testing';
import '../test/common-test-setup';
import {
  applyConflictChoice,
  parseConflictRegions,
  textHasConflictMarkers,
} from './merge-conflict-parser';

const TWO_WAY = [
  '<<<<<<< HEAD',
  'ours line',
  '=======',
  'theirs line',
  '>>>>>>> branch',
  '',
].join('\n');

const DIFF3 = [
  '<<<<<<< HEAD',
  'ours line',
  '||||||| base',
  'base line',
  '=======',
  'theirs line',
  '>>>>>>> branch',
  '',
].join('\n');

suite('merge-conflict-parser tests', () => {
  suite('textHasConflictMarkers', () => {
    test('returns true when conflict markers present', () => {
      assert.isTrue(textHasConflictMarkers(TWO_WAY));
    });

    test('returns true for diff3 markers', () => {
      assert.isTrue(textHasConflictMarkers(DIFF3));
    });

    test('returns false for plain text', () => {
      assert.isFalse(textHasConflictMarkers('no conflicts here\n'));
    });

    test('returns false for a line that is not a full opener', () => {
      // Only 6 '<' chars — not 7, so not a valid opener
      assert.isFalse(textHasConflictMarkers('<<<<<< not-enough\n=======\n>>>>>>>\n'));
    });
  });

  suite('parseConflictRegions', () => {
    test('returns empty array when no conflicts', () => {
      assert.deepEqual(parseConflictRegions('hello\nworld\n'), []);
    });

    test('parses a single 2-way conflict', () => {
      const regions = parseConflictRegions(TWO_WAY);
      assert.equal(regions.length, 1);
      const r = regions[0];
      assert.equal(r.kind, '2way');
      assert.equal(r.ours, 'ours line\n');
      assert.equal(r.theirs, 'theirs line\n');
      assert.isUndefined(r.base);
    });

    test('parses a single diff3 conflict', () => {
      const regions = parseConflictRegions(DIFF3);
      assert.equal(regions.length, 1);
      const r = regions[0];
      assert.equal(r.kind, 'diff3');
      assert.equal(r.ours, 'ours line\n');
      assert.equal(r.base, 'base line\n');
      assert.equal(r.theirs, 'theirs line\n');
    });

    test('parses multiple conflicts in document order', () => {
      const text = TWO_WAY + 'middle\n' + TWO_WAY;
      const regions = parseConflictRegions(text);
      assert.equal(regions.length, 2);
      assert.isTrue(regions[0].start < regions[1].start);
    });

    test('start/end offsets span the full conflict block', () => {
      const prefix = 'before\n';
      const text = prefix + TWO_WAY;
      const regions = parseConflictRegions(text);
      assert.equal(regions.length, 1);
      assert.equal(regions[0].start, prefix.length);
      assert.equal(regions[0].end, text.length);
      assert.equal(text.slice(regions[0].start, regions[0].end), TWO_WAY);
    });

    test('skips malformed block missing >>>>>>>', () => {
      const malformed = '<<<<<<< HEAD\nours\n=======\ntheirs\n';
      assert.deepEqual(parseConflictRegions(malformed), []);
    });
  });

  suite('applyConflictChoice', () => {
    test('current replaces conflict block with ours', () => {
      const result = applyConflictChoice(
        TWO_WAY,
        parseConflictRegions(TWO_WAY)[0],
        'current'
      );
      assert.equal(result, 'ours line\n');
    });

    test('incoming replaces conflict block with theirs', () => {
      const result = applyConflictChoice(
        TWO_WAY,
        parseConflictRegions(TWO_WAY)[0],
        'incoming'
      );
      assert.equal(result, 'theirs line\n');
    });

    test('applies to correct region when prefix present', () => {
      const text = 'before\n' + TWO_WAY;
      const region = parseConflictRegions(text)[0];
      const result = applyConflictChoice(text, region, 'current');
      assert.equal(result, 'before\nours line\n');
    });

    test('works with multiple conflicts resolved in reverse order', () => {
      const text = TWO_WAY + 'mid\n' + TWO_WAY;
      let result = text;
      const regions = parseConflictRegions(result);
      for (let i = regions.length - 1; i >= 0; i--) {
        result = applyConflictChoice(result, regions[i], 'current');
      }
      assert.equal(result, 'ours line\nmid\nours line\n');
    });
  });
});
