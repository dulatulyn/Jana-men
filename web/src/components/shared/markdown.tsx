import { Fragment } from "react";
import { cn } from "@/lib/utils";

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

type Block = { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

function parse(source: string, breaks: boolean): Block[] {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) {
      blocks.push({ kind: "h", text: h[1] });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push({ kind: "ol", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) para.push(lines[i++]);
    if (breaks) for (const ln of para) blocks.push({ kind: "p", text: ln });
    else blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

export function Markdown({ source, className, breaks = false, tail }: { source: string; className?: string; breaks?: boolean; tail?: React.ReactNode }) {
  const blocks = parse(source, breaks);
  const last = blocks.length - 1;
  return (
    <div className={cn("jm-prose", className)}>
      {blocks.map((b, k) => {
        const end = k === last ? tail : null;
        if (b.kind === "h" || b.kind === "p") {
          const Tag = b.kind === "h" ? "h2" : "p";
          return (
            <Tag key={k}>
              {inline(b.text)}
              {end}
            </Tag>
          );
        }
        const List = b.kind;
        return (
          <List key={k}>
            {b.items.map((it, j) => (
              <li key={j}>
                {inline(it)}
                {j === b.items.length - 1 && end}
              </li>
            ))}
          </List>
        );
      })}
      {blocks.length === 0 && tail}
    </div>
  );
}
