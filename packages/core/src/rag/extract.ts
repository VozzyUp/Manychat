import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

/** Text of one source page. Formats without pages use page 1 for everything. */
export type ExtractedPage = { page: number; text: string };

export class ExtractionError extends Error {
  constructor(
    public readonly code: 'unsupported_type' | 'scanned_pdf' | 'empty' | 'corrupt',
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export const SUPPORTED_MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
} as const;

/** Below this many characters per page a PDF is treated as scanned (needs OCR, build step 1.9). */
const MIN_CHARS_PER_PAGE = 40;

/** Minimal HTML → markdown for what mammoth produces (headings, paragraphs, lists, tables). */
export function htmlToMarkdown(html: string): string {
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  const strip = (s: string) =>
    decode(s.replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
  return html
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, level: string, body: string) => `\n\n${'#'.repeat(Number(level))} ${strip(body)}\n\n`,
    )
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, body: string) => `\n- ${strip(body)}`)
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_m, row: string) => {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        strip(c[1] ?? ''),
      );
      return `\n${cells.join(' | ')}\n`;
    })
    .replace(/<\/(p|div|ul|ol|table)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => decode(line).trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extracts text by file type (§4.5 step 1). Scanned PDFs are reported, not guessed at. */
export async function extractPages(
  data: Uint8Array,
  mime: string,
  filename: string,
): Promise<ExtractedPage[]> {
  const kind = detectKind(mime, filename);
  if (!kind)
    throw new ExtractionError('unsupported_type', `Tipo de arquivo não suportado: ${mime}`);

  let pages: ExtractedPage[];
  try {
    if (kind === 'pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: false });
      pages = text.map((t, i) => ({ page: i + 1, text: t.replace(/\r/g, '') }));
      const chars = pages.reduce((n, p) => n + p.text.trim().length, 0);
      if (pages.length && chars / pages.length < MIN_CHARS_PER_PAGE) {
        throw new ExtractionError(
          'scanned_pdf',
          'O PDF parece ser uma imagem escaneada (sem texto). A leitura por OCR chega em uma próxima etapa; envie uma versão com texto.',
        );
      }
    } else if (kind === 'docx') {
      const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
      pages = [{ page: 1, text: htmlToMarkdown(value) }];
    } else {
      pages = [{ page: 1, text: new TextDecoder('utf-8').decode(data).replace(/\r\n?/g, '\n') }];
    }
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError(
      'corrupt',
      'Não foi possível ler o arquivo. Ele pode estar corrompido ou protegido.',
    );
  }
  if (!pages.some((p) => p.text.trim()))
    throw new ExtractionError('empty', 'O arquivo não tem texto.');
  return pages;
}

export function detectKind(mime: string, filename: string): 'pdf' | 'docx' | 'txt' | 'md' | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (mime === SUPPORTED_MIME.pdf || ext === 'pdf') return 'pdf';
  if (mime === SUPPORTED_MIME.docx || ext === 'docx') return 'docx';
  if (ext === 'md' || mime === SUPPORTED_MIME.md) return 'md';
  if (mime === SUPPORTED_MIME.txt || ext === 'txt') return 'txt';
  return null;
}
