/**
 * Parses Git conflict markers in working-tree text.
 */

export interface ConflictRegion {
  /** Inclusive start offset in the source string */
  start: number;
  /** Exclusive end offset */
  end: number;
  kind: '2way' | 'diff3';
  /** Lines after <<<<<<< through the line before the first separator (||||||| or =======) */
  ours: string;
  /** Lines after ======= (after base in diff3) through the line before >>>>>>> */
  theirs: string;
  /** diff3 only: lines after ||||||| through the line before ======= */
  base?: string;
}

interface Line {
  start: number;
  end: number;
  content: string;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  while (offset < text.length) {
    const nl = text.indexOf('\n', offset);
    const end = nl === -1 ? text.length : nl + 1;
    const raw = text.slice(offset, end);
    const content = raw.replace(/\r?\n$/, '');
    lines.push({start: offset, end, content});
    offset = end;
  }
  return lines;
}

function sliceSpan(text: string, lines: Line[]): string {
  if (lines.length === 0) return '';
  return text.slice(lines[0].start, lines[lines.length - 1].end);
}

/**
 * True when the text contains a standard conflict opener line (Git / Gerrit).
 * After the seven '&lt;' characters, Git allows any whitespace before the label.
 */
export function textHasConflictMarkers(text: string): boolean {
  return /^<<<<<<<\s/m.test(text);
}

/**
 * Returns non-overlapping conflict regions in document order. Malformed or nested blocks are skipped.
 */
export function parseConflictRegions(text: string): ConflictRegion[] {
  const lines = splitLines(text);
  const regions: ConflictRegion[] = [];
  let i = 0;
  outer: while (i < lines.length) {
    if (!lines[i].content.startsWith('<<<<<<<')) {
      i++;
      continue;
    }
    const blockStart = lines[i].start;
    let j = i + 1;
    const oursLines: Line[] = [];
    while (j < lines.length) {
      const lc = lines[j].content;
      if (lc.startsWith('<<<<<<<')) {
        i = j;
        continue outer;
      }
      if (lc === '=======' || lc.startsWith('|||||||')) break;
      oursLines.push(lines[j]);
      j++;
    }
    if (j >= lines.length) break;

    const sep1 = lines[j].content;
    let kind: '2way' | 'diff3';
    const baseLines: Line[] = [];
    if (sep1.startsWith('|||||||')) {
      kind = 'diff3';
      j++;
      while (j < lines.length) {
        const lc = lines[j].content;
        if (lc.startsWith('<<<<<<<')) {
          i = j;
          continue outer;
        }
        if (lc === '=======') break;
        baseLines.push(lines[j]);
        j++;
      }
      if (j >= lines.length || lines[j].content !== '=======') {
        i++;
        continue;
      }
      j++;
    } else if (sep1 === '=======') {
      kind = '2way';
      j++;
    } else {
      i++;
      continue;
    }

    const theirsLines: Line[] = [];
    while (j < lines.length) {
      const lc = lines[j].content;
      if (lc.startsWith('<<<<<<<')) {
        i = j;
        continue outer;
      }
      if (lc.startsWith('>>>>>>>')) break;
      theirsLines.push(lines[j]);
      j++;
    }
    if (j >= lines.length || !lines[j].content.startsWith('>>>>>>>')) {
      i++;
      continue;
    }
    const blockEnd = lines[j].end;
    regions.push({
      start: blockStart,
      end: blockEnd,
      kind,
      ours: sliceSpan(text, oursLines),
      theirs: sliceSpan(text, theirsLines),
      base: kind === 'diff3' ? sliceSpan(text, baseLines) : undefined,
    });
    i = j + 1;
  }
  return regions;
}

export function applyConflictChoice(
  text: string,
  region: ConflictRegion,
  side: 'current' | 'incoming'
): string {
  const replacement = side === 'current' ? region.ours : region.theirs;
  return text.slice(0, region.start) + replacement + text.slice(region.end);
}

export function applyBothChoice(
  text: string,
  region: ConflictRegion,
  order: 'current-first' | 'incoming-first'
): string {
  const first = order === 'current-first' ? region.ours : region.theirs;
  const second = order === 'current-first' ? region.theirs : region.ours;
  return text.slice(0, region.start) + first + second + text.slice(region.end);
}
