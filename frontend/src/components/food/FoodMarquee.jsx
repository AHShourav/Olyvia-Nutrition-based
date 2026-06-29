import './FoodMarquee.css'

const FOOD_IMAGES = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1481070555726-e2fe8357725c?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1494597564530-871f2b93ac55?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=80&h=80&fit=crop',
]

export function FoodMarquee() {
  const row1 = [...FOOD_IMAGES, ...FOOD_IMAGES]
  const row2 = [...FOOD_IMAGES, ...FOOD_IMAGES]

  return (
    <div className="food-marquee">
      <div className="food-marquee-row food-marquee-row-left">
        <div className="food-marquee-track">
          {row1.map((src, i) => (
            <div key={`1-${i}`} className="food-marquee-item">
              <img src={src} alt="" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
      <div className="food-marquee-row food-marquee-row-right">
        <div className="food-marquee-track">
          {row2.map((src, i) => (
            <div key={`2-${i}`} className="food-marquee-item">
              <img src={src} alt="" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
