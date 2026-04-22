const URL_REGEX = /(https?:\/\/\S+)/g;
const IS_URL = /^https?:\/\//;

export default function LinkifiedText({ text, className = '' }) {
  if (!text) return null;
  const parts = text.split(URL_REGEX);
  return (
    <span className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) =>
        IS_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </span>
  );
}
