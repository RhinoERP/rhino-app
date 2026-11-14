"use client";

import { Fragment } from "react";

/** Render del texto de RHINO (sin HTML crudo): viñetas, **negrita** y enlaces a clientes. */

export type RhinoLinkKind = "cli" | "opp" | "pro";
export type RhinoLinkHandler = (kind: RhinoLinkKind, id: string) => void;

const LINK_PATTERN = /\[\[(cli|opp|pro):([^|\]]+)\|([^\]]+)\]\]/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const BULLET_PATTERN = /^\s*[-•]\s+(.*)/;

function Bold({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD_PATTERN)) {
    const start = match.index ?? 0;
    parts.push(text.slice(last, start));
    parts.push(<b key={start}>{match[1]}</b>);
    last = start + match[0].length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos estáticos de un texto
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}

function InlineText({
  text,
  onLink,
}: {
  text: string;
  onLink?: RhinoLinkHandler;
}) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [whole, kind, id, label] = match;
    const start = match.index ?? 0;
    if (start > last) {
      parts.push(<Bold key={`t${start}`} text={text.slice(last, start)} />);
    }
    parts.push(
      onLink ? (
        <button
          className="font-medium text-primary underline underline-offset-2"
          key={`l${start}`}
          onClick={() => onLink(kind as RhinoLinkKind, id)}
          type="button"
        >
          {label}
        </button>
      ) : (
        <b key={`l${start}`}>{label}</b>
      )
    );
    last = start + whole.length;
  }
  if (last < text.length) {
    parts.push(<Bold key="end" text={text.slice(last)} />);
  }
  return <>{parts}</>;
}

export function RhinoText({
  text,
  onLink,
}: {
  text: string;
  onLink?: RhinoLinkHandler;
}) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul className="my-1 list-disc space-y-0.5 pl-5" key={key}>
          {list.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ítems estáticos de un texto
            <li key={i}>
              <InlineText onLink={onLink} text={item} />
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  text.split("\n").forEach((line, index) => {
    const bullet = line.match(BULLET_PATTERN);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flush(`ul${index}`);
    if (line.trim()) {
      blocks.push(
        // biome-ignore lint/suspicious/noArrayIndexKey: líneas estáticas de un texto ya recibido
        <p className="mb-1.5 last:mb-0" key={`p${index}`}>
          <InlineText onLink={onLink} text={line} />
        </p>
      );
    }
  });
  flush("ul-end");
  return <>{blocks}</>;
}
