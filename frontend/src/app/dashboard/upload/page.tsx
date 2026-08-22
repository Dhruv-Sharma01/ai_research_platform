'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useTenant } from '@/components/TenantProvider';
import { canUploadDocument } from '@/lib/permissions';

export default function UploadPage() {
  const router = useRouter();
  const { activeTenant } = useTenant();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  // Post-upload tracking state
  const [uploadedJobId, setUploadedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [uploadedDocName, setUploadedDocName] = useState<string>('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeTenant && !canUploadDocument(activeTenant.role)) {
      alert('You do not have permission to upload documents in this organization.');
      router.push('/dashboard');
    }
  }, [activeTenant, router]);

  // Cleanup poll timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const pollJobStatus = useCallback((jobId: string) => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const job = await fetchApi(`/jobs/${jobId}`);
        setJobStatus(job.status);
        if (job.status === 'completed' || job.status === 'failed') {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
      } catch (err) {
        console.error('Failed to poll job status', err);
      }
    }, 2000);
  }, []);

  if (!activeTenant || !canUploadDocument(activeTenant.role)) return null;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setError('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const idempotencyKey = `upload-${Date.now()}`;

      const res = await fetchApi('/documents', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: formData,
      });

      // Start tracking the ingestion job
      setUploadedDocName(file.name);
      setUploadedJobId(res.job_id);
      setJobStatus('pending');
      setFile(null);
      pollJobStatus(res.job_id);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Queued — waiting for worker...';
      case 'processing': return 'Processing — chunking & embedding...';
      case 'completed': return 'Done! Document is ready.';
      case 'failed': return 'Ingestion failed.';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'var(--success)';
      case 'failed': return 'var(--danger)';
      default: return 'var(--accent-primary)';
    }
  };

  const getProgressPercent = (status: string) => {
    switch (status) {
      case 'pending': return 15;
      case 'processing': return 65;
      case 'completed': return 100;
      case 'failed': return 100;
      default: return 0;
    }
  };

  // If we have an active job, show the progress tracker
  if (uploadedJobId && jobStatus) {
    const isDone = jobStatus === 'completed' || jobStatus === 'failed';
    return (
      <div className="page-container animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {jobStatus === 'completed' ? '✅' : jobStatus === 'failed' ? '❌' : '⏳'}
          </div>
          <h2 style={{ marginBottom: '0.5rem' }}>
            {jobStatus === 'completed' ? 'Ingestion Complete' : jobStatus === 'failed' ? 'Ingestion Failed' : 'Ingesting Document'}
          </h2>
          <p className="text-secondary" style={{ marginBottom: '2rem' }}>
            {uploadedDocName}
          </p>

          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '1rem',
          }}>
            <div style={{
              height: '100%',
              width: `${getProgressPercent(jobStatus)}%`,
              borderRadius: '4px',
              background: jobStatus === 'failed'
                ? 'var(--danger)'
                : 'linear-gradient(90deg, var(--accent-primary), #8b5cf6)',
              transition: 'width 0.5s ease-in-out',
            }} />
          </div>
          <p style={{ color: getStatusColor(jobStatus), fontWeight: 600, fontSize: '0.9rem' }}>
            {getStatusLabel(jobStatus)}
          </p>

          {isDone && (
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </button>
              <button className="btn btn-secondary" onClick={() => {
                setUploadedJobId(null);
                setJobStatus(null);
                setUploadedDocName('');
              }}>
                Upload Another
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in" style={{ maxWidth: '600px' }}>
      <button className="btn btn-secondary" style={{ marginBottom: '2rem' }} onClick={() => router.push('/dashboard')}>
        &larr; Back to Dashboard
      </button>

      <div className="glass-panel" style={{ padding: '3rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Upload Document</h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>
          Upload PDFs, TXTs, or Markdown files to be chunked, embedded, and indexed.
        </p>

        {error && (
          <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="flex flex-col gap-4">
          <div 
            style={{ 
              border: '2px dashed var(--border-color)', 
              borderRadius: '12px', 
              padding: '4rem 2rem', 
              textAlign: 'center',
              backgroundColor: 'rgba(0,0,0,0.2)',
              cursor: 'pointer'
            }}
          >
            <input 
              type="file" 
              id="file-upload" 
              style={{ display: 'none' }} 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".pdf,.txt,.md"
            />
            <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'block' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
              {file ? (
                <span className="text-accent">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              ) : (
                <span className="text-secondary">Click to browse or drag and drop<br/><small>Supports PDF, TXT, MD</small></span>
              )}
            </label>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={!file || uploading} 
            style={{ marginTop: '1rem', padding: '1rem', fontSize: '1.1rem' }}
          >
            {uploading ? 'Uploading...' : 'Upload & Ingest'}
          </button>
        </form>
      </div>
    </div>
  );
}
