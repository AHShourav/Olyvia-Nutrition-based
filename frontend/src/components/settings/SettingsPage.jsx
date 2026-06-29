import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { fetchMe, updateProfile, uploadProfilePicture } from '../../services/api'
import './SettingsPage.css'

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

const DIET_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'low_carb', label: 'Low carb' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'none', label: 'None' },
]

const STATS_NUTRIENTS = [
  { value: 'energy_kcal', label: 'Calories' },
  { value: 'proteins', label: 'Protein' },
  { value: 'sugars', label: 'Sugar' },
  { value: 'sodium', label: 'Sodium' },
  { value: 'fat', label: 'Fat' },
  { value: 'saturated_fat', label: 'Saturated fat' },
  { value: 'carbs', label: 'Carbs' },
  { value: 'fiber', label: 'Fiber' },
]

const HEALTH_CONDITIONS = [
  { value: 'hypertension', label: 'High blood pressure' },
  { value: 'diabetes', label: 'Diabetes / prediabetes' },
  { value: 'high_cholesterol', label: 'High cholesterol' },
  { value: 'kidney', label: 'Kidney issues' },
  { value: 'heart', label: 'Heart condition' },
  { value: 'digestive', label: 'Digestive issues (IBS)' },
  { value: 'food_allergies', label: 'Food allergies' },
  { value: 'none', label: 'None' },
]

/** Build condition_rules from health_conditions for rules engine (default: moderate). */
function buildConditionRules(healthConditions) {
  const conditions = (healthConditions || []).filter((c) => c && c !== 'none')
  const rules = []
  const defaultStrictness = 'moderate'
  for (const c of conditions) {
    if (c === 'hypertension') rules.push({ condition: c, sodium_strictness: defaultStrictness })
    else if (c === 'diabetes') rules.push({ condition: c, sugar_strictness: defaultStrictness })
    else if (c === 'high_cholesterol') rules.push({ condition: c, saturated_fat_strictness: defaultStrictness })
    else if (c === 'kidney') rules.push({ condition: c, sodium_strictness: defaultStrictness })
    else if (c === 'heart') rules.push({ condition: c, sodium_strictness: defaultStrictness, saturated_fat_strictness: defaultStrictness })
    else if (c === 'digestive') rules.push({ condition: c, ultra_processed_strictness: defaultStrictness })
    // food_allergies: stored but rules engine has no nutrient mapping yet
  }
  return rules
}

export function SettingsPage() {
  const { user, profile, avatarUrl, refreshProfile } = useAuth()
  const fileInputRef = useRef(null)
  const [form, setForm] = useState({
    full_name: '',
    age: '',
    gender: '',
    height_cm: '',
    weight_kg: '',
    goal_primary: '',
    goal_commitment: '',
    diet_preferences: [],
    health_conditions: [],
    stats_tracked_nutrients: [],
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const handleAvatarClick = () => fileInputRef.current?.click()
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    e.target.value = ''
    setUploadingAvatar(true)
    try {
      await uploadProfilePicture(file)
      await refreshProfile()
    } catch (err) {
      setMessage(err.message || 'Upload failed.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const load = useCallback(async () => {
    try {
      const { user: u, profile: p } = await fetchMe()
      setForm({
        full_name: u?.full_name || '',
        age: p?.age ?? '',
        gender: p?.gender || '',
        height_cm: p?.height_cm ?? '',
        weight_kg: p?.weight_kg ?? '',
        goal_primary: p?.goal_primary || '',
        goal_commitment: p?.goal_commitment || '',
        diet_preferences: p?.diet_preferences || [],
        health_conditions: p?.health_conditions || [],
        stats_tracked_nutrients: p?.stats_tracked_nutrients || [],
      })
    } catch {}
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    setMessage('')
    setSaving(true)
    try {
      const payload = {
        full_name: form.full_name.trim(),
        age: form.age ? parseInt(form.age, 10) : null,
        gender: form.gender.trim(),
        height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        goal_primary: form.goal_primary || '',
        goal_commitment: form.goal_commitment || '',
        diet_preferences: form.diet_preferences,
        health_conditions: form.health_conditions,
        condition_rules: buildConditionRules(form.health_conditions),
        stats_tracked_nutrients: form.stats_tracked_nutrients?.length ? form.stats_tracked_nutrients : ['energy_kcal', 'proteins', 'sugars', 'sodium', 'fat'],
      }
      await updateProfile(payload)
      await refreshProfile()
      setMessage('Saved.')
    } catch (err) {
      setMessage(err.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatsNutrient = (value) => {
    const current = form.stats_tracked_nutrients || []
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    setForm({ ...form, stats_tracked_nutrients: next })
  }

  const toggleHealthCondition = (value) => {
    const next = form.health_conditions.includes(value)
      ? form.health_conditions.filter((v) => v !== value)
      : value === 'none'
        ? ['none']
        : [...form.health_conditions.filter((v) => v !== 'none'), value]
    setForm({ ...form, health_conditions: next })
  }

  const toggleDiet = (value) => {
    const next = form.diet_preferences.includes(value)
      ? form.diet_preferences.filter((v) => v !== value)
      : value === 'none'
        ? ['none']
        : [...form.diet_preferences.filter((v) => v !== 'none'), value]
    setForm({ ...form, diet_preferences: next })
  }

  return (
    <div className="settings-page">
      <h2 className="settings-title">Profile</h2>

      <section className="settings-section">
        <div className="profile-block profile-block-main">
          <button
            type="button"
            className="profile-avatar-wrap"
            onClick={handleAvatarClick}
            disabled={uploadingAvatar}
            aria-label="Add profile picture"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="profile-avatar-input"
              aria-hidden
            />
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="profile-avatar-img" />
            ) : (
              <Plus size={28} strokeWidth={2} className="profile-avatar-add" />
            )}
          </button>
          <div className="profile-fields">
            <div className="profile-field-row">
              <label className="settings-label">Name</label>
              <input
                type="text"
                className="settings-input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Your name"
              />
            </div>
            <div className="profile-field-row">
              <label className="settings-label">Email</label>
              <input
                type="email"
                className="settings-input settings-input-readonly"
                value={user?.email || ''}
                readOnly
              />
            </div>
          </div>
        </div>

        <div className="profile-block profile-block-details">
          <div className="profile-details-grid">
            <div className="profile-field-row">
              <label className="settings-label">Age</label>
              <input
                type="number"
                className="settings-input"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                placeholder="Age"
                min={1}
                max={120}
              />
            </div>
            <div className="profile-field-row">
              <label className="settings-label">Gender</label>
              <input
                type="text"
                className="settings-input"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                placeholder="Gender (optional)"
              />
            </div>
            <div className="profile-field-row">
              <label className="settings-label">Height (cm)</label>
              <input
                type="number"
                className="settings-input"
                value={form.height_cm}
                onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                placeholder="Height"
                min={50}
                max={250}
                step={0.1}
              />
            </div>
            <div className="profile-field-row">
              <label className="settings-label">Weight (kg)</label>
              <input
                type="number"
                className="settings-input"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                placeholder="Weight"
                min={20}
                max={300}
                step={0.1}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Goals</h3>
        <div className="settings-form">
          <label className="settings-label">Primary goal</label>
          <select
            className="settings-select"
            value={form.goal_primary}
            onChange={(e) => setForm({ ...form, goal_primary: e.target.value })}
          >
            <option value="">Select</option>
            {GOAL_PRIMARY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label className="settings-label">Commitment</label>
          <select
            className="settings-select"
            value={form.goal_commitment}
            onChange={(e) => setForm({ ...form, goal_commitment: e.target.value })}
          >
            <option value="">Select</option>
            {GOAL_COMMITMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Stats nutrients</h3>
        <p className="settings-desc">Nutrients shown in Today snapshot</p>
        <div className="settings-diet-chips">
          {STATS_NUTRIENTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`settings-chip ${(form.stats_tracked_nutrients || []).includes(o.value) ? 'selected' : ''}`}
              onClick={() => toggleStatsNutrient(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Health conditions</h3>
        <p className="settings-desc">Used to personalize food verdicts</p>
        <div className="settings-diet-chips">
          {HEALTH_CONDITIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`settings-chip ${form.health_conditions.includes(o.value) ? 'selected' : ''}`}
              onClick={() => toggleHealthCondition(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Diet preferences</h3>
        <div className="settings-diet-chips">
          {DIET_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`settings-chip ${form.diet_preferences.includes(o.value) ? 'selected' : ''}`}
              onClick={() => toggleDiet(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {message && <p className={`settings-message ${message === 'Saved.' ? 'success' : 'error'}`}>{message}</p>}
      <button type="button" className="settings-save-btn" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}
