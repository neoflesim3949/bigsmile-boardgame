import { Sparkles } from 'lucide-react';
import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"></div>

      <div className="relative z-10 w-full max-w-md p-8 glass-panel rounded-2xl flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-6">
          <Sparkles className="w-8 h-8 text-amber-400" />
        </div>

        <h1 className="text-3xl font-bold mb-2 text-glow text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">
          開運大富翁
        </h1>
        <p className="text-zinc-400 mb-8 text-center text-sm">
          輸入您的帳號與密碼以進入系統
        </p>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-6 w-full text-xs text-zinc-500 border border-zinc-800 rounded-lg p-3 space-y-1">
            <p className="text-zinc-400 mb-1">開發測試帳號：</p>
            <p>管理員：<span className="text-zinc-300">admin</span> / admin1234</p>
            <p>關主：<span className="text-zinc-300">captain1</span> / captain12</p>
            <p>玩家：<span className="text-zinc-300">player001</span> / player001</p>
          </div>
        )}

        <div className="mt-8 text-xs text-zinc-500 text-center">
          <p>開運大富翁 V2 獨立部署版</p>
          <p className="mt-1">© 2026 Bigsmile Journey</p>
        </div>
      </div>
    </div>
  );
}
