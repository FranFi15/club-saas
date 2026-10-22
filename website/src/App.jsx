import Header from './components/Header';
import Hero from './components/Hero';
import RolesGuide from './components/RolesGuide';
import Pricing from './components/Pricing';
import Cta from './components/Cta';
import Footer from './components/Footer';
import FamilySignup from './pages/FamilySignup';
import PublicEvents from './pages/PublicEvents';

function isFamilySignupPath() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/$/, '') === '/alta-familia';
}

function isPublicEventsPath() {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.replace(/\/$/, '');
  return p === '/eventos' || p === '/evento';
}

export default function App() {
  if (isFamilySignupPath()) {
    return <FamilySignup />;
  }
  if (isPublicEventsPath()) {
    return <PublicEvents />;
  }

  return (
    <>
      <Header />
      <main>
        <Hero />
        <RolesGuide />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
