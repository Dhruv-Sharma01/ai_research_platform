'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/TenantProvider';
import { canUploadDocument, canDeleteDocument, canManageTeam } from '@/lib/permissions';

export default function DashboardPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { activeTenant } = useTenant();

  // If no tenant is selected, show onboarding
  if (!activeTenant) {
    return (
      <div className="page-container animate-fade-in text-center" style={{ marginTop: '5rem' }}>
        <h2>Welcome to AI Research</h2>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>You aren't a member of any organization yet.</p>
        <button className="btn btn-primary" onClick={() => router.push('/invites')}>Check Invitations</button>
      </div>
    );
  }

  const role = activeTenant.role;

  useEffect(() => {
    if (activeTenant) {
      loadDocuments();
    }
  }, [activeTenant]);

  const loadDocuments = async () => {
    try {
      const data = await fetchApi('/documents');
      setDocuments(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await fetchApi(`/documents/${id}`, { method: 'DELETE' });
      setDocuments(documents.filter(d => d.id !== id));
    } catch (err) {
      alert('Failed to delete document');
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>{activeTenant.organization.name}</h1>
          <p className="text-secondary">Role: <span style={{ textTransform: 'capitalize', color: 'var(--accent-primary)' }}>{role}</span></p>
        </div>
        <div className="flex gap-4">
          {canManageTeam(role) && (
            <button className="btn btn-secondary" onClick={() => router.push('/dashboard/settings/team')}>
              Team Settings
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => router.push('/search')}>
            🔍 Search
          </button>
          {canUploadDocument(role) && (
            <button className="btn btn-primary" onClick={() => router.push('/dashboard/upload')}>
              + Upload Document
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-secondary text-center" style={{ padding: '3rem' }}>Loading documents...</p>
      ) : documents.length === 0 ? (
        <div className="glass-panel text-center" style={{ padding: '4rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>No documents found</h3>
          <p className="text-secondary" style={{ marginBottom: '2rem' }}>You haven't uploaded any research material yet.</p>
          <button className="btn btn-primary" onClick={() => router.push('/dashboard/upload')}>
            Upload your first document
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {documents.map((doc) => (
            <div key={doc.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', wordBreak: 'break-all' }}>{doc.filename}</h3>
              <div className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '1.5rem', flexGrow: 1 }}>
                <p>Status: <span style={{ color: doc.status === 'ready' ? 'var(--success)' : doc.status === 'failed' ? 'var(--danger)' : 'var(--accent-primary)' }}>{doc.status}</span></p>
                <p>Chunks: {doc.chunk_count || 0}</p>
                <p>Size: {(doc.size_bytes / 1024).toFixed(1)} KB</p>
              </div>
              {canDeleteDocument(role) && (
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  onClick={() => deleteDocument(doc.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
