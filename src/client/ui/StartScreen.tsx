import { PALETTE } from '../theme'

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="start" data-testid="start-screen">
      <div className="start-card">
        <p className="eyebrow">An unofficial fan project</p>
        <h1>Fell-in: Wasteland Warfair</h1>
        <p className="tag">A 3D tabletop skirmish on a dusty 3 by 3 foot table. Rules engine in progress.</p>
        <button className="go" data-testid="start-button" onClick={onStart} style={{ background: PALETTE.rust }}>
          Open the table
        </button>
        <p className="fine">
          Not affiliated with Modiphius Entertainment, Bethesda Softworks or ZeniMax. By evilgouki.
        </p>
      </div>
    </main>
  )
}
