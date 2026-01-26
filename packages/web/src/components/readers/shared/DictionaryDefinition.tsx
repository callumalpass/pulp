import { useState, useEffect } from 'react';
import type { DictionaryEntry } from '@pulp/shared';
import { api } from '../../../lib/api';

interface DictionaryDefinitionProps {
  text: string;
}

const isSingleWord = (text: string) => /^\w+$/.test(text.trim());

export function DictionaryDefinition({ text }: DictionaryDefinitionProps) {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const word = text.trim();
  const shouldFetch = isSingleWord(word);

  useEffect(() => {
    if (!shouldFetch) return;

    setLoading(true);
    setNotFound(false);
    setEntry(null);

    api.dictionary.lookup(word).then((result) => {
      setLoading(false);
      if (result) {
        setEntry(result);
      } else {
        setNotFound(true);
      }
    });
  }, [word, shouldFetch]);

  if (!shouldFetch) return null;

  if (loading) {
    return (
      <div className="p-3 border-t border-text-secondary/20">
        <p className="text-xs text-text-secondary">Loading definition...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-3 border-t border-text-secondary/20">
        <p className="text-xs text-text-secondary italic">No definition found</p>
      </div>
    );
  }

  if (!entry) return null;

  const phonetic = entry.phonetic || entry.phonetics.find(p => p.text)?.text;

  return (
    <div className="p-3 border-t border-text-secondary/20 max-h-48 overflow-y-auto">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm font-medium text-text-primary">{entry.word}</span>
        {phonetic && (
          <span className="text-xs text-text-secondary">{phonetic}</span>
        )}
      </div>

      {entry.meanings.slice(0, 2).map((meaning, i) => (
        <div key={i} className="mb-2 last:mb-0">
          <p className="text-xs text-accent-primary italic mb-1">{meaning.partOfSpeech}</p>
          <ol className="list-decimal list-inside space-y-1">
            {meaning.definitions.slice(0, 2).map((def, j) => (
              <li key={j} className="text-xs text-text-primary">
                {def.definition}
                {def.example && (
                  <span className="text-text-secondary block ml-4 italic">
                    "{def.example}"
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
