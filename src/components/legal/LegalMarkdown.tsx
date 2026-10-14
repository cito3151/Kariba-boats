import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import Reveal from '../Reveal';
import type { Block, Inline, ListItem } from './parseLegalMarkdown';

/**
 * Renders a parsed legal document (see parseLegalMarkdown.ts).
 *
 * `page` is the reading layout of /terms and /privacy: 17px body on a 1.7 line
 * height, headings that step up with the screen, each ## section its own
 * <section> that rises in as it is reached (a fade only under reduced motion,
 * see Reveal), and a link icon on each section heading for sharing a section.
 * `compact` is for the consent dialog: 15px, no sections, no motion, and links
 * that open in a new tab so the dialog is not lost.
 *
 * Colours are for a white card: lake-900 body text is 11.9:1, lake-700 links
 * 8.3:1, and the notice's lake-950 on sunset-50 is over 15:1.
 */
export default function LegalMarkdown({
  blocks, variant = 'page', onHeadingLink,
}: {
  blocks: Block[];
  variant?: 'page' | 'compact';
  /** Called when a section's link icon is clicked, so the page can scroll and focus it. */
  onHeadingLink?: (id: string) => void;
}) {
  const compact = variant === 'compact';

  if (compact) {
    return <div className="space-y-3 text-[15px] leading-relaxed text-lake-800">{blocks.map((b, i) => <BlockView key={i} block={b} compact />)}</div>;
  }

  // Group into sections at each ## heading; anything before the first heading
  // (the draft notice) is its own leading group.
  const groups: { id: string; blocks: Block[] }[] = [];
  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 2) groups.push({ id: block.id, blocks: [block] });
    else if (groups.length === 0) groups.push({ id: 'intro', blocks: [block] });
    else groups[groups.length - 1].blocks.push(block);
  }

  return (
    <div className="space-y-10 text-[17px] leading-[1.7] text-lake-900">
      {groups.map((group, index) => (
        <Reveal key={group.id} y={20} className={index > 0 ? 'border-t border-lake-100 pt-10' : undefined}>
          <section aria-labelledby={group.id === 'intro' ? undefined : group.id} className="space-y-4">
            {group.blocks.map((b, i) => <BlockView key={i} block={b} onHeadingLink={onHeadingLink} />)}
          </section>
        </Reveal>
      ))}
    </div>
  );
}

function BlockView({ block, compact = false, onHeadingLink }: {
  block: Block; compact?: boolean; onHeadingLink?: (id: string) => void;
}) {
  switch (block.kind) {
    case 'heading': {
      if (compact) {
        const Tag = block.level === 2 ? 'h4' : 'h5';
        return <Tag className="pt-2 text-base font-bold text-lake-950">{block.text}</Tag>;
      }
      if (block.level === 3) {
        return (
          <h3 id={block.id} tabIndex={-1} className="scroll-mt-28 pt-2 text-[1.125rem] font-bold text-lake-950 outline-none sm:text-[1.1875rem]">
            {block.text}
          </h3>
        );
      }
      return (
        <h2 id={block.id} tabIndex={-1}
          className="group flex scroll-mt-28 items-baseline gap-2 text-[1.375rem] font-bold text-lake-950 outline-none sm:text-[1.625rem]">
          <span className="min-w-0 break-words">{block.text}</span>
          <a
            href={`#${block.id}`}
            onClick={(e) => {
              if (!onHeadingLink) return;
              e.preventDefault();
              onHeadingLink(block.id);
            }}
            aria-label={`Link to this section: ${block.text}`}
            className="shrink-0 rounded-sm text-lake-600 opacity-0 outline-none transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-lake-500 [@media(hover:none)]:opacity-60"
          >
            <Link2 size={18} aria-hidden />
          </a>
        </h2>
      );
    }
    case 'paragraph':
      return (
        <p className="break-words">
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <Inlines nodes={line} compact={compact} />
            </Fragment>
          ))}
        </p>
      );
    case 'notice':
      return (
        <div role="note"
          className={`rounded-lg border-l-4 border-sunset-500 bg-sunset-50 text-lake-950 ${compact ? 'px-3 py-2' : 'px-4 py-3.5 sm:px-5'}`}>
          <p className="break-words"><Inlines nodes={block.content} compact={compact} /></p>
        </div>
      );
    case 'list':
      return <ListView ordered={block.ordered} items={block.items} compact={compact} />;
    case 'table':
      return <TableView head={block.head} rows={block.rows} compact={compact} />;
  }
}

function ListView({ ordered, items, compact }: { ordered: boolean; items: ListItem[]; compact: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-2 pl-6 marker:text-lake-600 ${ordered ? 'marker:font-semibold' : ''}`}>
      {items.map((item, i) => (
        <li key={i} className="break-words pl-1">
          <Inlines nodes={item.content} compact={compact} />
          {item.children && item.children.kind === 'list' && (
            <div className="mt-2">
              <ListView ordered={item.children.ordered} items={item.children.items} compact={compact} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  );
}

function TableView({ head, rows, compact }: { head: Inline[][]; rows: Inline[][][]; compact: boolean }) {
  return (
    <>
      {/* From 640px: a real table. */}
      <div className="hidden overflow-hidden rounded-lg border border-lake-200 sm:block">
        <table className="w-full border-collapse text-left text-[15px] leading-normal">
          <thead className="bg-lake-50">
            <tr>
              {head.map((cell, i) => (
                <th key={i} scope="col" className="border-b border-lake-200 px-4 py-3 align-bottom font-bold text-lake-950">
                  <Inlines nodes={cell} compact={compact} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-lake-100 first:border-t-0">
                {row.map((cell, c) => {
                  const content = <Inlines nodes={cell} compact={compact} />;
                  return c === 0
                    ? <th key={c} scope="row" className="px-4 py-3 align-top font-semibold text-lake-950">{content}</th>
                    : <td key={c} className="px-4 py-3 align-top text-lake-800">{content}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Below 640px three columns of prose do not fit, so each row becomes a card
          that names every value with its column heading. */}
      <ul className="space-y-3 sm:hidden">
        {rows.map((row, r) => (
          <li key={r} className="rounded-lg border border-lake-200 bg-white px-4 py-3">
            <p className="font-bold leading-snug text-lake-950"><Inlines nodes={row[0] ?? []} compact={compact} /></p>
            <dl className="mt-2 space-y-2 text-[15px] leading-normal">
              {row.slice(1).map((cell, c) => (
                <div key={c}>
                  <dt className="text-[13px] font-bold uppercase tracking-[0.06em] text-lake-700">
                    <Inlines nodes={head[c + 1] ?? []} compact={compact} />
                  </dt>
                  <dd className="text-lake-800"><Inlines nodes={cell} compact={compact} /></dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

const linkClass =
  'rounded-sm font-semibold text-lake-700 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500';

function Inlines({ nodes, compact }: { nodes: Inline[]; compact: boolean }): ReactNode {
  return nodes.map((node, i) => {
    if (node.kind === 'text') return <Fragment key={i}>{node.text}</Fragment>;
    if (node.kind === 'strong') return <strong key={i} className="font-bold text-lake-950"><Inlines nodes={node.children} compact={compact} /></strong>;
    const children = <Inlines nodes={node.children} compact={compact} />;
    if (node.href.startsWith('/') && !compact) {
      return <Link key={i} to={node.href} className={linkClass}>{children}</Link>;
    }
    const external = !node.href.startsWith('/') && !node.href.startsWith('mailto:');
    const newTab = compact || external;
    return (
      <a key={i} href={node.href} className={linkClass}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
        {newTab && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    );
  });
}
