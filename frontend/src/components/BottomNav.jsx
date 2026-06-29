import { UtensilsCrossed, BarChart3, User, Sparkles } from 'lucide-react'
import './BottomNav.css'

const TABS = {
  menu: { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
  stats: { key: 'stats', label: 'Stats', icon: BarChart3 },
  profile: { key: 'profile', label: 'Profile', icon: User },
  ai: { key: 'ai', label: 'AI', icon: Sparkles },
}

export function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="bottom-nav">
      {Object.values(TABS).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`bottom-nav-btn ${activeTab === key ? 'active' : ''} ${key === 'ai' ? 'ai-btn' : ''}`}
          onClick={() => onTabChange(key)}
          aria-label={label}
        >
          <Icon size={20} strokeWidth={2} />
          <span className="bottom-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
