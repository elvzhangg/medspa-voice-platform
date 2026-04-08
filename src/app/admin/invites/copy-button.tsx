"use client";

export function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
    >
      Copy
    </button>
  );
}
