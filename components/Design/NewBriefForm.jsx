'use client';

import { useState } from 'react';
import FormInput from './FormInput';
import FormSelect from './FormSelect';
import FormTextarea from './FormTextarea';
import AutocompleteInput from './AutocompleteInput';
import Chip from './Chip';
import Button from './Button';

export default function NewBriefForm({ onSubmit, loading = false }) {
  const [formData, setFormData] = useState({
    brand: '',
    client: '',
    category: '',
    platforms: [],
    budget: '',
    duration: '',
    description: '',
    objectives: [],
  });

  const [platformInput, setPlatformInput] = useState('');
  const [objectiveInput, setObjectiveInput] = useState('');

  const categoryOptions = [
    { label: 'Content Strategy', value: 'content' },
    { label: 'E-commerce', value: 'commerce' },
    { label: 'Social Media', value: 'social' },
    { label: 'Campaign', value: 'campaign' },
  ];

  const platformOptions = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'Twitter'];
  const objectiveOptions = [
    'Increase brand awareness',
    'Drive traffic',
    'Generate leads',
    'Boost sales',
    'Improve engagement',
    'Build community',
  ];

  const handleAddPlatform = (platform) => {
    if (platform && !formData.platforms.includes(platform)) {
      setFormData((prev) => ({
        ...prev,
        platforms: [...prev.platforms, platform],
      }));
      setPlatformInput('');
    }
  };

  const handleRemovePlatform = (platform) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.filter((p) => p !== platform),
    }));
  };

  const handleAddObjective = (objective) => {
    if (objective && !formData.objectives.includes(objective)) {
      setFormData((prev) => ({
        ...prev,
        objectives: [...prev.objectives, objective],
      }));
      setObjectiveInput('');
    }
  };

  const handleRemoveObjective = (objective) => {
    setFormData((prev) => ({
      ...prev,
      objectives: prev.objectives.filter((o) => o !== objective),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      {/* Brief Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <h2 className="text-xl font-700 text-slate-900 mb-6">Brief Overview</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <FormInput
            label="Brand Name"
            placeholder="Enter brand name"
            required
            value={formData.brand}
            onChange={(e) =>
              setFormData({ ...formData, brand: e.target.value })
            }
          />

          <FormInput
            label="Client Name"
            placeholder="Enter client name"
            required
            value={formData.client}
            onChange={(e) =>
              setFormData({ ...formData, client: e.target.value })
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormSelect
            label="Category"
            placeholder="Select category"
            options={categoryOptions}
            required
            value={formData.category}
            onChange={(e) =>
              setFormData({ ...formData, category: e.target.value })
            }
          />

          <FormInput
            label="Budget"
            placeholder="$0.00"
            type="text"
            required
            value={formData.budget}
            onChange={(e) =>
              setFormData({ ...formData, budget: e.target.value })
            }
          />

          <FormInput
            label="Duration"
            placeholder="e.g., 3 months"
            required
            value={formData.duration}
            onChange={(e) =>
              setFormData({ ...formData, duration: e.target.value })
            }
          />
        </div>
      </div>

      {/* Platforms */}
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <h2 className="text-xl font-700 text-slate-900 mb-6">Platforms</h2>

        <AutocompleteInput
          label="Select Platforms"
          placeholder="Search platforms..."
          options={platformOptions}
          value={platformInput}
          onChange={setPlatformInput}
          onSelect={handleAddPlatform}
        />

        {formData.platforms.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {formData.platforms.map((platform) => (
              <Chip
                key={platform}
                variant="blue"
                onRemove={() => handleRemovePlatform(platform)}
              >
                {platform}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Objectives */}
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <h2 className="text-xl font-700 text-slate-900 mb-6">Objectives</h2>

        <AutocompleteInput
          label="Select Objectives"
          placeholder="Search objectives..."
          options={objectiveOptions}
          value={objectiveInput}
          onChange={setObjectiveInput}
          onSelect={handleAddObjective}
        />

        {formData.objectives.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {formData.objectives.map((objective) => (
              <Chip
                key={objective}
                variant="purple"
                onRemove={() => handleRemoveObjective(objective)}
              >
                {objective}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <FormTextarea
          label="Description"
          placeholder="Describe the brief, goals, and any other relevant details..."
          rows={6}
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          Create Brief
        </Button>
      </div>
    </form>
  );
}
