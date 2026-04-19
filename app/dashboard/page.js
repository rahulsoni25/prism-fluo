'use client';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import BriefCard from '@/components/BriefCard';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const [filter, setFilter] = useState('All Briefs');

  const navToNew = () => router.push('/brief/new');

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main">
        <div className="container">
          <div className="page-header">
            <div>
              <div className="page-title">My Insights Briefs</div>
              <div className="page-sub">Track your client intelligence requests</div>
            </div>
            <button className="btn btn-primary" onClick={navToNew}>+ New Brief</button>
          </div>
          
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Total Briefs</div>
              <div className="stat-val">12</div>
              <div className="stat-note">↑ 3 this month</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Insights Ready</div>
              <div className="stat-val" style={{ color: '#059669' }}>8</div>
              <div className="stat-note" style={{ color: 'var(--muted)' }}>2 new today</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">In Progress</div>
              <div className="stat-val" style={{ color: '#D97706' }}>3</div>
              <div className="stat-note" style={{ color: 'var(--muted)' }}>Avg 18 hr delivery</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Data Sources</div>
              <div className="stat-val" style={{ color: 'var(--primary)' }}>7</div>
              <div className="stat-note" style={{ color: 'var(--muted)' }}>Platforms connected</div>
            </div>
          </div>
          
          <div className="filter-bar">
            {['All Briefs', 'Ready', 'Processing', 'Draft'].map(f => (
              <button 
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          
          <div className="briefs-grid">
            {(filter === 'All Briefs' || filter === 'Ready') && (
              <BriefCard
                href="/insights"
                icon="👟"
                badgeText="✓ Ready"
                badgeClass="badge-ready"
                brand="Nike India"
                meta="New Product Launch · Submitted 2 days ago"
                tags={['Sportswear', '18–34', 'India', 'Male + Female']}
                footerItems={['📊 24 insights', '🗂 4 buckets', '📡 7 sources']}
              />
            )}
            {(filter === 'All Briefs' || filter === 'Processing') && (
              <BriefCard
                href="/brief/processing"
                icon="☕"
                badgeText="⟳ Processing"
                badgeClass="badge-processing"
                badgeExtra="pulsing"
                brand="Nescafé Premium"
                meta="New Communication · Submitted 8 hours ago"
                tags={['FMCG / Beverages', '25–44', 'Metro India']}
                footerItems={['⏳ ~16 hrs remaining', '📡 4 / 7 sources done']}
              />
            )}
            {(filter === 'All Briefs' || filter === 'Ready') && (
              <BriefCard
                href="/insights"
                icon="💄"
                badgeText="✓ Ready"
                badgeClass="badge-ready"
                brand="L'Oréal Paris"
                meta="Brand Refresh · Submitted 5 days ago"
                tags={['Beauty', '18–45', 'Urban India', 'Female']}
                footerItems={['📊 31 insights', '🗂 4 buckets', '📡 7 sources']}
              />
            )}
            {(filter === 'All Briefs' || filter === 'Draft') && (
              <BriefCard
                href="/brief/new"
                icon="🚗"
                badgeText="Draft"
                badgeClass="badge-draft"
                brand="Tata Motors EV"
                meta="New Product Launch · Draft saved"
                tags={['Automotive', '28–50', 'Pan India']}
                isDraft={true}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
