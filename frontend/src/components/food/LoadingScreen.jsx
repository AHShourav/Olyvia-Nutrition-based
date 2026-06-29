import { useState, useEffect } from 'react'
import './LoadingScreen.css'

const NUTRITION_FACTS = [
  'Dark chocolate (70% cocoa) contains more caffeine per ounce than coffee.',
  'Chickpeas have 21g protein per 100g; almonds have 28g—nearly matching steak.',
  'Raspberries, strawberries, and apples are all members of the rose family.',
  'Omega-3 fats make up 10–20% of the brain\'s total fat content.',
  'Bananas are berries; strawberries are not.',
  'Broccoli contains more protein per calorie than steak.',
  'Honey never spoils—archaeologists found 3,000-year-old honey still edible.',
  'Carrots were originally purple; orange carrots were bred in the 17th century.',
  'Lemons float, but limes sink.',
  'The average person eats about 35 tons of food in a lifetime.',
]

function randomFact() {
  return NUTRITION_FACTS[Math.floor(Math.random() * NUTRITION_FACTS.length)]
}

export function LoadingScreen() {
  const [fact, setFact] = useState(() => randomFact())

  useEffect(() => {
    const id = setInterval(() => setFact(randomFact()), 4000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="loading-screen">
      <div className="loading-screen-content">
        <div className="loading-spinner" />
        <p className="loading-screen-text">Analyzing your food…</p>
        <p className="loading-screen-fact">{fact}</p>
      </div>
    </div>
  )
}
