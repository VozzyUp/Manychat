import { describe, expect, it } from 'vitest';
import {
  CHUNK_OVERLAP,
  CHUNK_TARGET_MAX,
  chunkPages,
  detectHeading,
  estimateTokens,
  splitSections,
} from './chunk';
import { ExtractionError, extractPages, htmlToMarkdown } from './extract';

const POP = `POP-015 Transporte de amostras biológicas

1 Objetivo
Padronizar o transporte de amostras entre unidades.

4 Procedimento
4.1 Embalagem
4.1.1 Usar caixa térmica higienizada.
4.1.2 Colocar gelo reciclável sem contato direto com os tubos.

4.2 Temperatura
A temperatura da caixa deve ficar entre 2 e 8 graus durante todo o trajeto.
Registrar a leitura do termômetro na saída e na chegada.

ANEXO A Formulário de registro
Preencher e arquivar.`;

describe('section detection', () => {
  it('recognises markdown, numbered and named headings, and rejects sentences', () => {
    expect(detectHeading('## Temperatura')).toEqual({ level: 2, label: 'Temperatura' });
    expect(detectHeading('4.2 Temperatura')).toEqual({ level: 2, label: '4.2 Temperatura' });
    expect(detectHeading('ANEXO A Formulário de registro')).toMatchObject({ level: 1 });
    expect(detectHeading('4.1.1 Usar caixa térmica higienizada.')).toBeNull(); // item with final period
    expect(detectHeading('A temperatura da caixa deve ficar entre 2 e 8 graus.')).toBeNull();
    expect(
      detectHeading(
        '2 a 8 graus, conforme o manual do fabricante do equipamento utilizado no transporte diário',
      ),
    ).toBeNull();
  });

  it('keeps the heading trail as the section path', () => {
    const sections = splitSections([{ page: 1, text: POP }]);
    expect(sections.map((s) => s.path)).toEqual([
      null,
      '1 Objetivo',
      '4 Procedimento > 4.1 Embalagem',
      '4 Procedimento > 4.2 Temperatura',
      'ANEXO A Formulário de registro',
    ]);
  });

  it('keeps each numbered item whole', () => {
    const embalagem = splitSections([{ page: 1, text: POP }]).find((s) =>
      s.path?.endsWith('4.1 Embalagem'),
    )!;
    expect(embalagem.units.map((u) => u.text)).toEqual([
      '4.1.1 Usar caixa térmica higienizada.',
      '4.1.2 Colocar gelo reciclável sem contato direto com os tubos.',
    ]);
  });
});

describe('chunking (§4.5)', () => {
  it('one chunk per small section, each with a citable path and the right page', () => {
    const chunks = chunkPages([
      { page: 1, text: '1 Objetivo\nPadronizar o transporte.' },
      { page: 2, text: '2 Temperatura\nManter entre 2 e 8 graus.' },
    ]);
    expect(chunks).toMatchObject([
      { index: 0, sectionPath: '1 Objetivo', page: 1 },
      { index: 1, sectionPath: '2 Temperatura', page: 2 },
    ]);
  });

  const paragraph = (n: number) =>
    `Passo ${n}: ` +
    'executar a etapa conforme o procedimento aprovado e registrar o resultado. '.repeat(2).trim();
  const long =
    '4 Procedimento\n' + Array.from({ length: 40 }, (_, i) => paragraph(i + 1)).join('\n\n');

  it('splits a long section under the maximum, with overlap, without cutting a paragraph', () => {
    const chunks = chunkPages([{ page: 1, text: long }]);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(CHUNK_TARGET_MAX);
      expect(c.sectionPath).toBe('4 Procedimento');
      for (const line of c.content.split('\n'))
        expect(line).toMatch(/^Passo \d+: .*registrar o resultado\.$/);
    }
    // Chunks except the last are well filled.
    for (const c of chunks.slice(0, -1)) expect(c.tokenCount).toBeGreaterThan(500);
    // The last paragraph of a chunk reappears at the start of the next, within the overlap budget.
    for (let i = 1; i < chunks.length; i += 1) {
      const lastOfPrev = chunks[i - 1]!.content.split('\n').at(-1)!;
      const firstOfNext = chunks[i]!.content.split('\n')[0]!;
      expect(firstOfNext).toBe(lastOfPrev);
      expect(estimateTokens(firstOfNext)).toBeLessThanOrEqual(CHUNK_OVERLAP);
    }
    // Items longer than the overlap budget are not split to make an overlap: the next chunk just starts clean.
    const longItem = Array.from(
      { length: 30 },
      (_, i) => `Item ${i + 1}: ${'texto de apoio muito longo para o procedimento. '.repeat(8)}`,
    ).join('\n\n');
    const unsplit = chunkPages([{ page: 1, text: `5 Itens\n${longItem}` }]);
    for (const c of unsplit)
      for (const line of c.content.split('\n'))
        expect(line).toMatch(/^Item \d+: .*procedimento\.\s*$/);
    // Every paragraph is somewhere.
    const all = chunks.map((c) => c.content).join('\n');
    for (let i = 1; i <= 40; i += 1) expect(all).toContain(`Passo ${i}:`);
  });

  it('splits one huge paragraph by sentences', () => {
    const sentence = 'O responsável deve conferir a identificação de cada tubo antes do envio. ';
    const chunks = chunkPages([{ page: 1, text: sentence.repeat(120) }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(CHUNK_TARGET_MAX);
      expect(c.content.trim().endsWith('envio.')).toBe(true);
    }
  });

  it('numbers chunks in order and ignores empty input', () => {
    const chunks = chunkPages([{ page: 1, text: POP }]);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    expect(chunkPages([{ page: 1, text: '   \n\n ' }])).toEqual([]);
  });
});

describe('text extraction', () => {
  it('reads txt and md as utf-8', async () => {
    const pages = await extractPages(
      new TextEncoder().encode('Olá\r\nmundo ção'),
      'text/plain',
      'a.txt',
    );
    expect(pages).toEqual([{ page: 1, text: 'Olá\nmundo ção' }]);
    expect(
      (
        await extractPages(
          new TextEncoder().encode('# Título\ntexto'),
          'application/octet-stream',
          'a.md',
        )
      )[0]!.text,
    ).toContain('# Título');
  });

  it('refuses unsupported types, empty files and corrupt PDFs/DOCX with a clear code', async () => {
    await expect(extractPages(new Uint8Array([1]), 'image/png', 'a.png')).rejects.toMatchObject({
      code: 'unsupported_type',
    });
    await expect(
      extractPages(new TextEncoder().encode('  \n '), 'text/plain', 'a.txt'),
    ).rejects.toMatchObject({ code: 'empty' });
    await expect(
      extractPages(new TextEncoder().encode('not a pdf'), 'application/pdf', 'a.pdf'),
    ).rejects.toBeInstanceOf(ExtractionError);
    await expect(
      extractPages(new TextEncoder().encode('not a docx'), 'application/octet-stream', 'a.docx'),
    ).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('turns mammoth html into markdown with headings, items and tables', () => {
    const md = htmlToMarkdown(
      '<h1>Objetivo</h1><p>Texto &amp; mais</p><h2>4.2 Temp</h2><ul><li>um</li><li>dois</li></ul><table><tr><td>A</td><td>B</td></tr></table>',
    );
    expect(md).toBe('# Objetivo\n\nTexto & mais\n\n## 4.2 Temp\n\n- um\n- dois\n\nA | B');
  });
});
