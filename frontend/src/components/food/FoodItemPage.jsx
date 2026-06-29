import { useState, useEffect } from 'react'
import { ArrowLeft, UtensilsCrossed } from 'lucide-react'
import { fixFoodResults } from '../../services/api'
import './FoodItemPage.css'

function FoodImage({ imageUrl }) {
  const [failed, setFailed] = useState(false)
  const showPlaceholder = !imageUrl || failed

  if (showPlaceholder) {
    return (
      <div className="food-item-placeholder">
        <UtensilsCrossed size={48} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      alt=""
      className="food-item-img"
      onError={() => setFailed(true)}
    />
  )
}

const MACRO_KEYS = [
  { key: 'energy_kcal', label: 'Calories', unit: 'kcal' },
  { key: 'proteins', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'sugars', label: 'Sugar', unit: 'g' },
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg' },
]

function getNutrientValue(item, key) {
  const n = item?.nutrients || item
  if (key === 'sodium_mg') return n?.sodium_mg ?? n?.sodium ?? 0
  return n?.[key] ?? 0
}

function getNutrientsForApi(item) {
  const n = item?.nutrients || item
  const raw = {
    energy_kcal: n?.energy_kcal,
    proteins: n?.proteins,
    carbs: n?.carbs,
    fat: n?.fat,
    sugars: n?.sugars,
    sodium_mg: n?.sodium_mg ?? n?.sodium,
  }
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null))
}

export function FoodItemPage({ item, onBack, onFixApplied }) {
  const [displayItem, setDisplayItem] = useState(item)
  useEffect(() => { setDisplayItem(item) }, [item])
  const [showFixModal, setShowFixModal] = useState(false)
  const [fixInput, setFixInput] = useState('')
  const [fixError, setFixError] = useState('')
  const [isFixing, setIsFixing] = useState(false)

  const activeItem = displayItem || item
  const name = activeItem?.name || activeItem?.food_name || activeItem?.query || 'Food'
  const imageUrl = activeItem?.image_url || activeItem?.image_small_url || ''
  const verdict = activeItem?.verdict || 'safe'
  const verdictLabel = activeItem?.verdict_label || 'Good'
  const verdictReason = activeItem?.verdict_reason || ''

  const handleFixClick = () => {
    setFixInput('')
    setFixError('')
    setShowFixModal(true)
  }

  const handleFixSubmit = async () => {
    const text = fixInput.trim()
    if (!text || isFixing) return
    setIsFixing(true)
    setFixError('')
    try {
      const title = activeItem?.name || activeItem?.food_name || activeItem?.query || 'Food'
      const nutrients = getNutrientsForApi(activeItem)
      const foodLogId = activeItem?.id ?? activeItem?.food_log_id ?? null
      const result = await fixFoodResults(title, nutrients, text, foodLogId)
      setDisplayItem({
        ...activeItem,
        id: result.food_log_id ?? activeItem?.id,
        food_log_id: result.food_log_id ?? activeItem?.food_log_id,
        name: result.name,
        food_name: result.name,
        verdict: result.verdict,
        verdict_label: result.verdict_label,
        verdict_reason: result.verdict_reason,
        nutrients: {
          ...(activeItem?.nutrients || activeItem),
          energy_kcal: result.energy_kcal,
          proteins: result.proteins,
          carbs: result.carbs,
          fat: result.fat,
          sugars: result.sugars,
          sodium_mg: result.sodium_mg,
        },
      })
      setShowFixModal(false)
      onFixApplied?.()
    } catch (err) {
      setFixError(err.message || 'Failed to apply fix')
    } finally {
      setIsFixing(false)
    }
  }

  const handleCloseFixModal = () => {
    if (!isFixing) {
      setShowFixModal(false)
      setFixInput('')
      setFixError('')
    }
  }

  return (
    <div className={`food-item-page verdict-${verdict}`}>
      <button type="button" className="food-item-back" onClick={onBack} aria-label="Back">
        <ArrowLeft size={20} strokeWidth={2} />
      </button>

      <div className="food-item-header">
        <div className="food-item-img-wrap">
          <FoodImage imageUrl={imageUrl} />
        </div>
        <h2 className="food-item-title">{name}</h2>
      </div>

      <div className={`food-item-verdict verdict-${verdict}`}>
        <span className="food-item-verdict-badge">{verdictLabel}</span>
        {verdictReason && <p className="food-item-verdict-reason">{verdictReason}</p>}
      </div>

      <section className="food-item-macros">
        <h3 className="food-item-section-title">Nutrients</h3>
        <div className="food-item-macros-grid">
          {MACRO_KEYS.map(({ key, label, unit }) => {
            const val = getNutrientValue(activeItem, key)
            if (val == null || (typeof val === 'number' && val === 0 && key !== 'energy_kcal')) return null
            return (
              <div key={key} className="food-item-macro">
                <span className="food-item-macro-value">{Math.round(Number(val))}</span>
                <span className="food-item-macro-unit">{unit}</span>
                <span className="food-item-macro-label">{label}</span>
              </div>
            )
          })}
        </div>
      </section>

      <button type="button" className="food-item-fix-btn" onClick={handleFixClick}>
        Fix Results
      </button>

      {showFixModal && (
        <div className="food-item-fix-overlay" onClick={handleCloseFixModal}>
          <div className="food-item-fix-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="food-item-fix-title">Fix Results</h3>
            <p className="food-item-fix-desc">Describe your correction (e.g. &quot;I ate 3 eggs&quot;, &quot;half portion&quot;)</p>
            <input
              type="text"
              className="food-item-fix-input"
              placeholder="e.g. I ate 3 eggs"
              value={fixInput}
              onChange={(e) => setFixInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFixSubmit()}
              autoFocus
              disabled={isFixing}
            />
            {fixError && <p className="food-item-fix-error">{fixError}</p>}
            <div className="food-item-fix-actions">
              <button type="button" className="food-item-fix-cancel" onClick={handleCloseFixModal} disabled={isFixing}>
                Cancel
              </button>
              <button type="button" className="food-item-fix-submit" onClick={handleFixSubmit} disabled={!fixInput.trim() || isFixing}>
                {isFixing ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
