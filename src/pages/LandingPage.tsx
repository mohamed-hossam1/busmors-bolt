import { useEffect } from 'react'
import BenefitsSection from '../components/landing/BenefitsSection'
import FaqSection from '../components/landing/FaqSection'
import HowItWorks from '../components/landing/HowItWorks'
import InteractiveDemo from '../components/landing/InteractiveDemo'
import LandingFooter from '../components/landing/LandingFooter'
import LandingHero from '../components/landing/LandingHero'
import LandingNav from '../components/landing/LandingNav'

export default function LandingPage() {
  useEffect(() => {
    document.title = 'BusMora — Turn business knowledge into marketing work'
  }, [])

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fbfdfb] text-ink-900 selection:bg-primary-200">
      <LandingNav />
      <main>
        <LandingHero />
        <InteractiveDemo />
        <HowItWorks />
        <BenefitsSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  )
}
