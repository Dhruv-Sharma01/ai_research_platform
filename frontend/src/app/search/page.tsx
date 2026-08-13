'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setError('');
    setLoading(true);

    try {
      // Execute a hybrid search by default
      const res = await fetchApi('/search', {
        method: 'POST',
        body: JSON.stringify({ query, top_k: 5 }),
      });
      setResults(res.results || []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container flex flex-col items-center animate-fade-in" style={{ minHeight: '100vh', paddingTop: '4rem' }}>
      
      <div style={{ width: '100%', maxWidth: '800px', marginBottom: '3rem' }}>
        <button className="btn btn-secondary" style={{ marginBottom: '2rem' }} onClick={() => router.push('/dashboard')}>
          &larr; Dashboard
        </button>
        <h1 className="text-center" style={{ fontSize: '3rem', marginBottom: '2rem' }}>Hybrid Search</h1>
        
        <form onSubmit={handleSearch} className="flex gap-2 relative">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question or search keywords..."
            style={{ 
              padding: '1.2rem 2rem', 
              fontSize: '1.2rem', 
              borderRadius: '50px',
              backgroundColor: 'var(--bg-tertiary)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              border: '1px solid var(--glass-border)'
            }}
          />
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={loading || !query.trim()}
            style={{ 
              position: 'absolute', 
              right: '8px', 
              top: '8px', 
              bottom: '8px', 
              borderRadius: '40px',
              padding: '0 2rem'
            }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
        {error && <p style={{ color: 'var(--danger)', marginTop: '1rem', textAlign: 'center' }}>{error}</p>}
      </div>

      <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {results.map((result, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <span className="text-accent" style={{ fontWeight: 600 }}>Score: {result.score.toFixed(3)}</span>
              <span className="text-secondary" style={{ fontSize: '0.9rem' }}>Doc: {result.document_id}</span>
            </div>
            <p style={{ lineHeight: 1.6, color: 'var(--text-primary)' }}>
              {result.content}
            </p>
          </div>
        ))}

        {!loading && results.length === 0 && query && !error && (
          <p className="text-secondary text-center">No results found for "{query}".</p>
        )}
      </div>

    </div>
  );
}
