import type { ExtractedPage } from './extract';

/** ESCOPO §4.5: ~500–800 tokens per chunk, 80 of overlap, never splitting an item in the middle. */
export const CHUNK_TARGET_MIN = 500;
export const CHUNK_TARGET_MAX = 800;
export const CHUNK_OVERLAP = 80;

/** Rough token count for Portuguese text (no tokenizer dependency). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.5);

export type Chunk = {
  index: number;
  sectionPath: string | null;
  page: number;
  content: string;
  tokenCount: number;
};

type Unit = { text: string; page: number };
type Section = { path: string | null; units: Unit[] };

const MD_HEADING = /^(#{1,6})\s+(.{1,160})$/;
const NUMBERED_HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,4})[.)]?\s+([A-ZÀ-Ú0-9][^\n]{1,110})$/;
const NAMED_HEADING =
  /^(ANEXO|CAPÍTULO|CAPITULO|SEÇÃO|SECAO|TÍTULO|TITULO)\s+[A-Z0-9IVX]+\b.{0,100}$/i;
const ITEM_START = /^(\d{1,2}(?:\.\d{1,2}){1,4}[.)]?\s|[-*•]\s|[a-z]\)\s|\d+[.)]\s)/;

type Heading = { level: number; label: string };

/** Is this line a heading? Returns its depth and the label used in the section path. */
export function detectHeading(line: string): Heading | null {
  const text = line.trim();
  const md = MD_HEADING.exec(text);
  if (md) return { level: md[1]!.length, label: md[2]!.trim() };
  // "4.2 Temperatura": a short line that starts with a section number and has no final period.
  const numbered = NUMBERED_HEADING.exec(text);
  if (numbered && !/[.;:,]$/.test(text) && text.split(/\s+/).length <= 14) {
    return { level: numbered[1]!.split('.').length, label: text };
  }
  if (NAMED_HEADING.test(text) && !/[.;,]$/.test(text)) return { level: 1, label: text };
  return null;
}

/** Splits pages into sections, with the heading trail as `path` ("4 Procedimento > 4.2 Temperatura"). */
export function splitSections(pages: ExtractedPage[]): Section[] {
  const sections: Section[] = [];
  const trail: { level: number; label: string }[] = [];
  let current: Section = { path: null, units: [] };
  const flush = () => {
    if (current.units.length) sections.push(current);
  };

  for (const { page, text } of pages) {
    let paragraph: string[] = [];
    const closeParagraph = () => {
      if (paragraph.length)
        current.units.push({ text: paragraph.join(' ').replace(/\s+/g, ' ').trim(), page });
      paragraph = [];
    };
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) {
        closeParagraph();
        continue;
      }
      const heading = detectHeading(line);
      if (heading) {
        closeParagraph();
        flush();
        while (trail.length && trail[trail.length - 1]!.level >= heading.level) trail.pop();
        trail.push(heading);
        current = { path: trail.map((h) => h.label).join(' > '), units: [] };
        continue;
      }
      // A numbered or bulleted item is a unit of its own: it is never split from its continuation lines.
      if (ITEM_START.test(line)) closeParagraph();
      paragraph.push(line);
    }
    closeParagraph();
  }
  flush();
  return sections;
}

/** Sentences of an oversize unit, packed up to `max` tokens (last resort: cut by words). */
function splitLong(unit: Unit, max: number): Unit[] {
  const sentences = unit.text.match(/[^.!?;]+[.!?;]+\s*|[^.!?;]+$/g) ?? [unit.text];
  const out: Unit[] = [];
  let buffer = '';
  const push = () => {
    if (buffer.trim()) out.push({ text: buffer.trim(), page: unit.page });
    buffer = '';
  };
  for (const sentence of sentences) {
    if (estimateTokens(sentence) > max) {
      push();
      let part = '';
      for (const word of sentence.split(/\s+/)) {
        if (estimateTokens(`${part} ${word}`) > max) {
          out.push({ text: part.trim(), page: unit.page });
          part = '';
        }
        part += ` ${word}`;
      }
      buffer = part;
      continue;
    }
    if (estimateTokens(buffer + sentence) > max) push();
    buffer += sentence;
  }
  push();
  return out;
}

/**
 * Chunks per section: units are packed until the chunk reaches the target; a new section always
 * starts a new chunk (so a chunk has one section path to cite). The tail of a chunk (≤ overlap
 * tokens, whole units only) opens the next chunk of the same section.
 */
export function chunkPages(pages: ExtractedPage[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const section of splitSections(pages)) {
    const units = section.units.flatMap((u) =>
      estimateTokens(u.text) > CHUNK_TARGET_MAX ? splitLong(u, CHUNK_TARGET_MAX) : [u],
    );
    let current: Unit[] = [];
    let tokens = 0;
    const emit = () => {
      if (!current.length) return;
      const content = current.map((u) => u.text).join('\n');
      chunks.push({
        index: chunks.length,
        sectionPath: section.path,
        page: current[0]!.page,
        content,
        tokenCount: estimateTokens(content),
      });
    };
    for (const unit of units) {
      const size = estimateTokens(unit.text);
      if (current.length && tokens + size > CHUNK_TARGET_MAX) {
        emit();
        // Overlap: whole trailing units that fit in the overlap budget.
        const carry: Unit[] = [];
        let carried = 0;
        for (let i = current.length - 1; i > 0; i -= 1) {
          const s = estimateTokens(current[i]!.text);
          if (carried + s > CHUNK_OVERLAP) break;
          carry.unshift(current[i]!);
          carried += s;
        }
        current = carry;
        tokens = carried;
      }
      current.push(unit);
      tokens += size;
    }
    emit();
  }
  return chunks;
}
