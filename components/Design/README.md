# PRISM Design System Components

A comprehensive collection of React components that implement the PRISM Fluo design system, matching the prototype specification exactly.

## Components Overview

### Navigation & Layout

#### Navigation
Main navigation bar component with branding, menu links, and user profile.

```jsx
import { Navigation } from '@/components/Design';

<Navigation 
  user={{ name: 'John Doe', initials: 'JD' }}
  onSignOut={() => handleSignOut()}
/>
```

**Props:**
- `user`: Object with `name` and `initials`
- `onSignOut`: Callback function for sign-out action

#### PageHeader
Page title and description with optional action button.

```jsx
<PageHeader 
  title="My Briefs"
  description="Manage all your campaigns"
  action={<Button>+ New</Button>}
/>
```

#### StatsRow
Grid of statistics cards with metrics and trends.

```jsx
<StatsRow stats={[
  { label: 'Active Briefs', value: '12', trend: 5 },
  { label: 'Budget', value: '$50K', icon: '💰' }
]} />
```

### Filtering & Selection

#### FilterBar
Interactive filter buttons for data filtering.

```jsx
<FilterBar 
  filters={[
    { key: 'status', label: 'Status', options: [
      { label: 'Active', value: 'active' }
    ]}
  ]}
  onFilterChange={(filters) => handleFilter(filters)}
/>
```

#### BucketTabs
Tab navigation for switching between data categories (Content, Commerce, etc.).

```jsx
<BucketTabs 
  buckets={['Content', 'Commerce', 'Communication', 'Culture']}
  onBucketChange={(bucket) => handleChange(bucket)}
/>
```

### Brief Management

#### BriefCard
Individual brief card with status, metrics, and progress.

```jsx
<BriefCard 
  brief={{
    id: '1',
    brand: 'Nike',
    client: 'Nike Inc',
    status: 'active',
    category: 'content',
    budget: '$50K',
    duration: '3 months',
    sla: '24h',
    progress: 75
  }}
  onClick={() => navigate()}
/>
```

#### BriefsGrid
Responsive grid container for multiple brief cards.

```jsx
<BriefsGrid 
  briefs={briefs}
  onBriefClick={(briefId) => navigate(`/brief/${briefId}`)}
/>
```

#### NewBriefForm
Comprehensive form for creating new briefs with all required fields.

```jsx
<NewBriefForm 
  onSubmit={(formData) => createBrief(formData)}
  loading={isSubmitting}
/>
```

### Insights & Analytics

#### InsightCard
Card for displaying data insights with optional charts and metrics.

```jsx
<InsightCard 
  title="Top Performers"
  description="Based on engagement metrics"
  icon="📈"
  metrics={[
    { label: 'Engagement', value: '12.5K', change: 15 }
  ]}
/>
```

#### ChartWrapper
Wrapper component for Chart.js charts with automatic styling.

```jsx
<ChartWrapper 
  type="line"
  data={{
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{
      label: 'Revenue',
      data: [100, 150, 200]
    }]
  }}
  height={300}
/>
```

#### HeatmapChart
Specialized heatmap visualization component.

```jsx
<HeatmapChart 
  title="Engagement Heatmap"
  data={[[10, 20, 30], [15, 25, 35]]}
  labels={{
    columns: ['Mon', 'Tue', 'Wed'],
    rows: ['9am', '12pm']
  }}
/>
```

### Screen Components

#### LoginCard
Complete login form screen with gradient background.

```jsx
<LoginCard />
```

#### ProcessingScreen
Processing progress screen with platform cards and progress bars.

```jsx
<ProcessingScreen 
  fileName="data.csv"
  progress={65}
  onComplete={() => navigate('/results')}
/>
```

### Form Components

All form components include validation, error states, and helper text.

#### FormInput
Basic text input with label and error support.

```jsx
<FormInput
  label="Email"
  type="email"
  placeholder="you@company.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
  required
/>
```

#### FormSelect
Dropdown select with styled appearance.

```jsx
<FormSelect
  label="Category"
  options={[
    { label: 'Content', value: 'content' }
  ]}
  value={category}
  onChange={(e) => setCategory(e.target.value)}
/>
```

#### FormTextarea
Multi-line text input for longer content.

```jsx
<FormTextarea
  label="Description"
  rows={6}
  placeholder="Enter details..."
  value={description}
  onChange={(e) => setDescription(e.target.value)}
/>
```

#### AutocompleteInput
Text input with autocomplete dropdown suggestions.

```jsx
<AutocompleteInput
  label="Platform"
  placeholder="Select platform..."
  options={['Instagram', 'Facebook', 'TikTok']}
  value={platform}
  onChange={setPlatform}
  onSelect={(value) => handleSelect(value)}
/>
```

### UI Components

#### Button
Versatile button component with multiple variants and sizes.

```jsx
<Button variant="primary" size="md" loading={false}>
  Click me
</Button>
```

**Variants:** `primary`, `outline`, `ghost`, `secondary`  
**Sizes:** `sm`, `md`, `lg`

#### Badge
Label component for categorization and tagging.

```jsx
<Badge variant="primary" size="md" icon="✓">
  Active
</Badge>
```

**Variants:** `default`, `primary`, `success`, `warning`, `error`, `purple`, `orange`

#### Chip
Dismissible tag component for selected items.

```jsx
<Chip 
  variant="blue"
  onRemove={() => removeChip()}
  icon="✓"
>
  Selected Item
</Chip>
```

#### Modal
Dialog modal for overlays and confirmations.

```jsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Action"
  size="md"
  footer={
    <>
      <Button onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button variant="primary">Confirm</Button>
    </>
  }
>
  Are you sure?
</Modal>
```

### Page Components

#### DashboardPage
Complete dashboard page with navigation, stats, filters, and brief grid.

```jsx
<DashboardPage 
  user={{ name: 'John', initials: 'JD' }}
  briefs={briefs}
/>
```

## Design System Specifications

### Colors
- **Primary:** Blue (#2563EB)
- **Secondary:** Purple (#7C3AED)
- **Success:** Green (#059669)
- **Warning:** Orange (#D97706)
- **Neutral:** Slate (50-900)

### Typography
- **Font Family:** Inter
- **Weights:** 300, 400, 500, 600, 700, 800
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 24px, 32px

### Spacing
- **Base Unit:** 8px (scales as 8, 16, 24, 32, 40, 48, 56, 64)

### Border Radius
- **Small:** 6px
- **Medium:** 10px
- **Large:** 14px
- **Extra Large:** 20px

### Shadows
- **Subtle:** `0 1px 2px 0 rgba(0,0,0,0.05)`
- **Large:** `0 20px 25px -5px rgba(0,0,0,0.1)`

### Animations
- **Transitions:** 150-350ms ease
- **Timing:** `transition-all`

## Usage Examples

### Complete Dashboard Flow

```jsx
import { 
  Navigation, 
  PageHeader, 
  StatsRow, 
  FilterBar, 
  BriefsGrid,
  Button 
} from '@/components/Design';

export default function Dashboard() {
  const [briefs, setBriefs] = useState([]);
  const [filters, setFilters] = useState({});

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation user={user} onSignOut={handleSignOut} />
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        <PageHeader 
          title="My Briefs"
          action={<Button>+ New Brief</Button>}
        />
        
        <StatsRow stats={stats} />
        <FilterBar filters={filterConfig} onFilterChange={setFilters} />
        <BriefsGrid briefs={briefs} onBriefClick={navigateToBrief} />
      </main>
    </div>
  );
}
```

### Form with Validation

```jsx
import { 
  FormInput, 
  FormSelect, 
  FormTextarea,
  AutocompleteInput,
  Button,
  Chip
} from '@/components/Design';

export default function CreateBrief() {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validate(data);
    if (Object.keys(newErrors).length === 0) {
      await submitForm(data);
    } else {
      setErrors(newErrors);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormInput
        label="Brand Name"
        value={data.brand}
        onChange={(e) => setData({...data, brand: e.target.value})}
        error={errors.brand}
      />
      {/* More fields... */}
      <Button type="submit">Create</Button>
    </form>
  );
}
```

## Installation

All components are located in `/components/Design/` and can be imported individually:

```jsx
import { Button, Badge, Navigation } from '@/components/Design';
```

Or import the index for convenience:

```jsx
import * as Design from '@/components/Design';
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Notes

- All components use Tailwind CSS v4
- No external component libraries (shadcn/ui, Material-UI, etc.)
- Fully responsive and mobile-optimized
- Accessibility-first approach (ARIA labels, focus states, etc.)
- Zero dependencies beyond React and Tailwind

## File Structure

```
components/Design/
├── Navigation.jsx          # Main navigation bar
├── PageHeader.jsx          # Page title component
├── StatsRow.jsx            # Statistics cards grid
├── FilterBar.jsx           # Filter buttons
├── BucketTabs.jsx          # Category tabs
├── BriefCard.jsx           # Individual brief card
├── BriefsGrid.jsx          # Grid of briefs
├── NewBriefForm.jsx        # Brief creation form
├── InsightCard.jsx         # Insight display card
├── ChartWrapper.jsx        # Chart.js wrapper
├── HeatmapChart.jsx        # Heatmap visualization
├── LoginCard.jsx           # Login screen
├── ProcessingScreen.jsx    # Processing screen
├── FormInput.jsx           # Text input
├── FormSelect.jsx          # Select dropdown
├── FormTextarea.jsx        # Textarea input
├── AutocompleteInput.jsx   # Autocomplete input
├── Button.jsx              # Button component
├── Badge.jsx               # Badge/label component
├── Chip.jsx                # Dismissible chip
├── Modal.jsx               # Dialog modal
├── DashboardPage.jsx       # Complete dashboard
├── HeatmapChart.jsx        # Heatmap chart
├── index.js                # Export all components
└── README.md               # This file
```

## Support

For component issues or requests, check the component file comments or create an issue in the project repository.
