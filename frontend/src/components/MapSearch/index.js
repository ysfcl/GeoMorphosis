"use client";

import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, MapPin } from 'lucide-react';

/**
 * Harita uzerindeki konum arama kutusu.
 *
 * Haritayi tanimaz; secilen sonucu onSelect ile yukari verir. Haritayi
 * tasima isi Map bileseninde.
 *
 * Arama YAZARKEN DEGIL, Enter'a basinca / dugmeye tiklayinca tetiklenir.
 * Nominatim'in kullanim politikasi her tus vurusunda istek atmayi yasakliyor
 * (bkz. app/api/geocode/route.js).
 */

const MIN_QUERY_LENGTH = 2;

export default function MapSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Bos sonucu "henuz aranmadi" durumundan ayirmak icin.
  const [searched, setSearched] = useState(false);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Disari tiklaninca sonuc listesi kapansin.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Bilesen kaldirilirsa ucan istegi iptal et.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    // Onceki arama hala suruyorsa iptal et; gec donen eski yanit yeni sonucun
    // uzerine yazmasin.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setActiveIndex(-1);

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Arama basarisiz oldu.');
      }

      setResults(payload.results ?? []);
      setSearched(true);
      setOpen(true);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setResults([]);
      setSearched(true);
      setError(err.message || 'Arama servisine ulasilamadi.');
      setOpen(true);
    } finally {
      // Iptal edilen istek de finally'ye girer; sadece guncel istek spinner'i
      // kapatmali, yoksa yeni arama basladigi anda spinner sonuyor.
      if (abortRef.current === controller) setLoading(false);
    }
  };

  const handleSelect = (result) => {
    setOpen(false);
    setActiveIndex(-1);
    setQuery(result.name);
    onSelect?.(result);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    // Listede secili bir satir varsa Enter onu secer, yeni arama yapmaz.
    if (open && activeIndex >= 0 && results[activeIndex]) {
      handleSelect(results[activeIndex]);
      return;
    }

    runSearch();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!open || results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setQuery('');
    setResults([]);
    setError(null);
    setOpen(false);
    setActiveIndex(-1);
    setSearched(false);
    setLoading(false);
    inputRef.current?.focus();
  };

  const showEmptyState = searched && !loading && !error && results.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={handleSubmit}
        role="search"
        className="flex items-center gap-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl px-3 py-2 border border-transparent dark:border-gray-700 transition-colors duration-300"
      >
        <Search size={18} className="shrink-0 text-gray-400 dark:text-gray-500" />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 || error) setOpen(true);
          }}
          placeholder="Konum ara (orn. Bartin Muratbey)"
          aria-label="Konum ara"
          role="combobox"
          aria-expanded={open}
          aria-controls="map-search-results"
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `map-search-result-${activeIndex}` : undefined
          }
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
        />

        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Aramayi temizle"
            className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <X size={16} />
          </button>
        )}

        <button
          type="submit"
          disabled={loading || query.trim().length < MIN_QUERY_LENGTH}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Ara'}
        </button>
      </form>

      {open && (
        <div
          id="map-search-results"
          role="listbox"
          className="absolute left-0 right-0 mt-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden max-h-72 overflow-y-auto"
        >
          {error && (
            <p className="px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {showEmptyState && (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Sonuc bulunamadi. Farkli bir yazim deneyin.
            </p>
          )}

          {results.map((result, index) => (
            <button
              key={result.id}
              id={`map-search-result-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition ${
                index === activeIndex
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <MapPin
                size={16}
                className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {result.name}
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                  {result.detail}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
