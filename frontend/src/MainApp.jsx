import { useState, useCallback, useRef, useEffect } from 'react'
import { Mic, Camera, Barcode, Search, LogOut, User } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { useAuth } from './context/AuthContext'
import { analyzeVoiceText, scanBarcode, analyzeImage, fetchNutritionSummary } from './services/api'
import { BottomNav } from './components/BottomNav'
import { FoodHistory } from './components/food/FoodHistory'
import { toLocalDateString } from './components/food/CalendarSection'
import { FoodItemPage } from './components/food/FoodItemPage'
import { LoadingScreen } from './components/food/LoadingScreen'
import { FoodMarquee } from './components/food/FoodMarquee'
import { StatsPage } from './components/stats/StatsPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { AIPage } from './components/ai/AIPage'
import './App.css'

const TAB_MENU = 'menu'
const TAB_STATS = 'stats'
const TAB_PROFILE = 'profile'
const TAB_AI = 'ai'

const SILENCE_DELAY_MS = 5000

const MODES = {
  mic: 'mic',
  camera: 'camera',
  barcode: 'barcode',
  manual: 'manual',
}

const NUTRITION_ITEMS = [
  { key: 'fats', label: 'Fats', value: 0, unit: 'g' },
  { key: 'sodium', label: 'Sodium', value: 0, unit: 'mg' },
  { key: 'sugars', label: 'Sugars', value: 0, unit: 'g' },
  { key: 'carbs', label: 'Carbs', value: 0, unit: 'g' },
]

function productToItem(product) {
  if (!product) return null
  return {
    name: product.name,
    food_name: product.name,
    image_url: product.image_url,
    verdict: product.verdict,
    verdict_label: product.verdict_label,
    verdict_reason: product.verdict_reason,
    food_log_id: product.food_log_id,
    nutrients: {
      energy_kcal: product.energy_kcal,
      proteins: product.proteins,
      carbs: product.carbs,
      fat: product.fat,
      sugars: product.sugars,
      sodium_mg: product.sodium_mg,
    },
    energy_kcal: product.energy_kcal,
    proteins: product.proteins,
    carbs: product.carbs,
    fat: product.fat,
    sugars: product.sugars,
    sodium_mg: product.sodium_mg,
  }
}

function summaryToItems(summary) {
  if (!summary) return NUTRITION_ITEMS.map((i) => ({ ...i }))
  return [
    { key: 'fats', label: 'Fats', value: Math.round(summary.fats || 0), unit: 'g' },
    { key: 'sodium', label: 'Sodium', value: Math.round(summary.sodium || 0), unit: 'mg' },
    { key: 'sugars', label: 'Sugars', value: Math.round(summary.sugars || 0), unit: 'g' },
    { key: 'carbs', label: 'Carbs', value: Math.round(summary.carbs || 0), unit: 'g' },
  ]
}

const SCANNER_DIV_ID = 'barcode-scanner'

export default function MainApp() {
  const { logout, isAuthenticated, avatarUrl } = useAuth()
  const [foodHistoryKey, setFoodHistoryKey] = useState(0)
  const [activeTab, setActiveTab] = useState(TAB_MENU)
  const [mode, setMode] = useState(MODES.mic)
  const [isExpanded, setIsExpanded] = useState(false)
  const [nutrition, setNutrition] = useState(NUTRITION_ITEMS)
  const [manualInput, setManualInput] = useState('')
  const [cameraStream, setCameraStream] = useState(null)
  const [capturedImage, setCapturedImage] = useState(null)
  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  const [isSending, setIsSending] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [barcodeError, setBarcodeError] = useState('')
  const [imageError, setImageError] = useState('')
  const [lastVerdict, setLastVerdict] = useState(null)
  const [currentItem, setCurrentItem] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateString(new Date()))
  const silenceTimerRef = useRef(null)
  const lastTranscriptRef = useRef('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const scannerRef = useRef(null)
  const cameraStreamRef = useRef(null)

  const refetchNutrition = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const summary = await fetchNutritionSummary(selectedDate)
      setNutrition(summaryToItems(summary))
    } catch {}
  }, [isAuthenticated, selectedDate])

  const stopAllMedia = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
    }
    setCameraStream(null)
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
      setIsBarcodeScanning(false)
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort?.() } catch (_) {}
      try { recognitionRef.current.stop?.() } catch (_) {}
      setIsListening(false)
    }
  }, [])

  const handleCloseExpand = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    stopAllMedia()
    setIsExpanded(false)
    setManualInput('')
    setCapturedImage(null)
    setVoiceError('')
    setBarcodeError('')
    setImageError('')
  }, [stopAllMedia])

  const sendTranscriptToBackend = useCallback(async (text) => {
    if (!text || text.trim().length === 0) return
    setIsSending(true)
    setVoiceError('')
    try {
      const { nutrition } = await analyzeVoiceText(text.trim())
      if (nutrition && nutrition.length > 0) {
        const first = nutrition[0]
        setLastVerdict({
          verdict: first.verdict,
          verdict_label: first.verdict_label,
          verdict_reason: first.verdict_reason,
          food_name: first.name || first.query || 'Food',
        })
        setCurrentItem(first)
        await refetchNutrition()
        setFoodHistoryKey((k) => k + 1)
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
        handleCloseExpand()
      } else {
        setVoiceError('Could not find nutrition for this food. Try a different description.')
      }
    } catch (err) {
      setVoiceError(err.message || 'Failed to analyze')
    } finally {
      setIsSending(false)
    }
  }, [refetchNutrition, handleCloseExpand])

  const handleBarcodeScanned = useCallback(async (barcode) => {
    if (!barcode || !barcode.trim()) return
    setBarcodeError('')
    setIsSending(true)
    try {
      const product = await scanBarcode(barcode.trim())
      if (product && (product.fat != null || product.salt != null || product.sugars != null || product.carbs != null)) {
        setLastVerdict({
          verdict: product.verdict,
          verdict_label: product.verdict_label,
          verdict_reason: product.verdict_reason,
          food_name: product.name || 'Product',
        })
        setCurrentItem(productToItem(product))
        await refetchNutrition()
        setFoodHistoryKey((k) => k + 1)
        handleCloseExpand()
      } else {
        setBarcodeError('Product found but no nutrition data available.')
      }
    } catch (err) {
      setBarcodeError(err.message || 'Product not found. Try another barcode.')
    } finally {
      setIsSending(false)
    }
  }, [refetchNutrition, handleCloseExpand])

  const sendRef = useRef(sendTranscriptToBackend)
  sendRef.current = sendTranscriptToBackend

  useEffect(() => {
    if (isAuthenticated) refetchNutrition()
  }, [isAuthenticated, refetchNutrition])

  useEffect(() => {
    if (isExpanded && activeTab !== TAB_MENU) {
      handleCloseExpand()
    }
  }, [activeTab, isExpanded, handleCloseExpand])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ')
        .trim()
        .replace(/\s+/g, ' ')
      if (transcript) {
        lastTranscriptRef.current = transcript
        setManualInput(transcript)
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
          try { rec.stop() } catch (_) {}
          setIsListening(false)
          const text = lastTranscriptRef.current
          if (text) sendRef.current?.(text)
        }, SILENCE_DELAY_MS)
      }
    }
    rec.onend = () => {}
    recognitionRef.current = rec
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      rec.abort?.()
    }
  }, [])

  const handleExpand = useCallback((overrideMode) => {
    if (isExpanded) return
    const m = overrideMode ?? mode
    setIsExpanded(true)

    if (m === MODES.mic) {
      lastTranscriptRef.current = ''
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(() => {
          const rec = recognitionRef.current
          if (rec) {
            rec.start()
            setIsListening(true)
          }
        })
        .catch(console.error)
    } else if (m === MODES.camera) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => {
          cameraStreamRef.current = stream
          setCameraStream(stream)
        })
        .catch(console.error)
    }
  }, [isExpanded, mode])

  const handleModeClick = useCallback((m) => {
    setMode(m)
    if (!isExpanded) {
      setTimeout(() => handleExpand(m), 0)
    }
  }, [isExpanded, handleExpand])

  useEffect(() => {
    if (!isExpanded || mode !== MODES.barcode) return
    const el = document.getElementById(SCANNER_DIV_ID)
    if (!el) return
    const html5QrCode = new Html5Qrcode(SCANNER_DIV_ID)
    const config = { fps: 15, aspectRatio: 1.333334 }
    html5QrCode
      .start({ facingMode: 'environment' }, config, (decodedText) => {
        if (!decodedText) return
        const barcode = decodedText.trim()
        html5QrCode
          .stop()
          .then(() => {
            scannerRef.current = null
            setIsBarcodeScanning(false)
            handleBarcodeScanned(barcode)
          })
          .catch(() => {
            scannerRef.current = null
            setIsBarcodeScanning(false)
            handleBarcodeScanned(barcode)
          })
      }, () => {})
      .then(() => {
        scannerRef.current = html5QrCode
        setIsBarcodeScanning(true)
      })
      .catch((err) => {
        console.error('Scanner start error', err)
        setBarcodeError('Could not start camera. Check permissions.')
      })
    return () => {
      scannerRef.current?.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [isExpanded, mode, handleBarcodeScanned])

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream
    }
  }, [cameraStream])

  useEffect(() => {
    if (!isExpanded) stopAllMedia()
  }, [isExpanded, stopAllMedia])

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop())
        cameraStreamRef.current = null
      }
      scannerRef.current?.stop().catch(() => {})
      try { recognitionRef.current?.abort?.() } catch (_) {}
      try { recognitionRef.current?.stop?.() } catch (_) {}
    }
  }, [])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9)
    setCapturedImage(dataUrl)
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
    }
    setCameraStream(null)
  }, [])

  const handleAnalyzeImage = useCallback(async () => {
    if (!capturedImage || !capturedImage.startsWith('data:image/')) return
    setImageError('')
    setIsSending(true)
    try {
      const blob = await (await fetch(capturedImage)).blob()
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
      const { nutrition } = await analyzeImage(file)
      if (nutrition && nutrition.length > 0) {
        const first = nutrition[0]
        setLastVerdict({
          verdict: first.verdict,
          verdict_label: first.verdict_label,
          verdict_reason: first.verdict_reason,
          food_name: first.name || first.query || 'Food',
        })
        setCurrentItem(first)
        await refetchNutrition()
        setFoodHistoryKey((k) => k + 1)
        handleCloseExpand()
      } else {
        setImageError('Could not identify food in this image. Try a clearer photo.')
      }
    } catch (err) {
      setImageError(err.message || 'Failed to analyze image')
    } finally {
      setIsSending(false)
    }
  }, [capturedImage, refetchNutrition, handleCloseExpand])

  const getSectionGradient = () => {
    switch (mode) {
      case MODES.mic:
        return 'linear-gradient(135deg, #669eff 0%, #a8c8ff 50%, #ffffff 100%)'
      case MODES.camera:
        return 'linear-gradient(135deg, #74fc7d 0%, #b8fdbc 50%, #ffffff 100%)'
      case MODES.barcode:
        return 'linear-gradient(135deg, #fccc47 0%, #fde88a 50%, #ffffff 100%)'
      case MODES.manual:
        return 'linear-gradient(135deg, #a0aec0 0%, #e2e8f0 50%, #ffffff 100%)'
      default:
        return 'linear-gradient(135deg, #669eff 0%, #ffffff 100%)'
    }
  }

  const renderContent = () => {
    if (activeTab === TAB_STATS) return <StatsPage />
    if (activeTab === TAB_PROFILE) return <SettingsPage />
    if (activeTab === TAB_AI) return <AIPage />

    if (currentItem) {
      return (
        <div className="main-content-wrap">
          <FoodItemPage
            item={currentItem}
            onBack={() => setCurrentItem(null)}
            onFixApplied={() => {
              setFoodHistoryKey((k) => k + 1)
              refetchNutrition()
            }}
          />
        </div>
      )
    }

    return (
      <>
        {!isExpanded && (
          <>
            <nav className="top-nav">
            <div className="top-nav-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="top-nav-avatar-img" />
              ) : (
                <User size={24} strokeWidth={2} className="top-nav-avatar-icon" />
              )}
            </div>
            <div className="top-nav-btns">
            <button
              className={`nav-btn ${mode === MODES.mic ? 'active' : ''}`}
              onClick={() => handleModeClick(MODES.mic)}
              aria-label="Microphone"
            >
              <Mic size={20} strokeWidth={2} />
            </button>
            <button
              className={`nav-btn ${mode === MODES.camera ? 'active' : ''}`}
              onClick={() => handleModeClick(MODES.camera)}
              aria-label="Camera"
            >
              <Camera size={20} strokeWidth={2} />
            </button>
            <button
              className={`nav-btn ${mode === MODES.barcode ? 'active' : ''}`}
              onClick={() => handleModeClick(MODES.barcode)}
              aria-label="Barcode"
            >
              <Barcode size={20} strokeWidth={2} />
            </button>
            <button
              className={`nav-btn ${mode === MODES.manual ? 'active' : ''}`}
              onClick={() => handleModeClick(MODES.manual)}
              aria-label="Manual search"
            >
              <Search size={20} strokeWidth={2} />
            </button>
            </div>
            <button className="nav-btn nav-btn-logout" onClick={logout} aria-label="Log out">
              <LogOut size={18} strokeWidth={2} />
            </button>
          </nav>

          <section className="dashboard">
            {lastVerdict && (
              <div className={`verdict-card verdict-${lastVerdict.verdict}`}>
                <div className="verdict-header">
                  <span className="verdict-badge">{lastVerdict.verdict_label}</span>
                  <span className="verdict-food">{lastVerdict.food_name}</span>
                  <button
                    type="button"
                    className="verdict-dismiss"
                    onClick={() => setLastVerdict(null)}
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
                {lastVerdict.verdict_reason && (
                  <p className="verdict-reason">{lastVerdict.verdict_reason}</p>
                )}
              </div>
            )}
            <div className="nutrition-circles">
              {nutrition.map((item) => (
                <div key={item.key} className="circle-wrap">
                  <div className="circle">{item.value}</div>
                  <span className="circle-label">{item.label}</span>
                </div>
              ))}
            </div>
          </section>
        </>
        )}

        <section
          className={`main-section ${isExpanded ? 'expanded' : ''} ${isExpanded && (mode === MODES.camera || mode === MODES.barcode) ? 'main-section-camera' : ''}`}
          style={isExpanded && mode !== MODES.camera && mode !== MODES.barcode ? { background: getSectionGradient() } : undefined}
        >
        {isExpanded && isSending && (
          <LoadingScreen />
        )}

        {isExpanded && !isSending && (
          <button
            className="close-btn"
            onClick={handleCloseExpand}
            aria-label="Close"
          >
            <span className="close-icon">✕</span>
          </button>
        )}

        {isExpanded && !isSending && mode === MODES.camera && !capturedImage && (
          <div className="camera-view">
            <video ref={videoRef} autoPlay playsInline muted />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <button className="capture-btn" onClick={capturePhoto}>
              Capture
            </button>
          </div>
        )}

        {isExpanded && !isSending && mode === MODES.barcode && !manualInput && (
          <div className="barcode-view">
            <div id={SCANNER_DIV_ID} className="barcode-scanner" />
            {barcodeError && <p className="voice-error">{barcodeError}</p>}
          </div>
        )}

        {isExpanded && !isSending && (mode === MODES.manual || mode === MODES.mic || (mode === MODES.barcode && manualInput)) && (
          <div className="manual-view">
            <FoodMarquee />
            <h2 className="manual-view-title">What Did You Eat Today?</h2>
            <div className="manual-search-wrap">
              <input
                type="text"
                className="manual-input"
                placeholder={
                  mode === MODES.mic
                    ? isSending
                      ? 'Analyzing…'
                      : 'Speak… (stops after 5s silence)'
                    : isSending
                      ? 'Searching…'
                      : 'Describe your food (e.g. chicken salad, pizza)'
                }
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && mode === MODES.manual && manualInput.trim()) {
                    sendTranscriptToBackend(manualInput.trim())
                  }
                }}
                readOnly={mode === MODES.mic}
                disabled={mode === MODES.manual && isSending}
                autoFocus
              />
              {mode === MODES.manual && (
                <button
                  type="button"
                  className="manual-search-btn"
                  onClick={() => manualInput.trim() && sendTranscriptToBackend(manualInput.trim())}
                  disabled={!manualInput.trim() || isSending}
                  aria-label="Search"
                >
                  {isSending ? '…' : 'Search'}
                </button>
              )}
            </div>
            {voiceError && <p className="voice-error">{voiceError}</p>}
          </div>
        )}

        {isExpanded && !isSending && capturedImage && (
          <div className="captured-view">
            <img src={capturedImage} alt="Captured" />
            <div className="captured-actions">
              <button className="capture-btn" onClick={handleAnalyzeImage} disabled={isSending}>
                {isSending ? 'Analyzing…' : 'Analyze'}
              </button>
              <button className="capture-btn capture-btn-secondary" onClick={handleCloseExpand}>
                Done
              </button>
            </div>
            {imageError && <p className="voice-error">{imageError}</p>}
          </div>
        )}

        {!isExpanded && (
          <FoodHistory
            isAuthenticated={isAuthenticated}
            refreshTrigger={foodHistoryKey}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onItemClick={(item) => setCurrentItem(item)}
          />
        )}
      </section>
    </>
    )
  }

  return (
    <div className="app">
      <div className="app-content">{renderContent()}</div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
