import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightHtml = (html: string, term: string): string => {
  const escaped = escapeRegExp(term);
  const regex = new RegExp(`(${escaped})`, "gi");

  // Only highlight text nodes — skip anything inside HTML tags
  // Split on tags, highlight only the non-tag segments
  const parts = html.split(/(<[^>]*>)/);
  return parts
    .map((part) => {
      if (part.startsWith("<")) return part;
      return part.replace(regex, '<mark class="search-highlight">$1</mark>');
    })
    .join("");
};

type MarkdownContentProps = {
  content: string;
  className?: string;
  highlightTerm?: string;
};

export const MarkdownContent = ({ content, className, highlightTerm }: MarkdownContentProps) => {
  const html = useMemo(() => {
    const rendered = marked.parse(content, { async: false }) as string;
    const withHighlight =
      highlightTerm && highlightTerm.length > 0 ? highlightHtml(rendered, highlightTerm) : rendered;
    // Sanitise: markdown can be produced by Claude agents and may contain
    // <script>, event handlers, or other XSS vectors. ALLOW <mark> for highlight.
    return DOMPurify.sanitize(withHighlight, {
      ADD_TAGS: ["mark"],
      ADD_ATTR: ["class"],
    });
  }, [content, highlightTerm]);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitised by DOMPurify above.
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};
