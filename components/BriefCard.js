import Link from 'next/link';

export default function BriefCard({
  href,
  icon,
  badgeText,
  badgeClass,
  badgeExtra = '',
  brand,
  meta,
  tags,
  footerItems,
  isDraft
}) {
  return (
    <Link href={href || '#'} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div className="brief-card">
        <div className="brief-card-top">
          <div className="brief-icon">{icon}</div>
          <span className={`badge ${badgeClass} ${badgeExtra}`}>{badgeText}</span>
        </div>
        <div className="brief-brand">{brand}</div>
        <div className="brief-meta">{meta}</div>
        <div className="brief-tags">
          {tags.map((tag, idx) => (
            <span key={idx} className="tag">{tag}</span>
          ))}
        </div>
        
        {isDraft ? (
          <div style={{ marginTop: '14px' }}>
            <button className="btn btn-outline btn-sm">Continue Editing →</button>
          </div>
        ) : (
          <div className="brief-footer">
            {footerItems.map((item, idx) => (
              <span key={idx}>{item}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
