import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import './CalendarSection.css'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const SEVEN_WEEKS_MS = 7 * 7 * 24 * 60 * 60 * 1000

/** Format date as YYYY-MM-DD in local timezone (avoids UTC shift from toISOString). */
export function toLocalDateString(date) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse YYYY-MM-DD as local date (not UTC midnight). */
export function parseLocalDate(dateStr) {
  if (!dateStr) return new Date()
  const [y, m, d] = dateStr.split('-').map(Number)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date()
  return new Date(y, m - 1, d)
}

export function formatDateLabel(dateStrOrDate) {
  const d = typeof dateStrOrDate === 'string' ? parseLocalDate(dateStrOrDate) : (dateStrOrDate instanceof Date ? dateStrOrDate : new Date())
  const now = new Date()
  const diff = Math.abs(now - d)
  if (diff <= SEVEN_WEEKS_MS) {
    return d.toLocaleDateString('en-US', { weekday: 'long' })
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function CalendarSection({ selectedDate, onDateChange }) {
  const [showCalendar, setShowCalendar] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = selectedDate ? parseLocalDate(selectedDate) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const label = formatDateLabel(selectedDate)

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const days = []
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1))

  const isSelected = (d) => {
    if (!d || !selectedDate) return false
    const s = parseLocalDate(selectedDate)
    return d.getDate() === s.getDate() && d.getMonth() === s.getMonth() && d.getFullYear() === s.getFullYear()
  }

  const isToday = (d) => {
    if (!d) return false
    const t = new Date()
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
  }

  const handleDayClick = (d) => {
    if (!d) return
    onDateChange(toLocalDateString(d))
    setShowCalendar(false)
  }

  return (
    <section className="calendar-section">
      <button
        type="button"
        className="calendar-trigger"
        onClick={() => setShowCalendar(true)}
      >
        {label}
      </button>

      {showCalendar && (
        <div className="calendar-overlay" onClick={() => setShowCalendar(false)}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-header">
              <button type="button" className="calendar-nav" onClick={prevMonth} aria-label="Previous month">
                <ChevronLeft size={20} strokeWidth={2} />
              </button>
              <span className="calendar-month">{MONTHS[month]} {year}</span>
              <button type="button" className="calendar-nav" onClick={nextMonth} aria-label="Next month">
                <ChevronRight size={20} strokeWidth={2} />
              </button>
            </div>
            <div className="calendar-days-header">
              {DAYS.map((d) => (
                <span key={d} className="calendar-dow">{d}</span>
              ))}
            </div>
            <div className="calendar-days-grid">
              {days.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`calendar-day ${!d ? 'empty' : ''} ${isSelected(d) ? 'selected' : ''} ${isToday(d) ? 'today' : ''}`}
                  onClick={() => handleDayClick(d)}
                  disabled={!d}
                >
                  {d ? d.getDate() : ''}
                </button>
              ))}
            </div>
            <button type="button" className="calendar-close" onClick={() => setShowCalendar(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
