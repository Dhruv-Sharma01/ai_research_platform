export default function Home() {
  return (
    <div className="page-container flex flex-col items-center justify-center animate-fade-in" style={{ minHeight: '100vh', textAlign: 'center' }}>
      
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '3.5rem', marginBottom: '1rem', background: 'linear-gradient(to right, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          AI Research Platform
        </h1>
        <p className="text-secondary" style={{ fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
          A Postgres-Maximalist, hybrid-retrieval engine for querying your custom documents with lightning speed and AI precision.
        </p>
      </div>

      <div className="flex gap-4">
        <a href="/login" className="btn btn-primary" style={{ textDecoration: 'none', padding: '0.8rem 2rem', fontSize: '1.1rem' }}>
          Get Started
        </a>
        <a href="/search" className="btn btn-secondary" style={{ textDecoration: 'none', padding: '0.8rem 2rem', fontSize: '1.1rem' }}>
          Try Search
        </a>
      </div>

    </div>
  );
}
