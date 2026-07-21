import './Navbar.css';

export default function Navbar({ onGetStarted }) {
  return (
    <header className="nav">
      <div className="container nav__inner">
        <a className="nav__brand" href="#top">
          Bank<span className="nav__brand-accent">Benchmark</span>
          <span className="nav__tld">.sg</span>
        </a>
        <nav className="nav__links">
          <a href="#how">How it works</a>
          <a href="#products">Products</a>
          <a href="#savings">Real savings</a>
          <a href="#partners">Partners</a>
        </nav>
        <button className="btn btn--primary nav__cta" onClick={onGetStarted}>
          Get My Free Benchmark
        </button>
      </div>
    </header>
  );
}
