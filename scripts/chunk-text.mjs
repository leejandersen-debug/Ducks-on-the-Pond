// Splits a text file into overlapping chunks for the vector store.
//
//   node scripts/chunk-text.mjs <input.txt> [output.json]
//
// - Chunks aim for MIN_WORDS–MAX_WORDS words (overlap included) and break only between paragraphs.
//   If any chunk is over the model's 512-token limit, the document is re-chunked smaller.
// - Each chunk after the first starts with the previous chunk's last whole sentences, about
//   OVERLAP_WORDS words, so text near a boundary appears in both chunks.
// - A paragraph longer than MAX_WORDS on its own is split between sentences instead.
// - Each chunk records the section heading ("SECTION 4 — ...") it starts in, and every section
//   it covers, for metadata.
//   Markdown headings ("## 11. Pet Policy", "### Wifi") are recorded as a path:
//   "17. Technology & Acceptable Use › Wifi".
// - Markdown (.md) is cleaned first: rules, emphasis markers, code blocks and table syntax go.
// - CSV (.csv) is one chunk per row, written as a sentence: rows are separate facts, so they
//   aren't merged or overlapped.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AutoTokenizer } from "@huggingface/transformers";

const MIN_WORDS = 300;
const MAX_WORDS = 400;
const OVERLAP_WORDS = 50;
// The embedding model reads at most 512 tokens; anything past that never reaches it. Dense text
// (checklists, numbers, names) runs more tokens per word, so a document whose chunks go over is
// re-chunked with a smaller word limit, STEP_WORDS at a time.
const MAX_TOKENS = 512;
const STEP_WORDS = 25;
const MODEL = "Xenova/all-MiniLM-L6-v2";

const words = (s) => s.split(/\s+/).filter(Boolean).length;
// A sentence ends at . ! or ? followed by a space and a capital, digit or opening quote/bracket,
// so the dots in "trailheadsupply.co" or "support@trailheadsupply.co" don't end a sentence.
const sentences = (p) => p.split(/(?<=[.!?]["')\]]*)\s+(?=["'(\[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
const isHeading = (p) => /^#{1,6} /.test(p) || (/^[A-Z0-9 &—–'-]+$/.test(p) && words(p) <= 12);
// Markdown headings keep their "#" while chunking (it marks them as headings); output drops it.
const headingLevel = (p) => p.match(/^(#{1,6}) /)?.[1].length ?? 1;
const display = (p) => p.replace(/^#{1,6} /, "");

// Markdown to plain paragraphs. Headings keep their "#" so chunkText can find them.
export function cleanMarkdown(md) {
  return md
    .replace(/^```[\s\S]*?^```\s*$/gm, "") // code blocks (the handbook's ASCII org chart repeats the list above it)
    .replace(/^\s*(---+|\*\*\*+|___+)\s*$/gm, "") // horizontal rules
    .replace(/^\|(.*)\|\s*$/gm, (_, row) => { // table rows -> "Monday – Saturday: 9:00 am – 6:00 pm"
      const cells = row.split("|").map((c) => c.trim());
      return cells.every((c) => /^:?-+:?$/.test(c)) ? "" : cells.join(": ");
    })
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, "$1") // **bold**, *italic*
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link](url) -> link
    .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .filter((p, i, all) => !(isHeading(p) && p === all[i - 1])) // a heading repeated back to back
    .join("\n\n");
}

// One chunk per row: "Granite Peak Hiker — SKU BOOT-GPH-001, Category Boots, ..., Price $185.00, ...".
// The second column (the name) leads, since that's what people ask about.
export function chunkCsv(csv) {
  const [header, ...rows] = csv.trim().split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim()));
  return rows.map((cells, i) => {
    const nameAt = header.findIndex((h) => /^(product|name|item)$/i.test(h));
    const name = cells[nameAt === -1 ? 0 : nameAt];
    // "StaffPrice" -> "Staff price"; prices get a "$" so "how much is…" questions match them.
    const label = (h) => h.replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`);
    const value = (h, v) => (/price|msrp|cost/i.test(h) && /^\d+(\.\d+)?$/.test(v) ? `$${v}` : v);
    const fields = header.map((h, j) => (j === nameAt ? null : `${label(h)} ${value(h, cells[j])}`)).filter(Boolean);
    const text = `${name} — ${fields.join(", ")}.`;
    return { index: i, section: cells[header.findIndex((h) => /^category$/i.test(h))] ?? null, words: words(text), overlapWords: 0, text };
  });
}

// Last whole sentences of a chunk adding up to about OVERLAP_WORDS (closest total wins).
// It never reaches back past a section heading, so it only repeats text from the section
// the next chunk continues.
function overlapFrom(paragraphs) {
  const lastHeading = paragraphs.findLastIndex(isHeading);
  const tail = sentences(paragraphs.slice(lastHeading + 1).join(" "));
  let best = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const candidate = tail.slice(i);
    if (Math.abs(words(candidate.join(" ")) - OVERLAP_WORDS) <= Math.abs(words(best.join(" ")) - OVERLAP_WORDS)) {
      best = candidate;
    }
    if (words(candidate.join(" ")) >= OVERLAP_WORDS) break;
  }
  return best.join(" ");
}

export function chunkText(text, { maxWords = MAX_WORDS } = {}) {
  const minWords = maxWords - (MAX_WORDS - MIN_WORDS);
  // Paragraphs, with any paragraph over maxWords broken into sentence groups.
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)
    .flatMap((p) => {
      if (words(p) <= maxWords) return [p];
      const parts = [];
      let cur = [];
      for (const s of sentences(p)) {
        if (cur.length && words([...cur, s].join(" ")) > maxWords - OVERLAP_WORDS) { parts.push(cur.join(" ")); cur = []; }
        cur.push(s);
      }
      if (cur.length) parts.push(cur.join(" "));
      return parts;
    });

  const chunks = [];
  const path = []; // open headings by level
  let section = null;
  let current = { section, sections: [], paragraphs: [], overlap: "" };
  const size = (c) => words([c.overlap, ...c.paragraphs].join(" "));
  const close = () => {
    // A heading never ends a chunk: it moves to the next one, with the text it introduces.
    const carried = isHeading(current.paragraphs.at(-1)) ? [current.paragraphs.pop()] : [];
    chunks.push(current);
    current = { section, sections: carried.length ? [] : [section], paragraphs: carried, overlap: overlapFrom(current.paragraphs) };
  };

  for (let p of paragraphs) {
    // Too small to close yet, but this paragraph would push it past maxWords: take as many of
    // its sentences as fit, close, and carry the rest into the next chunk.
    if (current.paragraphs.length && !isHeading(p) && size(current) + words(p) > maxWords && size(current) < minWords) {
      const rest = sentences(p);
      const head = [];
      while (rest.length > 1 && size(current) + words([...head, rest[0]].join(" ")) <= maxWords) head.push(rest.shift());
      if (head.length) {
        current.paragraphs.push(head.join(" "));
        close();
        p = rest.join(" ");
      }
    }
    const wouldExceed = size(current) + words(p) > maxWords;
    const withoutTrailingHeading = size(current) - (isHeading(current.paragraphs.at(-1) ?? "") ? words(current.paragraphs.at(-1)) : 0);
    if (current.paragraphs.length && wouldExceed && withoutTrailingHeading >= minWords) {
      close();
    }
    if (isHeading(p)) {
      const level = headingLevel(p);
      path.length = level - 1;
      path[level - 1] = display(p);
      // The document title (a lone "# ...") is left out of the path once there's a heading under it.
      section = path.filter(Boolean).filter((h, i, all) => !(i === 0 && all.length > 1 && path[0] === h)).join(" › ");
    }
    if (!current.paragraphs.length) current.section = section;
    if (section && current.sections.at(-1) !== section) current.sections.push(section);
    current.paragraphs.push(p);
  }
  if (current.paragraphs.length) chunks.push(current);

  const last = chunks.at(-1);
  // A short final chunk is folded into the previous one rather than left as a fragment, unless
  // that would push the previous one past maxWords.
  if (chunks.length > 1 && words(last.paragraphs.join(" ")) < minWords / 2
      && size(chunks.at(-2)) + words(last.paragraphs.join(" ")) <= maxWords) {
    chunks.at(-2).paragraphs.push(...last.paragraphs);
    chunks.at(-2).sections.push(...last.sections.filter((s) => !chunks.at(-2).sections.includes(s)));
    chunks.pop();
  }

  return chunks.map((c, i) => {
    const body = c.paragraphs.map(display).join("\n\n");
    const text = c.overlap ? `${c.overlap}\n\n${body}` : body;
    return { index: i, section: c.section, sections: c.sections.filter(Boolean), words: words(text), overlapWords: words(c.overlap), text };
  });
}

// CLI
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("Usage: node scripts/chunk-text.mjs <input.txt> [output.json]");
    process.exit(1);
  }
  const source = basename(input);
  const raw = readFileSync(input, "utf8");
  const ext = extname(input).toLowerCase();
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  const tokens = (t) => tokenizer.encode(t).length;
  let pieces;
  let maxWords = MAX_WORDS;
  if (ext === ".csv") pieces = chunkCsv(raw);
  else {
    const text = ext === ".md" ? cleanMarkdown(raw) : raw;
    for (;;) {
      pieces = chunkText(text, { maxWords });
      const over = pieces.filter((c) => tokens(c.text) > MAX_TOKENS).length;
      if (!over) break;
      console.log(`${over} chunk(s) over ${MAX_TOKENS} tokens at ${maxWords} words; retrying at ${maxWords - STEP_WORDS}`);
      maxWords -= STEP_WORDS;
    }
  }
  const chunks = pieces.map((c) => ({
    id: `${basename(input, extname(input))}-${String(c.index).padStart(ext === ".csv" ? 3 : 2, "0")}`,
    source,
    ...c,
  }));
  const out = output ?? `chunks/${basename(input, extname(input))}.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(chunks, null, 2) + "\n");
  for (const c of chunks) {
    console.log(`${c.id}  ${String(c.words).padStart(3)} words (overlap ${String(c.overlapWords).padStart(2)})  ${c.section ?? ""}`);
  }
  const counts = chunks.map((c) => tokens(c.text));
  console.log(`${chunks.length} chunks -> ${out}  (word limit ${maxWords}, tokens ${Math.min(...counts)}-${Math.max(...counts)})`);
}
