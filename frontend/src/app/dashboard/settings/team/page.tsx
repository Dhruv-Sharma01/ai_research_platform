'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/TenantProvider';
import { canManageTeam } from '@/lib/permissions';

export default function TeamSettingsPage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { activeTenant } = useTenant();

  useEffect(() => {
    if (activeTenant && !canManageTeam(activeTenant.role)) {
      alert('You do not have permission to manage the team.');
      router.push('/dashboard');
    }
  }, [activeTenant, router]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetchApi('/organizations/invites', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      alert('Invitation sent successfully!');
      setEmail('');
    } catch (err: any) {
      alert(err.message || 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  if (!activeTenant || !canManageTeam(activeTenant.role)) return null;

  return (
    <div className="page-container animate-fade-in">
      <h1 style={{ marginBottom: '2rem' }}>Team Settings</h1>
      
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h3>Invite new member</h3>
        <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>Invite someone to join {activeTenant.organization.name}.</p>
        
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flexGrow: 1 }}>
            <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Email Address</label>
            <input 
              type="email" 
              className="input" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
            />
          </div>
          <div style={{ width: '200px' }}>
            <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="viewer">Viewer (Read only)</option>
              <option value="editor">Editor (Upload/Delete)</option>
              <option value="admin">Admin (Manage Team)</option>
            </select>
          </div>
          <div style={{ paddingTop: '1.75rem' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
