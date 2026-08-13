'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from './TenantProvider';
import { fetchApi } from '@/lib/api';

export function Header() {
  const router = useRouter();
  const { memberships, activeTenant, switchTenant, isLoading } = useTenant();
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);

  useEffect(() => {
    // Fetch pending invites if authenticated
    if (localStorage.getItem('access_token')) {
      fetchApi('/organizations/invites/pending')
        .then((invites: any[]) => setPendingInvitesCount(invites.length))
        .catch(console.error);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('active_tenant_id');
    window.location.href = '/login';
  };

  if (isLoading) return null;

  return (
    <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', marginBottom: '2rem', borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <h2 style={{ margin: 0, cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>AI Research</h2>
        
        {memberships.length > 0 && (
          <select 
            value={activeTenant?.org_id || ''}
            onChange={(e) => switchTenant(e.target.value)}
            className="input"
            style={{ width: 'auto', padding: '0.5rem' }}
          >
            {memberships.map((m) => (
              <option key={m.org_id} value={m.org_id}>
                {m.organization.name} ({m.role})
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button 
          className="btn btn-secondary" 
          onClick={() => router.push('/invites')}
          style={{ position: 'relative' }}
        >
          Inbox
          {pendingInvitesCount > 0 && (
            <span style={{ 
              position: 'absolute', top: -5, right: -5, 
              background: 'var(--danger)', color: 'white', 
              borderRadius: '50%', width: 20, height: 20, 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem'
            }}>
              {pendingInvitesCount}
            </span>
          )}
        </button>
        <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
      </div>
    </header>
  );
}
