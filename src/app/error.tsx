'use client'
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
 return <div className="grid min-h-screen place-content-center gap-4 bg-ink-50 p-6"><h1 className="text-xl font-semibold">Your workspace could not be loaded.</h1><p role="alert">Your saved work is safe. Retry to reconnect.</p><button className="btn-primary" onClick={reset}>Retry</button></div>
}
