import './AIPage.css'

export function AIPage() {
  return (
    <div className="ai-page">
      <div className="ai-hero">
        <span className="ai-icon">✨</span>
        <h2 className="ai-title">AI Insights</h2>
        <p className="ai-subtitle">
          Coming soon: personalized recommendations based on your nutrition data and health goals.
        </p>
      </div>
      <div className="ai-placeholder">
        <p>Your AI coach will analyze:</p>
        <ul>
          <li>Eaten nutrients & daily patterns</li>
          <li>Your health conditions & goals</li>
          <li>Rules engine for smart verdicts</li>
        </ul>
        <p className="ai-cta">Stay tuned.</p>
      </div>
    </div>
  )
}
