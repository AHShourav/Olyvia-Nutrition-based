import { useState, useEffect, useCallback } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js'
import { useAuth } from '../../context/AuthContext'
import { fetchStatsDashboard, updateProfile } from '../../services/api'
import './StatsPage.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler)

const DEFAULT_TRACKED = ['energy_kcal', 'proteins', 'sugars', 'sodium', 'fat']

const ALL_NUTRIENTS = [
  { key: 'energy_kcal', label: 'Calories', unit: 'kcal', targetKey: 'energy_kcal' },
  { key: 'proteins', label: 'Protein', unit: 'g', targetKey: 'proteins' },
  { key: 'sugars', label: 'Sugar', unit: 'g', targetKey: 'sugars' },
  { key: 'sodium', label: 'Sodium', unit: 'mg', targetKey: 'sodium' },
  { key: 'fat', label: 'Fat', unit: 'g', targetKey: 'fat' },
  { key: 'saturated_fat', label: 'Saturated fat', unit: 'g', targetKey: 'saturated_fat' },
  { key: 'carbs', label: 'Carbs', unit: 'g', targetKey: 'carbs' },
  { key: 'fiber', label: 'Fiber', unit: 'g', targetKey: 'fiber' },
]

const CONDITION_LABELS = {
  hypertension: 'blood pressure',
  diabetes: 'diabetes',
  high_cholesterol: 'cholesterol',
  kidney: 'kidney health',
  heart: 'heart health',
  digestive: 'digestive health',
  food_allergies: 'food allergies',
}

const TARGETS = {
  energy_kcal: 2000,
  proteins: 50,
  sugars: 50,
  sodium: 2300,
  fat: 65,
  saturated_fat: 20,
  carbs: 260,
  fiber: 25,
}

function getValue(summary, key) {
  if (key === 'sodium') return summary?.sodium ?? summary?.sodium_mg ?? 0
  return summary?.[key] ?? 0
}

function getStatus(pct, demoteOver = false) {
  if (pct <= 0.9) return 'good'
  if (pct <= 1) return 'ok'
  if (demoteOver) return 'ok' /* show amber instead of red for lower-priority overages */
  return 'over'
}

/** Rank over-limit nutrients by excess; only top 2 get red, rest get amber. */
function getOverPriorityIndices(trackedItems, summary, targets) {
  const overItems = trackedItems
    .map((item, idx) => {
      const v = getValue(summary, item.key)
      const t = targets[item.targetKey] || TARGETS[item.targetKey] || 100
      const ratio = t > 0 ? (v ?? 0) / t : 0
      return { idx, ratio, excess: Math.max(0, ratio - 1) }
    })
    .filter((x) => x.ratio > 1)
    .sort((a, b) => b.excess - a.excess)
  return new Set(overItems.slice(0, 2).map((x) => x.idx))
}

function NutrientRing({ item, value, target, onRemove, demoteOver }) {
  const v = value ?? 0
  const t = target || TARGETS[item.targetKey] || 100
  const ratio = t > 0 ? v / t : 0
  const displayPct = Math.min(ratio, 1) * 100
  const status = getStatus(ratio, demoteOver)
  const strokeDash = Math.min(ratio, 1) * 100

  return (
    <div className="stats-ring-wrap">
      <div className="stats-ring-container">
        <svg viewBox="0 0 36 36" className="stats-ring-svg">
          <path
            className="stats-ring-bg"
            d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
          />
          <path
            className={`stats-ring-fill stats-ring-${status}`}
            strokeDasharray={`${strokeDash} 100`}
            d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
          />
        </svg>
        <span className="stats-ring-value">{Math.round(v)}</span>
      </div>
      <span className="stats-ring-label">{item.label}</span>
      <span className="stats-ring-pct">{ratio > 1 ? 'Over' : `${Math.round(displayPct)}%`}</span>
      {onRemove && (
        <button type="button" className="stats-ring-remove" onClick={() => onRemove(item.key)} aria-label="Remove nutrient" />
      )}
    </div>
  )
}

function AddNutrientButton({ onClick }) {
  return (
    <button type="button" className="stats-add-ring" onClick={onClick} aria-label="Add nutrient">
      <span className="stats-add-icon">+</span>
    </button>
  )
}

export function StatsPage() {
  const { profile, refreshProfile, isAuthenticated } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNutrientPicker, setShowNutrientPicker] = useState(false)

  const tracked = (profile?.stats_tracked_nutrients || []).length
    ? profile.stats_tracked_nutrients
    : DEFAULT_TRACKED

  const load = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await fetchStatsDashboard()
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    load()
  }, [load])

  const addNutrient = (key) => {
    if (tracked.includes(key)) return
    const next = [...tracked.filter((k) => k !== 'none'), key]
    updateProfile({ stats_tracked_nutrients: next }).then(() => refreshProfile())
    setShowNutrientPicker(false)
  }

  const removeNutrient = (key) => {
    const next = tracked.filter((k) => k !== key)
    if (next.length < 1) return
    updateProfile({ stats_tracked_nutrients: next }).then(() => refreshProfile())
  }

  const getMicroFeedback = () => {
    const s = data?.today_summary || {}
    const t = data?.targets || TARGETS
    const checks = []
    const sodium = getValue(s, 'sodium')
    const sugar = getValue(s, 'sugars')
    const sodiumTarget = t.sodium || 2300
    const sugarTarget = t.sugars || 50
    if (sodium > 0 && sodium <= sodiumTarget * 1.05) checks.push('sodium')
    if (sodium > sodiumTarget * 1.05) checks.push('sodium_high')
    if (sugar > 0 && sugar <= sugarTarget * 1.05) checks.push('sugar')
    if (sugar > sugarTarget * 1.05) checks.push('sugar_high')
    if (checks.includes('sodium_high')) return 'Sodium is approaching your limit.'
    if (checks.includes('sugar_high')) return 'Sugar is approaching your limit.'
    if (checks.includes('sodium')) return "You're within your sodium range today."
    if (checks.includes('sugar')) return "You're within your sugar range today."
    return "You're on track today."
  }

  if (loading) {
    return (
      <div className="stats-page">
        <p className="stats-loading">Loading…</p>
      </div>
    )
  }

  const summary = data?.today_summary || {}
  const targets = data?.targets || TARGETS
  const healthRisk = data?.health_risk || {}
  const trend = data?.trend || { dates: [], energy_kcal: [], sugars: [], sodium: [] }
  const insights = data?.insights || []

  const trackedItems = tracked
    .filter((k) => k && k !== 'none')
    .map((k) => ALL_NUTRIENTS.find((n) => n.key === k))
    .filter(Boolean)

  const chartData = {
    labels: (trend.dates || []).map((d) => {
      const dt = new Date(d)
      return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }),
    datasets: [
      {
        label: 'Calories (kcal)',
        data: trend.energy_kcal || [],
        borderColor: 'rgba(102, 158, 255, 0.8)',
        backgroundColor: 'rgba(102, 158, 255, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Sugar (g)',
        data: trend.sugars || [],
        borderColor: 'rgba(245, 158, 11, 0.8)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { font: { size: 11 }, boxWidth: 12, padding: 12 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxRotation: 0 },
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { font: { size: 10 } },
      },
    },
  }

  const riskLabel =
    healthRisk.level === 'low'
      ? 'Stable'
      : healthRisk.level === 'moderate'
        ? 'Moderate impact'
        : 'Elevated impact'

  const conditionImpacts = healthRisk.condition_impacts || []
  const topContributors = healthRisk.top_contributors || []
  const nextAction = healthRisk.next_action
  const conditionsAffected = conditionImpacts.length

  return (
    <div className="stats-page">
      <h2 className="stats-title">Today</h2>

      {/* 1. Today Snapshot */}
      <section className="stats-section stats-snapshot">
        <div className="stats-rings-row">
          {(() => {
            const topOverIndices = getOverPriorityIndices(trackedItems, summary, targets)
            return trackedItems.map((item, idx) => (
              <NutrientRing
                key={item.key}
                item={item}
                value={getValue(summary, item.key)}
                target={targets[item.targetKey]}
                onRemove={trackedItems.length > 1 ? removeNutrient : null}
                demoteOver={!topOverIndices.has(idx)}
              />
            ))
          })()}
          <AddNutrientButton onClick={() => setShowNutrientPicker(true)} />
        </div>
        <p className="stats-micro-feedback">{getMicroFeedback()}</p>
      </section>

      {showNutrientPicker && (
        <div className="stats-picker-overlay" onClick={() => setShowNutrientPicker(false)}>
          <div className="stats-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="stats-picker-title">Add nutrient to track</h3>
            <div className="stats-picker-options">
              {ALL_NUTRIENTS.filter((n) => !tracked.includes(n.key)).map((n) => (
                <button
                  key={n.key}
                  type="button"
                  className="stats-picker-option"
                  onClick={() => addNutrient(n.key)}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <button type="button" className="stats-picker-close" onClick={() => setShowNutrientPicker(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 2. Last 7 Days - moved above Health Impact */}
      {trend.dates?.length > 0 && (
        <section className="stats-section">
          <h3 className="stats-section-title">Last 7 days</h3>
          <div className="stats-chart-wrap">
            <Line data={chartData} options={chartOptions} />
          </div>
          {trend.sugars?.length >= 6 && (() => {
            const thisWeek = trend.sugars.slice(-3).reduce((a, b) => a + b, 0) / 3
            const lastWeek = trend.sugars.slice(0, 3).reduce((a, b) => a + b, 0) / 3
            const pct = lastWeek > 0 ? Math.round((1 - thisWeek / lastWeek) * 100) : 0
            if (Math.abs(pct) >= 5) {
              return (
                <p className="stats-trend-note">
                  Sugar intake {pct > 0 ? 'decreased' : 'increased'} {Math.abs(pct)}% compared to last week.
                </p>
              )
            }
            return null
          })()}
        </section>
      )}

      {/* 3. Health Impact Today */}
      <section className="stats-section">
        <h3 className="stats-section-title">Health Impact Today</h3>
        {profile?.health_conditions?.filter((c) => c && c !== 'none').length > 0 && (
          <p className="stats-impact-subtitle-top">
            Personalized to your {profile.health_conditions
              .filter((c) => c && c !== 'none')
              .slice(0, 2)
              .map((c) => CONDITION_LABELS[c] || c)
              .join(' and ')} goals
          </p>
        )}
        <div className={`stats-impact-card stats-impact-${healthRisk.level || 'low'}`}>
          <div className="stats-impact-header">
            <span className={`stats-impact-badge stats-impact-badge-${healthRisk.level || 'low'}`}>
              {riskLabel}
            </span>
            {conditionsAffected > 0 && (
              <span className="stats-impact-subtitle">
                {conditionsAffected} condition{conditionsAffected !== 1 ? 's' : ''} affected today
              </span>
            )}
          </div>

          {healthRisk.level === 'low' ? (
            <p className="stats-impact-summary">
              {healthRisk.message || 'All logged foods fit your health rules today.'}
            </p>
          ) : (
            <>
              <p className="stats-impact-summary">
                Today&apos;s intake may increase risk for some of your tracked conditions.
              </p>

              {conditionImpacts.length > 0 && (
                <>
                  <div className="stats-impact-arrow" aria-hidden>↓</div>
                  <div className="stats-impact-conditions">
                    {conditionImpacts.map((imp, i) => (
                      <div key={i} className="stats-impact-condition-card">
                        <span className="stats-impact-condition">{imp.condition_label}</span>
                        <span className={`stats-impact-chip stats-impact-chip-${imp.severity}`}>
                          {imp.severity === 'high' ? 'High' : imp.severity === 'watch' ? 'Watch' : 'Moderate'}
                        </span>
                        <p className="stats-impact-cause">{imp.chip || imp.cause}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {topContributors.length > 0 && (
                <>
                  <div className="stats-impact-arrow" aria-hidden>↓</div>
                  <div className="stats-impact-contributors">
                    <span className="stats-impact-contributors-label">Main drivers</span>
                    <span className="stats-impact-contributors-list">
                      {topContributors.slice(0, 5).join(', ')}
                    </span>
                  </div>
                </>
              )}

              {nextAction && (
                <>
                  <div className="stats-impact-arrow" aria-hidden>↓</div>
                  <div className="stats-impact-action">
                    <span className="stats-impact-action-label">Next best step</span>
                    <p className="stats-impact-action-text">{nextAction}</p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* 4. Smart Insights */}
      {insights.length > 0 && (
        <section className="stats-section">
          <h3 className="stats-section-title">Insights</h3>
          <div className="stats-insights">
            {insights.map((line, i) => (
              <p key={i} className="stats-insight-line">
                {line}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
