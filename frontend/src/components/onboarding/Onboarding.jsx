import { useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { updateProfile } from '../../services/api'
import './Onboarding.css'

const TOTAL_STEPS = 17

const GOAL_PRIMARY_OPTIONS = [
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'improve_energy', label: 'Improve energy' },
  { value: 'reduce_sugar', label: 'Reduce sugar' },
  { value: 'reduce_sodium', label: 'Reduce sodium' },
  { value: 'eat_cleaner', label: 'Eat cleaner' },
  { value: 'just_curious', label: 'Just curious' },
]

const GOAL_COMMITMENT_OPTIONS = [
  { value: 'exploring', label: 'Just exploring' },
  { value: 'somewhat', label: 'Somewhat committed' },
  { value: 'fully', label: 'Fully committed' },
  { value: 'fast', label: 'I need results fast' },
]

const DIET_PREFERENCE_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'low_carb', label: 'Low carb' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'none', label: 'None' },
]

const NUTRITION_TYPES = [
  { value: 'sugar', label: 'Sugar' },
  { value: 'sodium', label: 'Sodium' },
  { value: 'saturated_fat', label: 'Saturated fat' },
  { value: 'ultra_processed', label: 'Ultra-processed ingredients' },
  { value: 'artificial_additives', label: 'Artificial additives' },
]

const STRICTNESS_OPTIONS = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'strict', label: 'Strict' },
  { value: 'very_strict', label: 'Very strict' },
]

const HEALTH_CONDITIONS = [
  { value: 'hypertension', label: 'High blood pressure' },
  { value: 'diabetes', label: 'Diabetes / prediabetes' },
  { value: 'high_cholesterol', label: 'High cholesterol' },
  { value: 'kidney', label: 'Kidney issues' },
  { value: 'heart', label: 'Heart condition' },
  { value: 'digestive', label: 'Digestive issues (IBS, sensitivity)' },
  { value: 'food_allergies', label: 'Food allergies' },
  { value: 'none', label: 'None' },
]

const CONDITION_STRICTNESS = {
  hypertension: {
    title: "We'll monitor sodium closely.",
    body: 'High sodium intake increases cardiovascular risk.',
    strictnessKey: 'sodium_strictness',
  },
  diabetes: {
    title: "We'll watch sugar for you.",
    body: 'Managing blood sugar helps reduce long-term risk.',
    strictnessKey: 'sugar_strictness',
  },
  high_cholesterol: {
    title: "We'll limit saturated fat.",
    body: 'Saturated fat can raise cholesterol levels.',
    strictnessKey: 'saturated_fat_strictness',
  },
  kidney: {
    title: "We'll monitor sodium and potassium.",
    body: 'Kidney health requires careful mineral balance.',
    strictnessKey: 'sodium_strictness',
  },
  heart: {
    title: "We'll watch sodium and saturated fat.",
    body: 'Heart health benefits from lower sodium and saturated fat.',
    strictnessKey: 'sodium_strictness',
    alsoSets: 'saturated_fat_strictness',
  },
  digestive: {
    title: "We'll flag highly processed foods.",
    body: 'Ultra-processed ingredients can trigger symptoms.',
    strictnessKey: 'ultra_processed_strictness',
  },
  food_allergies: {
    title: 'We\'ll help you avoid allergens.',
    body: 'Add your allergens in Settings for personalized alerts.',
    strictnessKey: null,
  },
}

export function Onboarding({ onComplete }) {
  const { refreshProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState({
    goal_primary: '',
    goal_commitment: '',
    health_conditions: [],
    condition_rules: [],
    age: '',
    gender: '',
    height_cm: '',
    weight_kg: '',
    diet_preferences: [],
    nutrition_rules: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cameraDenied, setCameraDenied] = useState(false)

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const saveToBackend = useCallback(async (data) => {
    try {
      const payload = {}
      if (data.goal_primary != null) payload.goal_primary = data.goal_primary
      if (data.goal_commitment != null) payload.goal_commitment = data.goal_commitment
      if (data.age != null) payload.age = data.age ? parseInt(data.age, 10) : null
      if (data.gender != null) payload.gender = data.gender
      if (data.height_cm != null) payload.height_cm = data.height_cm ? parseFloat(data.height_cm) : null
      if (data.weight_kg != null) payload.weight_kg = data.weight_kg ? parseFloat(data.weight_kg) : null
      if (data.diet_preferences != null) payload.diet_preferences = data.diet_preferences
      if (data.nutrition_rules != null) payload.nutrition_rules = data.nutrition_rules
      if (data.health_conditions != null) payload.health_conditions = data.health_conditions
      if (data.condition_rules != null) payload.condition_rules = data.condition_rules
      if (Object.keys(payload).length > 0) {
        await updateProfile(payload)
      }
    } catch (e) {
      console.warn('Onboarding save failed:', e)
    }
  }, [])

  const toggleDiet = (value) => {
    const next = profile.diet_preferences.includes(value)
      ? profile.diet_preferences.filter((v) => v !== value)
      : value === 'none'
        ? ['none']
        : [...profile.diet_preferences.filter((v) => v !== 'none'), value]
    setProfile({ ...profile, diet_preferences: next })
  }

  const setNutritionRule = (type, strictness) => {
    const rules = profile.nutrition_rules.filter((r) => r.type !== type)
    if (strictness) rules.push({ type, strictness })
    setProfile({ ...profile, nutrition_rules: rules })
  }

  const getStrictness = (type) => profile.nutrition_rules.find((r) => r.type === type)?.strictness || ''

  const toggleHealthCondition = (value) => {
    const next = profile.health_conditions.includes(value)
      ? profile.health_conditions.filter((v) => v !== value)
      : value === 'none'
        ? ['none']
        : [...profile.health_conditions.filter((v) => v !== 'none'), value]
    const nextRules = value === 'none' ? [] : profile.condition_rules.filter((r) => next.includes(r.condition))
    setProfile({ ...profile, health_conditions: next, condition_rules: nextRules })
  }

  const setConditionStrictness = (condition, strictness) => {
    const cfg = CONDITION_STRICTNESS[condition]
    if (!cfg?.strictnessKey) return
    const rules = profile.condition_rules.filter((r) => r.condition !== condition)
    const rule = { condition }
    rule[cfg.strictnessKey] = strictness
    if (cfg.alsoSets) rule[cfg.alsoSets] = strictness
    rules.push(rule)
    setProfile({ ...profile, condition_rules: rules })
  }

  const getConditionStrictness = (condition) => {
    const r = profile.condition_rules.find((x) => x.condition === condition)
    const cfg = CONDITION_STRICTNESS[condition]
    const key = cfg?.strictnessKey
    return key && r ? r[key] || '' : ''
  }

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((t) => t.stop())
      setCameraDenied(false)
      next()
    } catch {
      setCameraDenied(true)
    }
  }

  const finish = async () => {
    setError('')
    setLoading(true)
    try {
      const payload = {
        goal_primary: profile.goal_primary || '',
        goal_commitment: profile.goal_commitment || '',
        age: profile.age ? parseInt(profile.age, 10) : null,
        gender: profile.gender || '',
        height_cm: profile.height_cm ? parseFloat(profile.height_cm) : null,
        weight_kg: profile.weight_kg ? parseFloat(profile.weight_kg) : null,
        diet_preferences: profile.diet_preferences || [],
        nutrition_rules: profile.nutrition_rules || [],
        health_conditions: profile.health_conditions || [],
        condition_rules: profile.condition_rules || [],
        onboarding_completed: true,
      }
      await updateProfile(payload)
      await refreshProfile()
      onComplete?.()
    } catch (err) {
      setError(err.message || 'Failed to save.')
    } finally {
      setLoading(false)
    }
  }

  const progress = ((step + 1) / TOTAL_STEPS) * 100

  const renderScreen = () => {
    switch (step) {
      case 0:
        return (
          <>
            <h2 className="onboarding-heading">Your food should work for you.</h2>
            <p className="onboarding-text">
              Scan any product. Get an instant verdict based on your body and your goals.
            </p>
            <button type="button" className="onboarding-btn" onClick={next}>Continue</button>
          </>
        )
      case 1:
        return (
          <>
            <h2 className="onboarding-heading">Most people think they eat &quot;healthy.&quot;</h2>
            <ul className="onboarding-list">
              <li>Labels are confusing</li>
              <li>&quot;Low fat&quot; doesn&apos;t mean low sugar</li>
              <li>&quot;High protein&quot; can hide high sodium</li>
              <li>Marketing ≠ nutrition</li>
            </ul>
            <button type="button" className="onboarding-btn" onClick={next}>That&apos;s true →</button>
          </>
        )
      case 2:
        return (
          <>
            <h2 className="onboarding-heading">Nutrition Fact</h2>
            <p className="onboarding-text">
              Over 60% of packaged &quot;healthy&quot; foods contain added sugars above recommended levels.
              <br /><br />
              Small daily mistakes = big long-term impact.
            </p>
            <button type="button" className="onboarding-btn" onClick={next}>Show me how it works →</button>
          </>
        )
      case 3:
        return (
          <>
            <h2 className="onboarding-heading">What&apos;s your main goal?</h2>
            <div className="onboarding-options">
              {GOAL_PRIMARY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`onboarding-option ${profile.goal_primary === o.value ? 'selected' : ''}`}
                  onClick={() => {
                    const nextProfile = { ...profile, goal_primary: o.value }
                    setProfile(nextProfile)
                    saveToBackend(nextProfile)
                    next()
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )
      case 4:
        return (
          <>
            <h2 className="onboarding-heading">How serious are you about this?</h2>
            <div className="onboarding-options">
              {GOAL_COMMITMENT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`onboarding-option ${profile.goal_commitment === o.value ? 'selected' : ''}`}
                  onClick={() => {
                    setProfile({ ...profile, goal_commitment: o.value })
                    saveToBackend({ ...profile, goal_commitment: o.value })
                    next()
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
          </>
        )
      case 5:
        return (
          <>
            <h2 className="onboarding-heading">Anything we should protect you from?</h2>
            <p className="onboarding-subtitle">We use this to personalize your food analysis</p>
            <div className="onboarding-options onboarding-options-multi">
              {HEALTH_CONDITIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`onboarding-option ${profile.health_conditions.includes(o.value) ? 'selected' : ''}`}
                  onClick={() => toggleHealthCondition(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
              <button
                type="button"
                className="onboarding-btn"
                onClick={() => {
                  saveToBackend({ health_conditions: profile.health_conditions })
                  next()
                }}
              >
                Continue
              </button>
            </div>
          </>
        )
      case 6: {
        const conditionsToConfigure = profile.health_conditions.filter((c) => c !== 'none' && CONDITION_STRICTNESS[c]?.strictnessKey)
        if (conditionsToConfigure.length === 0) {
          return (
            <>
              <h2 className="onboarding-heading">All set.</h2>
              <p className="onboarding-text">No additional limits to configure.</p>
              <button type="button" className="onboarding-btn" onClick={next}>Continue</button>
            </>
          )
        }
        return (
          <>
            <h2 className="onboarding-heading">Set your limits</h2>
            <p className="onboarding-subtitle">How strict should we be for each?</p>
            <div className="onboarding-condition-strictness">
              {conditionsToConfigure.map((cond) => {
                const cfg = CONDITION_STRICTNESS[cond]
                return (
                  <div key={cond} className="onboarding-rule-row">
                    <div>
                      <span className="onboarding-rule-label">{cfg.title}</span>
                      <p className="onboarding-rule-desc">{cfg.body}</p>
                    </div>
                    <select
                      value={getConditionStrictness(cond)}
                      onChange={(e) => setConditionStrictness(cond, e.target.value || null)}
                      className="onboarding-select"
                    >
                      <option value="">Select</option>
                      <option value="moderate">Moderate</option>
                      <option value="strict">Strict</option>
                      <option value="very_strict">Very strict</option>
                    </select>
                  </div>
                )
              })}
            </div>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
              <button
                type="button"
                className="onboarding-btn"
                onClick={() => {
                  saveToBackend({ condition_rules: profile.condition_rules })
                  next()
                }}
              >
                Continue
              </button>
            </div>
          </>
        )
      }
      case 7:
        return (
          <>
            <h2 className="onboarding-heading">Your data stays private.</h2>
            <p className="onboarding-text">
              Health information is stored securely and used only to personalize your food analysis.
            </p>
            <button type="button" className="onboarding-btn" onClick={next}>Continue</button>
          </>
        )
      case 8:
        return (
          <>
            <h2 className="onboarding-heading">Consistency wins.</h2>
            <p className="onboarding-text">
              People who track food awareness for 30 days are 3× more likely to improve body composition.
              <br /><br />
              Small decisions compound.
            </p>
            <button type="button" className="onboarding-btn" onClick={next}>Let&apos;s personalize →</button>
          </>
        )
      case 9:
        return (
          <>
            <h2 className="onboarding-heading">Tell us about you</h2>
            <div className="onboarding-form">
              <input
                type="number"
                placeholder="Age"
                value={profile.age}
                onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                className="onboarding-input"
                min={1}
                max={120}
              />
              <input
                type="text"
                placeholder="Gender (optional)"
                value={profile.gender}
                onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                className="onboarding-input"
              />
              <input
                type="number"
                placeholder="Height (cm)"
                value={profile.height_cm}
                onChange={(e) => setProfile({ ...profile, height_cm: e.target.value })}
                className="onboarding-input"
                min={50}
                max={250}
                step={0.1}
              />
              <input
                type="number"
                placeholder="Weight (kg)"
                value={profile.weight_kg}
                onChange={(e) => setProfile({ ...profile, weight_kg: e.target.value })}
                className="onboarding-input"
                min={20}
                max={300}
                step={0.1}
              />
            </div>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
              <button
                type="button"
                className="onboarding-btn"
                onClick={() => {
                  saveToBackend(profile)
                  next()
                }}
                disabled={!profile.age || !profile.height_cm || !profile.weight_kg}
              >
                Continue
              </button>
            </div>
          </>
        )
      case 10:
        return (
          <>
            <h2 className="onboarding-heading">Any dietary preferences?</h2>
            <p className="onboarding-subtitle">Multi-select</p>
            <div className="onboarding-options onboarding-options-multi">
              {DIET_PREFERENCE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`onboarding-option ${profile.diet_preferences.includes(o.value) ? 'selected' : ''}`}
                  onClick={() => toggleDiet(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
              <button
                type="button"
                className="onboarding-btn"
                onClick={() => {
                  saveToBackend({ diet_preferences: profile.diet_preferences })
                  next()
                }}
              >
                Continue
              </button>
            </div>
          </>
        )
      case 11:
        return (
          <>
            <h2 className="onboarding-heading">Hidden Calories Add Up</h2>
            <p className="onboarding-text">
              An extra 200 calories per day can lead to 20+ lbs gained in a year.
              <br /><br />
              Awareness prevents drift.
            </p>
            <button type="button" className="onboarding-btn" onClick={next}>Set your limits →</button>
          </>
        )
      case 12:
        return (
          <>
            <h2 className="onboarding-heading">What should we watch closely?</h2>
            <p className="onboarding-subtitle">Select items and set strictness</p>
            <div className="onboarding-nutrition-rules">
              {NUTRITION_TYPES.map((t) => (
                <div key={t.value} className="onboarding-rule-row">
                  <span className="onboarding-rule-label">{t.label}</span>
                  <select
                    value={getStrictness(t.value)}
                    onChange={(e) => setNutritionRule(t.value, e.target.value || null)}
                    className="onboarding-select"
                  >
                    <option value="">Skip</option>
                    {STRICTNESS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
              <button
                type="button"
                className="onboarding-btn"
                onClick={() => {
                  saveToBackend({ nutrition_rules: profile.nutrition_rules })
                  next()
                }}
              >
                Continue
              </button>
            </div>
          </>
        )
      case 13:
        return (
          <>
            <h2 className="onboarding-heading">How this works</h2>
            <ul className="onboarding-list">
              <li>You scan a product.</li>
              <li>We retrieve real nutritional data.</li>
              <li>Your personal rule engine evaluates it.</li>
              <li>You get a verdict: Good · Caution · Avoid</li>
              <li>No guesswork. No marketing bias.</li>
            </ul>
            <button type="button" className="onboarding-btn" onClick={next}>Sounds good →</button>
          </>
        )
      case 14:
        return (
          <>
            <h2 className="onboarding-heading">Smart Scanning Works</h2>
            <p className="onboarding-text">
              Users who avoid high-sugar packaged foods reduce average daily sugar intake by up to 35%.
              <br /><br />
              Your environment shapes your results.
            </p>
            <button type="button" className="onboarding-btn" onClick={next}>Enable camera →</button>
          </>
        )
      case 15:
        return (
          <>
            <h2 className="onboarding-heading">We need camera access</h2>
            <p className="onboarding-text">
              To scan barcodes instantly and analyze products in real time.
            </p>
            {cameraDenied && (
              <p className="onboarding-error">Camera access was denied. You can enable it in browser settings.</p>
            )}
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
              <button type="button" className="onboarding-btn" onClick={requestCamera}>
                Allow Camera
              </button>
              {cameraDenied && (
                <button type="button" className="onboarding-btn-secondary" onClick={next}>
                  Continue anyway
                </button>
              )}
            </div>
          </>
        )
      case 16:
        return (
          <>
            <h2 className="onboarding-heading">One small habit. Big results.</h2>
            <p className="onboarding-text">
              Every scan is a better decision.
              <br /><br />
              You&apos;re about to see food differently.
            </p>
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn-secondary" onClick={back}>Back</button>
              <button type="button" className="onboarding-btn" onClick={finish} disabled={loading}>
                {loading ? 'Saving…' : 'Start scanning →'}
              </button>
            </div>
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-progress">
        <div className="onboarding-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="onboarding-box">
        {renderScreen()}
      </div>
    </div>
  )
}
