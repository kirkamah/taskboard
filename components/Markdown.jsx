'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renders user-supplied markdown for task descriptions and comments.
// react-markdown does NOT execute raw HTML by default, so XSS surface is
// limited to attribute injection in URLs — which we mitigate by forcing
// safe protocols on links.
//
// GFM adds tables, autolinks, strikethrough, and task list syntax.
// Styling is via the `components` map below; we deliberately avoid
// @tailwindcss/typography so descriptions stay tight and visually
// consistent with the rest of the UI.

const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;

const components = {
  a: ({ href, children, ...props }) => {
    const safe = typeof href === 'string' && SAFE_PROTOCOL.test(href) ? href : undefined;
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline break-all"
        {...props}
      >
        {children}
      </a>
    );
  },
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h1 className="text-base font-semibold mt-2 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold mt-2 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  code: ({ inline, children }) => (
    inline
      ? <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] text-gray-800 font-mono">{children}</code>
      : <code className="block whitespace-pre-wrap font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-gray-50 border border-gray-200 rounded p-2 my-2 overflow-x-auto text-xs">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-600 my-2">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-300 bg-gray-50 px-2 py-1 font-medium text-left">{children}</th>,
  td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
};

export default function Markdown({ text, className = '' }) {
  if (!text) return null;
  return (
    <div className={`text-sm text-gray-800 break-words ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
