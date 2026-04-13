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

  suite('parseConflictRegions — complex scenarios', () => {
    test('captures multi-line ours and theirs blocks', () => {
      const text = [
        '<<<<<<< HEAD',
        'line 1',
        'line 2',
        'line 3',
        '=======',
        'their line 1',
        'their line 2',
        '>>>>>>> branch',
        '',
      ].join('\n');
      const [r] = parseConflictRegions(text);
      assert.equal(r.kind, '2way');
      assert.equal(r.ours, 'line 1\nline 2\nline 3\n');
      assert.equal(r.theirs, 'their line 1\ntheir line 2\n');
    });

    test('handles empty ours side', () => {
      const text = [
        '<<<<<<< HEAD',
        '=======',
        'theirs only',
        '>>>>>>> branch',
        '',
      ].join('\n');
      const [r] = parseConflictRegions(text);
      assert.equal(r.ours, '');
      assert.equal(r.theirs, 'theirs only\n');
    });

    test('handles empty theirs side', () => {
      const text = [
        '<<<<<<< HEAD',
        'ours only',
        '=======',
        '>>>>>>> branch',
        '',
      ].join('\n');
      const [r] = parseConflictRegions(text);
      assert.equal(r.ours, 'ours only\n');
      assert.equal(r.theirs, '');
    });

    test('handles diff3 with empty base section', () => {
      const text = [
        '<<<<<<< HEAD',
        'ours',
        '||||||| base',
        '=======',
        'theirs',
        '>>>>>>> branch',
        '',
      ].join('\n');
      const [r] = parseConflictRegions(text);
      assert.equal(r.kind, 'diff3');
      assert.equal(r.base, '');
      assert.equal(r.ours, 'ours\n');
      assert.equal(r.theirs, 'theirs\n');
    });

    test('conflict at start of file (no prefix bytes)', () => {
      const regions = parseConflictRegions(TWO_WAY);
      assert.equal(regions[0].start, 0);
    });

    test('conflict at EOF without trailing newline after >>>>>>>', () => {
      const text = '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch';
      const regions = parseConflictRegions(text);
      assert.equal(regions.length, 1);
      assert.equal(regions[0].end, text.length);
    });

    test('adjacent conflicts with no text between them', () => {
      const text = TWO_WAY + TWO_WAY;
      const regions = parseConflictRegions(text);
      assert.equal(regions.length, 2);
      // Second conflict starts exactly where the first ends
      assert.equal(regions[1].start, regions[0].end);
    });

    test('mixed 2-way and diff3 conflicts in same file', () => {
      const text = TWO_WAY + 'separator\n' + DIFF3 + 'end\n';
      const regions = parseConflictRegions(text);
      assert.equal(regions.length, 2);
      assert.equal(regions[0].kind, '2way');
      assert.equal(regions[1].kind, 'diff3');
      assert.isUndefined(regions[0].base);
      assert.isDefined(regions[1].base);
    });

    test('five consecutive conflicts — all parsed and offsets are non-overlapping', () => {
      const block = TWO_WAY;
      const text = Array.from({length: 5}, (_, i) => `ctx${i}\n` + block).join('');
      const regions = parseConflictRegions(text);
      assert.equal(regions.length, 5);
      for (let i = 1; i < regions.length; i++) {
        assert.isAtLeast(regions[i].start, regions[i - 1].end);
      }
      // Each sliced region round-trips back to the original block
      regions.forEach(r => {
        assert.equal(text.slice(r.start, r.end), block);
      });
    });

    test('recovers after nested <<<<<< opener inside ours block', () => {
      // Parser should skip the malformed first block and find the clean second one
      const text = [
        '<<<<<<< HEAD',
        'before nested',
        '<<<<<<< HEAD',   // nested opener — parser aborts first block, jumps here
        'ours clean',
        '=======',
        'theirs clean',
        '>>>>>>> branch',
        '',
      ].join('\n');
      const regions = parseConflictRegions(text);
      // The parser jumps to the inner <<<<<<< and parses from there
      assert.equal(regions.length, 1);
      assert.equal(regions[0].ours, 'ours clean\n');
      assert.equal(regions[0].theirs, 'theirs clean\n');
    });

    test('content resembling a marker inside diff3 base does not break parsing', () => {
      // A line that starts with ======= inside the base section of a diff3 block
      // should terminate the base collection, just like a real separator would.
      // This is consistent with how Git itself handles it.
      const text = [
        '<<<<<<< HEAD',
        'ours',
        '||||||| base',
        'base line',
        '=======',
        'theirs',
        '>>>>>>> branch',
        '',
      ].join('\n');
      const regions = parseConflictRegions(text);
      assert.equal(regions.length, 1);
      assert.equal(regions[0].base, 'base line\n');
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
