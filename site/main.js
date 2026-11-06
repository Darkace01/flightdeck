// Pushback website: live release info and download links from the GitHub API, OS detection, and the small
// animations (scroll reveals, tilt, card spotlight, typed commands, counters). Everything degrades to plain
// links if JavaScript or the API is unavailable.

const REPO = 'Darkace01/pushback'
const RELEASES = `https://github.com/${REPO}/releases/latest`
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
document.documentElement.classList.add('js')

/* --- Which OS is this? ------------------------------------------------------------------ */
function detectOs() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase()
  if (p.includes('win')) return 'windows'
  if (p.includes('mac') || /iphone|ipad/.test(p)) return 'mac'
  if (p.includes('linux') || p.includes('x11')) return 'linux'
  return null
}
const os = detectOs()
const OS_LABEL = { windows: 'Windows', mac: 'macOS', linux: 'Linux' }
const OS_ASSET = { windows: 'win-x64.exe', mac: 'mac-arm64.dmg', linux: 'x86_64.AppImage' }

if (os) {
  document.querySelector(`.dl[data-os="${os}"]`)?.classList.add('detected')
  document.getElementById('hero-download-label').textContent = `Download for ${OS_LABEL[os]}`
  document.getElementById('hero-os-icon').classList.add({ windows: 'win', mac: 'mac', linux: 'linux' }[os])
}

/* --- Latest release: version, links and sizes --------------------------------------------- */
const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`
// Every download button links to the releases page until the API answers, so they always work.
document.querySelectorAll('[data-asset]').forEach((a) => (a.href = RELEASES))

fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((release) => {
    const find = (suffix) => release.assets.find((a) => a.name.endsWith(suffix))
    document.querySelectorAll('[data-asset]').forEach((a) => {
      const asset = find(a.dataset.asset)
      if (asset) a.href = asset.browser_download_url
    })
    document.querySelectorAll('[data-size]').forEach((el) => {
      const asset = find(el.dataset.size)
      if (asset) el.textContent = `${release.tag_name} · ${mb(asset.size)}`
    })
    const published = new Date(release.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    document.getElementById('version').textContent = `${release.tag_name} is out`
    document.getElementById('dl-version').textContent = release.tag_name
    document.getElementById('dl-sub').textContent = `Released ${published}. Free and open source. Updates install themselves.`
    const mine = os && find(OS_ASSET[os])
    if (mine) {
      const hero = document.getElementById('hero-download')
      hero.href = mine.browser_download_url
      document.getElementById('hero-fine').textContent = `${release.tag_name} for ${OS_LABEL[os]} · ${mb(mine.size)} · Free and open source · MIT licence`
    }
  })
  .catch(() => {})

/* --- Scroll reveals, staggered within each group ------------------------------------------- */
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (!e.isIntersecting) return
      e.target.classList.add('in')
      io.unobserve(e.target)
    }),
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
)
document.querySelectorAll('.reveal, .reveal-zoom').forEach((el) => {
  const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'))
  el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el), 6) * 0.07}s`)
  io.observe(el)
})

/* --- Nav background once you scroll ------------------------------------------------------- */
const nav = document.getElementById('nav')
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10)
addEventListener('scroll', onScroll, { passive: true })
onScroll()

/* --- Hero window: settles flat, then tilts toward the mouse ------------------------------ */
const tilt = document.getElementById('tilt')
setTimeout(() => tilt.classList.add('settled'), 450)
if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
  const stage = document.getElementById('stage')
  stage.addEventListener('mousemove', (e) => {
    const r = stage.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    tilt.style.setProperty('--ry', `${x * 8}deg`)
    tilt.style.setProperty('--rx', `${-y * 6}deg`)
  })
  stage.addEventListener('mouseleave', () => {
    tilt.style.setProperty('--ry', '0deg')
    tilt.style.setProperty('--rx', '0deg')
  })
}

/* --- Spotlight that follows the cursor on cards ------------------------------------------- */
document.querySelectorAll('.spot').forEach((card) =>
  card.addEventListener('mousemove', (e) => {
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - r.left}px`)
    card.style.setProperty('--my', `${e.clientY - r.top}px`)
  })
)

/* --- Typed install commands, when they scroll into view ----------------------------------- */
const typeIo = new IntersectionObserver((entries) =>
  entries.forEach((e) => {
    if (!e.isIntersecting) return
    typeIo.unobserve(e.target)
    const el = e.target
    const text = el.dataset.text
    if (reduceMotion) return void (el.textContent = text)
    let i = 0
    const step = () => {
      el.textContent = text.slice(0, ++i)
      if (i < text.length) setTimeout(step, 28 + Math.random() * 45)
    }
    setTimeout(step, 300)
  })
)
document.querySelectorAll('.type').forEach((el) => typeIo.observe(el))

/* --- Count-up numbers -------------------------------------------------------------------- */
const countIo = new IntersectionObserver((entries) =>
  entries.forEach((e) => {
    if (!e.isIntersecting) return
    countIo.unobserve(e.target)
    const el = e.target
    const end = Number(el.dataset.count)
    const suffix = el.dataset.suffix ?? ''
    if (reduceMotion || end === 0) return void (el.textContent = end + suffix)
    const start = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 1400)
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + (p === 1 ? suffix : '')
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
)
document.querySelectorAll('[data-count]').forEach((el) => countIo.observe(el))

/* --- Screenshot switcher ------------------------------------------------------------------- */
const themeShot = document.getElementById('theme-shot')
document.querySelectorAll('.theme-toggle button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.theme-toggle button').forEach((x) => x.classList.toggle('on', x === b))
    themeShot.style.opacity = '0'
    setTimeout(() => {
      themeShot.src = b.dataset.shot
      themeShot.alt = `Pushback: ${b.textContent}`
      themeShot.onload = () => (themeShot.style.opacity = '1')
    }, 200)
  })
)

/* --- Copy buttons ------------------------------------------------------------------------ */
const toast = document.getElementById('toast')
document.querySelectorAll('.copy').forEach((b) =>
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy)
      toast.textContent = 'Copied to clipboard'
    } catch {
      toast.textContent = 'Copy failed: select the text instead'
    }
    toast.classList.add('show')
    setTimeout(() => toast.classList.remove('show'), 1800)
  })
)
