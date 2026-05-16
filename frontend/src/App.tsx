function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-6">
      <div className="max-w-xl w-full text-center space-y-6">
        <p className="text-sm uppercase tracking-widest text-slate-500">
          Ryokan DX
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          話しかけるだけで、旅館の無駄がわかる。
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          チャットで話すだけで、オペレーションの無駄を金額・時間で可視化し、
          雰囲気を守りながら改善策を優先度付きで提案します。
        </p>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-3 text-white font-medium shadow-sm hover:bg-slate-700 transition-colors"
        >
          診断スタート
        </button>
        <p className="text-xs text-slate-400">
          setup smoke test — Tailwind v4 + Vite + React + TS
        </p>
      </div>
    </main>
  )
}

export default App
