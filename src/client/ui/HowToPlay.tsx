// "How to play" guide overlay. Safe for the start chunk: no engine or contract imports.
// Mount <HowToPlay /> once per screen (StartScreen, TopBar); open it from anywhere with <HowToPlayButton />.
import { useEffect, useRef, type ComponentType } from 'react'
import { create } from 'zustand'
import { ACTIONS, GUIDE, RULER_HEX, RULER_ROWS, SKILL_FACES, type DiagramId } from './howToPlayContent'
import './howToPlay.css'

interface HowToPlayState { open: boolean; setOpen: (open: boolean) => void }
export const useHowToPlay = create<HowToPlayState>((set) => ({ open: false, setOpen: (open) => set({ open }) }))

export function HowToPlayButton({ className, testId = 'how-to-play-open', label = 'How to play', link = false }: { className?: string; testId?: string; label?: string; link?: boolean }) {
  const setOpen = useHowToPlay((s) => s.setOpen)
  return (
    <button type="button" className={[link ? 'htp-link' : '', className ?? ''].join(' ').trim() || undefined} data-testid={testId}
      title="Turns, actions, dice and rulers in brief" onClick={() => setOpen(true)}>{label}</button>
  )
}

function TurnDiagram() {
  return (
    <div className="htp-flow" aria-label="Turn order diagram">
      <div className="htp-box">Mark one model <b>Ready</b></div>
      <div className="htp-arrow" aria-hidden="true">&rarr;</div>
      <div className="htp-box">Use <b>all</b> Ready models<br /><small>or use none (they become Used)</small></div>
      <div className="htp-arrow" aria-hidden="true">&rarr;</div>
      <div className="htp-box alt">Other side&apos;s turn</div>
      <div className="htp-loop">Repeat until every model is Used, then a new round starts.</div>
    </div>
  )
}

function ActivationDiagram() {
  return (
    <div className="htp-flow" aria-label="Activation diagram">
      <div className="htp-box">Action 1</div>
      <div className="htp-arrow" aria-hidden="true">+</div>
      <div className="htp-box">Action 2</div>
      <div className="htp-arrow" aria-hidden="true">+</div>
      <div className="htp-box alt">Quick Actions<br /><small>1 AP each</small></div>
    </div>
  )
}

function SkillDieDiagram() {
  const sv = 6
  return (
    <div className="htp-die" aria-label={`Skill die faces, example success value ${sv}`}>
      <div className="htp-faces">
        {SKILL_FACES.map((f) => {
          const pass = f.value !== 'X' && f.value <= sv
          return (
            <div key={f.label} className={`htp-face ${f.value === 'X' ? 'x' : pass ? 'pass' : 'fail'}`} style={{ flexGrow: f.faces }} title={`${f.faces} of 20 faces`}>
              {f.label}
            </div>
          )
        })}
      </div>
      <p className="htp-caption">Example: success value {sv}. Green faces pass, grey fail, X always fails. Wider cells come up more often.</p>
    </div>
  )
}

function RulerDiagram() {
  const max = Math.max(...RULER_ROWS.map((r) => r.inches))
  return (
    <div className="htp-rulers" data-testid="how-to-play-rulers">
      {RULER_ROWS.map((r) => (
        <div key={r.colour} className="htp-ruler">
          <span className="htp-rname">{r.colour}</span>
          <span className="htp-rbar" style={{ width: `${(r.inches / max) * 100}%`, background: RULER_HEX[r.colour] ?? '#888' }} />
          <span className="htp-rin">{r.inches} in</span>
        </div>
      ))}
    </div>
  )
}

const DIAGRAMS: Record<DiagramId, ComponentType> = { turn: TurnDiagram, activation: ActivationDiagram, skillDie: SkillDieDiagram, rulers: RulerDiagram }

/** The guide body, exported for tests and for embedding. */
export function HowToPlayBody() {
  return (
    <>
      <nav className="htp-toc" aria-label="Guide sections">
        {GUIDE.map((s) => (
          <button key={s.id} type="button" onClick={() => { try { document.getElementById(`htp-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch { /* no DOM */ } }}>{s.title}</button>
        ))}
      </nav>
      {GUIDE.map((s) => {
        const D = s.diagram ? DIAGRAMS[s.diagram] : null
        return (
          <section key={s.id} id={`htp-${s.id}`} className="htp-sec" data-testid={`how-to-play-${s.id}`}>
            <h3>{s.title}</h3>
            {s.intro && <p>{s.intro}</p>}
            {D && <D />}
            {s.bullets && <ul>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            {s.actions && (
              <table className="htp-actions">
                <tbody>
                  {ACTIONS.map((a) => (
                    <tr key={a.name}><th scope="row">{a.name}</th><td className="htp-cost">{a.cost}</td><td>{a.text}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )
      })}
    </>
  )
}

export function HowToPlay() {
  const open = useHowToPlay((s) => s.open)
  const setOpen = useHowToPlay((s) => s.setOpen)
  useEffect(() => () => setOpen(false), [setOpen])
  return open ? <HowToPlayDialog onClose={() => setOpen(false)} /> : null
}

/** The overlay itself (stateless apart from focus and Escape), exported for tests. */
export function HowToPlayDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="htp-back" data-testid="how-to-play" role="dialog" aria-modal="true" aria-label="How to play" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="htp-panel">
        <div className="htp-head">
          <h2>How to play</h2>
          <button ref={closeRef} type="button" className="htp-close" data-testid="how-to-play-close" aria-label="Close the guide" onClick={onClose}>Close</button>
        </div>
        <div className="htp-scroll"><HowToPlayBody /></div>
      </div>
    </div>
  )
}
