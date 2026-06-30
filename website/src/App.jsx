import Header from './components/Header';
import Hero from './components/Hero';
import Features from './components/Features';
import Roles from './components/Roles';
import Cta from './components/Cta';
import Footer from './components/Footer';

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <Roles />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
