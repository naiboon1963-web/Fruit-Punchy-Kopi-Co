import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AccountPage from './auth/AccountPage'
import AdminPage from './auth/AdminPage'
import RequireMember from './auth/RequireMember'
import { resolveRoute } from './auth/routes.js'

const directions = 'https://www.google.com/maps/search/?api=1&query=Bukit+Timah+Shopping+Centre+170+Upper+Bukit+Timah+Road+Singapore+588179'
const links = [['Our story', '/#about'], ['The menu', '/#menu'], ['Find us', '/#contact']]

function Icon({ name = 'arrow', className = '', ...props }) {
  const paths = {
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>,
    heart: <path d="m12 21-8-8C-3 6 6-2 12 5c6-7 15 1 8 8Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  }
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

function Cup({ className = '' }) {
  return <svg className={className} viewBox="0 0 76 78" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 34h39v14a19.5 19.5 0 0 1-39 0ZM55 37h5c11 0 11 17 0 17h-6M11 73h49M28 24c-8-9 8-9 0-18M42 24c-8-9 8-9 0-18" /><path d="M21 41h29" opacity=".45" /></svg>
}

function Brand({ footer = false, onClick }) {
  return (
    <a href={window.location.search.includes('account=') || window.location.pathname !== '/' ? '/' : '#top'} className={`brand ${footer ? 'brand-footer' : ''}`} aria-label="Fruit Punchy Kopi and Art — back to top" onClick={onClick}>
      <img className="brand-mascots" src="/images/fruit-punchy-logo.webp" alt="" width="818" height="392" />
      <span>Fruit Punchy<span className="brand-second">KOPI AND ART</span></span>
    </a>
  )
}

function Header() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const toggle = useRef(null)
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() }
    }
    const closeOnDesktop = () => { if (window.innerWidth > 700) setOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnDesktop)
    return () => { document.removeEventListener('keydown', closeOnEscape); window.removeEventListener('resize', closeOnDesktop) }
  }, [open])
  return <header className="site-header"><div className="shell header-inner"><Brand onClick={() => setOpen(false)} /><button ref={toggle} className={`menu-toggle ${open ? 'is-open' : ''}`} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}><span /><span /></button><nav id="main-navigation" aria-label="Main navigation" className={open ? 'nav-open' : ''}>{links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}<a href={user ? '/members' : '/?account=signin'} onClick={() => setOpen(false)}>{user ? 'My account' : 'Member login'}</a><a href="/?account=staff" onClick={() => setOpen(false)}>Staff login</a><a className="nav-visit" href={directions} target="_blank" rel="noopener noreferrer">Come on over <Icon name="arrow" /></a></nav></div></header>
}

function Hero() {
  return (
    <>
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero shell">
          <div className="hero-copy">
            <p className="eyebrow"><span className="tiny-flower" aria-hidden="true">✳</span> A HAPPY LITTLE NEIGHBOURHOOD HANGOUT</p>
            <h1 id="hero-title">A little kopi.<br /><em>A lot of colour.</em></h1>
            <p className="hero-description">Familiar flavours. Curious little moments. Good company.<br className="desktop-break" /> Welcome to Fruit Punchy Kopi and Art —<br className="desktop-break" /> a cosy corner with a playful heart.</p>
            <div className="hero-actions"><a className="button" href="#menu">Find your favourite <Icon /></a><a className="secondary-link" href="#about">Meet our little corner <span aria-hidden="true">↗</span></a></div>
            <a className="hero-location" href="#contact"><Icon name="pin" /> Made for the neighbourhood. Find us in Bukit Timah.</a>
          </div>
          <div className="hero-art">
            <span className="paint-dot paint-dot-blue" aria-hidden="true" /><span className="paint-dot paint-dot-red" aria-hidden="true" />
            <span className="art-handnote">a little quirky.<br />a little fruity.<br />all heart.</span>
            <div className="mascot-stage"><img src="/images/fruit-punchy-logo.webp" alt="Fruit Punchy Studio logo artwork with colourful lettering and two hand-painted yellow and red fruit characters" width="818" height="392" fetchPriority="high" /></div>
            <div className="art-sticker"><span aria-hidden="true">✳</span> Good kopi.<br /><strong>Even better company.</strong></div>
            <svg className="art-doodle" viewBox="0 0 100 110" fill="none" aria-hidden="true"><path d="M65 7c40 38 15 68-37 65m0 0 18-16M28 72l19 13M13 17l8 8M31 6l-2 12M5 39l15-2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
        <div className="hero-bottom-note"><span aria-hidden="true">✿</span> A warm cup. A full heart. A splash of imagination. <span aria-hidden="true">✿</span></div>
      </section>
      <div className="values-strip"><div className="shell values-inner"><span><Cup /> Proper local kopi</span><i aria-hidden="true">✳</i><span><Icon name="heart" /> Comfort food, happy hearts</span><i aria-hidden="true">✳</i><span><Icon name="sun" /> A little everyday inspiration</span></div></div>
    </>
  )
}

function About() {
  return (
    <section className="about shell section-space" id="about" aria-labelledby="about-title">
      <div className="about-title"><p className="eyebrow">HELLO, WE’RE FRUIT PUNCHY</p><h2 id="about-title">A familiar corner.<br /><em>A colourful soul.</em></h2><span className="little-note"><span aria-hidden="true">✿</span> Come as you are. Stay a little.</span></div>
      <div className="about-copy"><p>We believe the best little moments come with a good cup of kopi, something comforting to eat, and space to let your mind wander.</p><p>That’s the spirit of Fruit Punchy Kopi and Art. A welcoming neighbourhood café at Bukit Timah Shopping Centre, full of familiar local flavours and a love for the colourful side of everyday life.</p><a className="text-link" href="#contact">Pull up a chair. Make yourself at home. <Icon /></a></div>
    </section>
  )
}

const menu = [
  { name: 'Signature Kopi', price: '2.80', category: 'THE DAILY RITUAL', image: 'kopi', alt: 'A ceramic cup of traditional local kopi, shown as an illustrative serving', description: 'Bold, fragrant local coffee with a swirl of condensed milk. Your morning, made better.' },
  { name: 'Kaya Toast Set', price: '6.50', category: 'A BREAKFAST CLASSIC', image: 'kaya', alt: 'Kaya toast with butter, soft-boiled eggs and coffee; illustrative serving from another café', description: 'Crisp kaya and butter toast, soft-boiled eggs, and a comforting cup of kopi. The perfect trio.' },
  { name: 'Uncle’s Laksa', price: '8.90', category: 'COMFORT IN A BOWL', image: 'laksa', alt: 'A bowl of Katong-style laksa with coconut broth and noodles; illustrative serving', description: 'Rich coconut-spiced broth, slurp-worthy noodles, and prawns. A little warmth in every spoonful.' },
]

function Menu() {
  return <section className="menu-section section-space" id="menu" aria-labelledby="menu-title"><div className="shell"><div className="menu-heading"><div><p className="eyebrow">LITTLE PLATES, BIG COMFORT</p><h2 id="menu-title">Happiness, <em>served simply.</em></h2></div><p>A few familiar favourites to brighten your day.<br />Made for slow sips and happy little catch-ups.</p></div><div className="menu-grid">{menu.map((item, index) => <article className="menu-card" key={item.name}><div className="menu-image"><img src={`/images/${item.image}.webp`} alt={item.alt} width="800" height="600" loading="lazy" decoding="async" /><span className="menu-number">0{index + 1}</span></div><p className="menu-category">{item.category}</p><div className="menu-item-heading"><h3>{item.name}</h3><span className="price"><small>S$</small>{item.price}</span></div><p className="menu-description">{item.description}</p></article>)}</div><div className="menu-note"><span className="preview-pill">MENU PREVIEW</span><p>Sample dishes and proposed prices. Photography is illustrative.</p></div></div></section>
}

function Visit() {
  return <section className="visit-section" id="contact" aria-labelledby="contact-title"><div className="shell visit-inner"><div className="visit-intro"><p className="eyebrow">COME FIND YOUR HAPPY CORNER</p><h2 id="contact-title">Your seat’s waiting.<br /><em>Kopi, anyone?</em></h2><p>A quick kopi, a catch-up, or a quiet moment<br className="desktop-break" /> to yourself. There’s a place for you here.</p><a className="button button-light" href={directions} target="_blank" rel="noopener noreferrer">Get directions <Icon /></a><span className="map-hint">Opens Bukit Timah Shopping Centre in Google Maps</span></div><div className="visit-details"><div className="visit-detail"><div className="detail-label"><Icon name="pin" /><h3>Find our corner</h3></div><address>Bukit Timah Shopping Centre<br />170 Upper Bukit Timah Road<br />Singapore 588179</address><p className="detail-note">Café unit number to be confirmed.</p></div><div className="visit-detail"><div className="detail-label"><Icon name="clock" /><h3>Make time for kopi</h3></div><dl className="hours"><div><dt>Monday – Friday</dt><dd>8am – 6pm</dd></div><div><dt>Saturday – Sunday</dt><dd>8am – 5pm</dd></div></dl><p className="detail-note">Proposed opening hours. Please check back for confirmation.</p></div></div><span className="visit-flower" aria-hidden="true">✳</span></div></section>
}

function Footer() {
  return <footer className="shell site-footer"><div className="footer-main"><Brand footer /><p>A little kopi. A lot of colour.<br />Always room for one more.</p><a className="back-top" href="#top">Back to top <Icon /></a></div><div className="footer-bottom"><p>© {new Date().getFullYear()} Fruit Punchy Kopi and Art</p><p>Made with a playful heart, for our neighbourhood. <a href="/admin">Admin</a></p><details className="photo-credits"><summary>Photo credits</summary><div><p>Representative imagery; not photographs of Fruit Punchy Kopi and Art</p><p>Café atmosphere: Unsplash. Food photographs from Wikimedia Commons, cropped and colour adjusted. <a href="/photo-credits.txt" target="_blank" rel="noopener noreferrer">View photographers, sources and licences ↗</a></p></div></details></div></footer>
}

const route = resolveRoute(window.location)

function App() {
  return <><a className="skip-link" href="#main">Skip to content</a><div id="top" /><div className="announcement"><span aria-hidden="true">✳</span> A colourful little corner of Bukit Timah.</div><Header />{route === 'staff' ? <RequireMember staffOnly><AccountPage /></RequireMember> : route === 'admin' ? <AdminPage /> : route === 'members' ? <RequireMember><AccountPage /></RequireMember> : route === 'account' ? <AccountPage /> : <main id="main"><Hero /><About /><Menu /><Visit /></main>}<Footer /></>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><App /></AuthProvider></React.StrictMode>)


