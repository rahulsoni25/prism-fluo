'use client';

import { useState } from 'react';
import Navigation from './Navigation';
import PageHeader from './PageHeader';
import StatsRow from './StatsRow';
import FilterBar from './FilterBar';
import BriefsGrid from './BriefsGrid';
import Button from './Button';
import Footer from './Footer';

export default function DashboardPage({ user, briefs = [] }) {
  const [filteredBriefs, setFilteredBriefs] = useState(briefs);

  const stats = [
    {
      label: 'Active Briefs',
      value: briefs.filter((b) => b.status === 'active').length,
      icon: '📋',
      trend: 12,
      description: 'vs. last month',
    },
    {
      label: 'Total Budget',
      value: '$124.5K',
      icon: '💰',
      trend: 8,
      description: 'allocated',
    },
    {
      label: 'Avg Response Time',
      value: '2.4h',
      icon: '⚡',
      trend: -5,
      description: 'faster than last month',
    },
    {
      label: 'Insights Generated',
      value: '428',
      icon: '📊',
      trend: 24,
      description: 'this month',
    },
  ];

  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
      ],
    },
    {
      key: 'category',
      label: 'Category',
      options: [
        { label: 'Content', value: 'content' },
        { label: 'Commerce', value: 'commerce' },
        { label: 'Social', value: 'social' },
        { label: 'Campaign', value: 'campaign' },
      ],
    },
  ];

  const handleFilterChange = (activeFilters) => {
    let filtered = briefs;

    if (activeFilters.status) {
      filtered = filtered.filter((b) => b.status === activeFilters.status);
    }

    if (activeFilters.category) {
      filtered = filtered.filter((b) => b.category === activeFilters.category);
    }

    setFilteredBriefs(filtered);
  };

  const handleBriefClick = (briefId) => {
    console.log('Navigating to brief:', briefId);
    // Handle navigation to brief details
  };

  const handleNewBrief = () => {
    console.log('Creating new brief');
    // Handle new brief creation
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <Navigation
        user={user}
        onSignOut={() => {
          console.log('Signing out');
        }}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <PageHeader
          title="My Briefs"
          description="Manage and monitor all your marketing briefs and campaigns"
          action={
            <Button onClick={handleNewBrief} size="lg">
              + New Brief
            </Button>
          }
        />

        {/* Stats Row */}
        <StatsRow stats={stats} />

        {/* Filter Bar */}
        <FilterBar filters={filters} onFilterChange={handleFilterChange} />

        {/* Briefs Grid */}
        {filteredBriefs.length > 0 ? (
          <BriefsGrid briefs={filteredBriefs} onBriefClick={handleBriefClick} />
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <p className="text-slate-600 font-400 mb-4">
              No briefs match your filters
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reset filters
            </Button>
          </div>
        )}
      </main>

      {/* Footer with Objective, Key Findings, Actions */}
      <Footer
        objective="Understand the evolving preferences of Indian running shoe consumers to effectively capture market share and optimize product communication strategies."
        keyFindings={[
          'Indian runners are rapidly shifting to biomechanically specific footwear, with "running shoes for overpronation" searches surging 1257% YoY',
          'ASICS and HOKA are experiencing significant brand discovery and preference, evidenced by triple-digit search growth',
          'Interest in specific shoe models declines rapidly, indicating consumers prioritize innovation and fresh performance features'
        ]}
        actions={[
          'Develop and promote educational content and product lines addressing specific biomechanical needs like overpronation, targeting a 50% increase in engagement within 6 months',
          'Shift marketing spend to highlight brand-specific performance features and innovation rather than specific model numbers, aiming to increase brand searches by 20% YoY',
          'Implement a strategic product introduction and sunsetting communication plan, focusing on freshness and performance upgrades to mitigate model obsolescence trends'
        ]}
      />
    </div>
  );
}
