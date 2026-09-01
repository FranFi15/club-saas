import Header from './components/Header';
import Hero from './components/Hero';
import Features from './components/Features';
import Roles from './components/Roles';
import RolesGuide from './components/RolesGuide';
import Pricing from './components/Pricing';
import Cta from './components/Cta';
import Footer from './components/Footer';
import FamilySignup from './pages/FamilySignup';

function isFamilySignupPath() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/$/, '') === '/alta-familia';
}

export default function App() {
  if (isFamilySignupPath()) {
    return <FamilySignup />;
  }

  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <Roles />
        <RolesGuide />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
