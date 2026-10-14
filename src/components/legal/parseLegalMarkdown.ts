// A small parser for the Markdown subset the legal documents are written in
// (src/content/legal/*.md, and legal_documents.body once they are published).
// It understands exactly what those documents use and nothing more:
//
//   ## Heading            a section, listed in the table of contents
//   ### Heading           a sub-heading
//   > text                a notice, set conspicuously (Consumer Protection Act s.43)
//   - item / 1. item      lists; "   - item" under a numbered item nests one level
//   | a | b |             a table; the second line (| --- |) is the separator
//   **bold**, [text](href) inline
//   blank line            ends a paragraph
//
// Lines that are not one of these are joined into paragraphs, so a plain-text
// body (version 1 of every document is mostly plain text) still renders sensibly.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export interface ListItem {
  content: Inline[];
  children?: Block;
}

export type Block =
  | { kind: 'heading'; level: 2 | 3; id: string; text: string }
  | { kind: 'paragraph'; content: Inline[]; lines: Inline[][] }
  | { kind: 'notice'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] };

export interface LegalHeading {
  id: string;
  text: string;
}

export interface ParsedLegalDocument {
  blocks: Block[];
  /** The ## headings, in order, for the table of contents. */
  headings: LegalHeading[];
}

/** "Commission and fees" -> "commission-and-fees". Stable, so links to a section survive edits elsewhere. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  // **bold** or [text](href); everything between is plain text.
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > last) out.push({ kind: 'text', text: source.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ kind: 'strong', children: parseInline(match[1]) });
    else out.push({ kind: 'link', href: match[3], children: parseInline(match[2]) });
    last = match.index + match[0].length;
  }
  if (last < source.length) out.push({ kind: 'text', text: source.slice(last) });
  return out;
}

const tableCells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => parseInline(cell.trim()));

const BULLET = /^- +(.*)$/;
const NUMBERED = /^\d+\. +(.*)$/;
const NESTED_BULLET = /^ {2,}- +(.*)$/;

export function parseLegalMarkdown(source: string): ParsedLegalDocument {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const headings: LegalHeading[] = [];
  const usedIds = new Map<string, number>();
  let i = 0;

  const uniqueId = (text: string) => {
    const base = slugify(text) || 'section';
    const n = usedIds.get(base) ?? 0;
    usedIds.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { i += 1; continue; }

    const heading = /^(#{2,3}) +(.*)$/.exec(trimmed);
    if (heading) {
      const text = heading[2].trim();
      const id = uniqueId(text);
      const level = heading[1].length === 2 ? 2 : 3;
      blocks.push({ kind: 'heading', level, id, text });
      if (level === 2) headings.push({ id, text });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        parts.push(lines[i].trim().replace(/^> ?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'notice', content: parseInline(parts.join(' ')) });
      continue;
    }

    if (trimmed.startsWith('|')) {
      const rowsText: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rowsText.push(lines[i]);
        i += 1;
      }
      const [headLine, maybeSeparator, ...rest] = rowsText;
      const hasSeparator = maybeSeparator !== undefined && /^\|?[\s:|-]+\|?$/.test(maybeSeparator.trim());
      const bodyLines = hasSeparator ? rest : rowsText.slice(1);
      blocks.push({ kind: 'table', head: tableCells(headLine), rows: bodyLines.map(tableCells) });
      continue;
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const marker = ordered ? NUMBERED : BULLET;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const current = lines[i];
        const top = marker.exec(current);
        if (top) {
          items.push({ content: parseInline(top[1]) });
          i += 1;
          continue;
        }
        const nested = NESTED_BULLET.exec(current);
        if (nested && items.length > 0) {
          const parent = items[items.length - 1];
          const childList = parent.children && parent.children.kind === 'list'
            ? parent.children
            : { kind: 'list' as const, ordered: false, items: [] as ListItem[] };
          childList.items.push({ content: parseInline(nested[1]) });
          parent.children = childList;
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // A paragraph: consecutive lines that start nothing else. Each source line is
    // kept, so an address written one line per row renders one line per row.
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i];
      const t = current.trim();
      if (t === '' || /^#{2,3} /.test(t) || t.startsWith('>') || t.startsWith('|')
          || BULLET.test(current) || NUMBERED.test(current)) break;
      paragraphLines.push(t);
      i += 1;
    }
    const parsedLines = paragraphLines.map(parseInline);
    blocks.push({ kind: 'paragraph', content: parsedLines.flat(), lines: parsedLines });
  }

  return { blocks, headings };
}
