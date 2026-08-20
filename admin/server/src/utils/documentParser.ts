import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * 支持的文档解析类型。
 * 图片、zip 等不在此处解析，保留给 Read/OCR 工具处理。
 */
export type DocumentKind = 'pdf' | 'docx' | 'xlsx' | 'xls' | 'txt' | 'unknown';

export interface ExtractOptions {
  /** 单文件最大字符数，超出则截断并附加提示，默认 100000 */
  maxChars?: number;
  /** 图片型 PDF 提取图片的输出目录，默认在系统临时目录创建 */
  imageOutDir?: string;
}

export interface ParsedDocument {
  kind: DocumentKind;
  /** 提取出的纯文本，已按页/按 sheet 加分隔标记 */
  text: string;
  /** 是否被截断 */
  truncated: boolean;
  /** 解析失败时的错误信息；成功为空 */
  error?: string;
  /** 图片型 PDF 提取出的图片路径，供 Read 工具读取 */
  images?: string[];
  /** 图片型 PDF 提取出的图片存放目录（调用方负责清理） */
  imageDir?: string;
}

/** 根据文件名判断文档类型 */
export function detectDocumentKind(fileName: string): DocumentKind {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'pdf';
    case '.docx':
      return 'docx';
    case '.xlsx':
      return 'xlsx';
    case '.xls':
      return 'xls';
    case '.txt':
    case '.md':
    case '.markdown':
      return 'txt';
    default:
      return 'unknown';
  }
}

function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: text.slice(0, maxChars) + '\n\n[文档内容过长，已截断；如需完整内容请拆分后重新上传]',
    truncated: true,
  };
}

/* ── PNG 写入工具（不依赖 canvas/node-gyp）────────────────────────── */

function pngCrc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ -1) >>> 0;
}

function pngChunk(type: Buffer, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([type, data])), 0);
  return Buffer.concat([len, type, data, crc]);
}

function writePng(filePath: string, width: number, height: number, rgb: Buffer): void {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前加一个 filter byte 0
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });

  const chunks = [
    signature,
    pngChunk(Buffer.from('IHDR'), ihdr),
    pngChunk(Buffer.from('IDAT'), idat),
    pngChunk(Buffer.from('IEND'), Buffer.alloc(0)),
  ];
  fs.writeFileSync(filePath, Buffer.concat(chunks));
}

/* ── PDF 内嵌图片提取（图片型/扫描件 PDF 兜底）──────────────────────── */

/** 在 latin1 字符串中按对象号查找 `N 0 obj ... endobj`，返回内容区 */
function pdfGetObject(data: Buffer, num: number): Buffer | null {
  const text = data.toString('latin1');
  const pattern = new RegExp(`(?<!\\d)${num} 0 obj([\\s\\S]*?)endobj`, 'g');
  for (const m of text.matchAll(pattern)) {
    return Buffer.from(m[1] as string, 'latin1');
  }
  return null;
}

/** 提取对象中的 stream 内容（不解压） */
function pdfExtractStream(obj: Buffer): Buffer | null {
  const text = obj.toString('latin1');
  const m = text.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
  if (!m) return null;
  return Buffer.from(m[1] as string, 'latin1');
}

/** 读取对象中的整数键值，如 /Width 100 */
function pdfIntKey(obj: Buffer, key: string): number | null {
  const re = new RegExp(`/${key}\\s+(\\d+)`);
  const m = obj.toString('latin1').match(re);
  return m ? Number(m[1]) : null;
}

/** 读取对象中的名称键值，如 /Filter /FlateDecode */
function pdfNameKey(obj: Buffer, key: string): string | null {
  const re = new RegExp(`/${key}\\s*/(\\w+)`);
  const m = obj.toString('latin1').match(re);
  return m ? m[1] : null;
}

function pdfDecompressFlate(
  raw: Buffer,
  predictor: number | null,
  width: number,
  bpp: number,
): Buffer {
  const dec = zlib.inflateSync(raw);
  if (!predictor || predictor === 1) return dec;

  const stride = width * bpp;
  const out = Buffer.alloc(dec.length - heightFor(dec, stride)); // rough, will trim later
  // 实际上按行精确计算
  let pos = 0;
  let outPos = 0;
  const prev = Buffer.alloc(stride);
  while (pos < dec.length) {
    const filter = dec[pos];
    pos += 1;
    const line = Buffer.from(dec.subarray(pos, pos + stride));
    pos += stride;

    if (filter === 1) {
      for (let i = 0; i < stride; i += 1) {
        const a = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + a) & 0xff;
      }
    } else if (filter === 2) {
      for (let i = 0; i < stride; i += 1) {
        line[i] = (line[i] + prev[i]) & 0xff;
      }
    } else if (filter === 3) {
      for (let i = 0; i < stride; i += 1) {
        const a = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i += 1) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pr) & 0xff;
      }
    }

    line.copy(out, outPos);
    outPos += stride;
    line.copy(prev);
  }
  return out.subarray(0, outPos);
}

function heightFor(_dec: Buffer, _stride: number): number {
  return 0; // 占位，上面已按行精确计算
}

function parsePredictor(obj: Buffer): number | null {
  const m = obj.toString('latin1').match(/\/DecodeParms\s*<<([\s\S]*?)>>/);
  if (!m) return null;
  const p = m[1].match(/\/Predictor\s+(\d+)/);
  return p ? Number(p[1]) : null;
}

/**
 * 从图片型 PDF 中提取内嵌图片。
 * 目前支持：DeviceRGB / DeviceGray 8bit，FlateDecode 编码。
 * 返回按页面顺序排列的 PNG 路径列表（无法解析则返回空数组）。
 */
async function extractPdfImages(filePath: string, outDir: string): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const data = fs.readFileSync(filePath);
  const text = data.toString('latin1');

  // 1. 从 Catalog 找到 root Pages 对象号，再提取 Kids 数组
  // Catalog: /Type /Catalog ... /Pages N 0 R ...
  const catalogMatch = text.match(/\/Type\s*\/Catalog[\s\S]*?\/Pages\s+(\d+)\s+0\s+R/);
  if (!catalogMatch) return [];
  const pagesObjNum = Number(catalogMatch[1]);
  const pagesObj = pdfGetObject(data, pagesObjNum);
  if (!pagesObj) return [];
  const kidsMatch = pagesObj.toString('latin1').match(/\/Kids\s*\[([\s\S]*?)\]/);
  if (!kidsMatch) return [];
  const pageRefs = Array.from((kidsMatch[1] as string).matchAll(/(\d+)\s+\d+\s+R/g)).map((m) =>
    Number(m[1]),
  );
  if (pageRefs.length === 0) return [];

  const drawnImageObjects: number[] = [];

  // 2. 逐页分析 Resources / Contents，找出本页引用的图片对象号
  for (const pageRef of pageRefs) {
    const pageObj = pdfGetObject(data, pageRef);
    if (!pageObj) continue;

    // Resources / XObject：直接在页面对象中搜索 XObject 字典，
    // 避免 /Resources 非贪婪匹配被内层 Font/ExtGState 等字典提前截断
    const pageText = pageObj.toString('latin1');
    const xobjectMatch = pageText.match(/\/XObject\s*<<([\s\S]*?)>>/);
    const xobjects: Record<string, number> = {};
    if (xobjectMatch) {
      for (const m of (xobjectMatch[1] as string).matchAll(/\/(\w+)\s+(\d+)\s+\d+\s+R/g)) {
        xobjects[m[1] as string] = Number(m[2]);
      }
    }

    // Contents（可能是单个 ref 或数组）
    const contentsText = pageObj.toString('latin1');
    const contentRefs: number[] = [];
    const single = contentsText.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    if (single) {
      contentRefs.push(Number(single[1]));
    } else {
      const arr = contentsText.match(/\/Contents\s*\[([\s\S]*?)\]/);
      if (arr) {
        for (const m of (arr[1] as string).matchAll(/(\d+)\s+\d+\s+R/g)) {
          contentRefs.push(Number(m[1]));
        }
      }
    }

    // 解压并找出 /Name Do
    for (const contentRef of contentRefs) {
      const contentObj = pdfGetObject(data, contentRef);
      if (!contentObj) continue;
      let stream = pdfExtractStream(contentObj);
      if (!stream) continue;

      const filter = pdfNameKey(contentObj, 'Filter');
      if (filter === 'FlateDecode') {
        try {
          stream = zlib.inflateSync(stream);
        } catch {
          continue;
        }
      }

      for (const m of stream.toString('latin1').matchAll(/\/(\w+)\s+Do/g)) {
        const name = m[1] as string;
        const objNum = xobjects[name];
        if (objNum && !drawnImageObjects.includes(objNum)) {
          drawnImageObjects.push(objNum);
        }
      }
    }
  }

  // 3. 提取每个图片对象并保存为 PNG
  const pngPaths: string[] = [];
  for (const objNum of drawnImageObjects) {
    const imgObj = pdfGetObject(data, objNum);
    if (!imgObj) continue;

    const width = pdfIntKey(imgObj, 'Width');
    const height = pdfIntKey(imgObj, 'Height');
    const bpc = pdfIntKey(imgObj, 'BitsPerComponent') ?? 8;
    const colorSpace = pdfNameKey(imgObj, 'ColorSpace');
    const filter = pdfNameKey(imgObj, 'Filter');
    if (!width || !height || filter !== 'FlateDecode') continue;
    if (bpc !== 8) continue;

    const bpp = colorSpace === 'DeviceGray' ? 1 : colorSpace === 'DeviceRGB' ? 3 : 0;
    if (bpp === 0) continue;

    const stream = pdfExtractStream(imgObj);
    if (!stream) continue;

    const predictor = parsePredictor(imgObj);
    try {
      const rgb = pdfDecompressFlate(stream, predictor, width, bpp);
      if (rgb.length < width * height * bpp) continue;

      const outPath = path.join(outDir, `pdf-img-${objNum}.png`);
      if (bpp === 3) {
        writePng(outPath, width, height, rgb);
      } else {
        // Gray -> RGB by repeating channels
        const rgbBuf = Buffer.alloc(width * height * 3);
        for (let i = 0; i < width * height; i += 1) {
          const v = rgb[i];
          rgbBuf[i * 3] = v;
          rgbBuf[i * 3 + 1] = v;
          rgbBuf[i * 3 + 2] = v;
        }
        writePng(outPath, width, height, rgbBuf);
      }
      pngPaths.push(outPath);
    } catch {
      // 单张图片提取失败，跳过
    }
  }

  return pngPaths;
}

async function extractPdf(filePath: string, options: ExtractOptions): Promise<ParsedDocument> {
  const maxChars = options.maxChars ?? 100_000;
  let textError: string | undefined;
  let pageCount = 0;

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjsLib.getDocument({ url: filePath });
    const pdf = await loadingTask.promise;
    pageCount = pdf.numPages;
    const parts: string[] = [`[PDF 共 ${pdf.numPages} 页]`];

    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string }>;
      const pageText = items.map((item) => item.str ?? '').join('');
      parts.push(`--- 第 ${i} 页 ---`, pageText);
    }

    const raw = parts.join('\n\n');
    const { text, truncated } = truncate(raw, maxChars);

    // 同时尝试提取内嵌图片：图片型/扫描件 PDF 的文字层往往为空或粘连，
    // 提取图片后供多模态 Read 工具读取。
    const providedOutDir = options.imageOutDir;
    const outDir = providedOutDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-img-'));
    const images = await extractPdfImages(filePath, outDir);
    if (images.length > 0) {
      return {
        kind: 'pdf',
        text: [
          `[PDF 共 ${pageCount} 页${text.trim().length > 0 ? '，已按页提取文字' : ''}]`,
          text,
          `[该 PDF 同时包含图片内容，已提取 ${images.length} 张内嵌图片，请使用 Read 工具按顺序阅读以下图片以理解完整需求]`,
        ].join('\n\n'),
        truncated,
        images,
        imageDir: outDir,
      };
    }

    // 如果没有提取到图片且目录是本次调用新建的，清理临时目录
    if (!providedOutDir) {
      fs.rm(outDir, { recursive: true, force: true }, () => undefined);
    }

    return { kind: 'pdf', text, truncated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'pdf', text: '', truncated: false, error: message };
  }
}

async function extractDocx(filePath: string, maxChars: number): Promise<ParsedDocument> {
  try {
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default ?? mammothModule;
    const result = await mammoth.extractRawText({ path: filePath });
    const { text, truncated } = truncate(result.value, maxChars);
    return { kind: 'docx', text, truncated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'docx', text: '', truncated: false, error: message };
  }
}

async function extractExcel(filePath: string, maxChars: number): Promise<ParsedDocument> {
  try {
    const xlsxModule = await import('xlsx');
    const XLSX = xlsxModule.default ?? xlsxModule;
    const workbook = XLSX.readFile(filePath);
    const parts: string[] = [`[Excel 共 ${workbook.SheetNames.length} 个 sheet]`];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      parts.push(`--- Sheet: ${sheetName} ---`, csv);
    }

    const { text, truncated } = truncate(parts.join('\n\n'), maxChars);
    return { kind: filePath.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx', text, truncated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'xlsx', text: '', truncated: false, error: message };
  }
}

async function extractTxt(filePath: string, maxChars: number): Promise<ParsedDocument> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { text, truncated } = truncate(raw, maxChars);
    return { kind: 'txt', text, truncated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'txt', text: '', truncated: false, error: message };
  }
}

/**
 * 从本地文件提取可阅读文本。
 * - PDF：按页提取文字，带 "--- 第 N 页 ---" 标记；若为图片/扫描件则自动提取内嵌图片路径。
 * - Word（.docx）：提取全部正文。
 * - Excel（.xls/.xlsx）：按 sheet 提取，带 "--- Sheet: name ---" 标记。
 * - TXT/Markdown：直接读取。
 * - 其他类型：返回 kind='unknown'，text 为空，不报错。
 */
export async function extractDocumentText(
  filePath: string,
  options: ExtractOptions = {},
): Promise<ParsedDocument> {
  const maxChars = options.maxChars ?? 100_000;
  const kind = detectDocumentKind(filePath);

  switch (kind) {
    case 'pdf':
      return extractPdf(filePath, options);
    case 'docx':
      return extractDocx(filePath, maxChars);
    case 'xlsx':
    case 'xls':
      return extractExcel(filePath, maxChars);
    case 'txt':
      return extractTxt(filePath, maxChars);
    default:
      return { kind: 'unknown', text: '', truncated: false };
  }
}
