import { ShieldCheck } from "lucide-react";

export default function BrandHeader({ language, onLanguageChange, compact = false, inverse = false }) {
  return (
    <header className={`relative z-10 flex items-center justify-between gap-4 ${compact ? "px-5 py-4 md:px-9" : "px-5 py-5 md:px-10 md:py-7"}`}>
      <div className={`flex items-center gap-3 ${inverse ? "text-white" : "text-[#103f33]"}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-[14px] ${inverse ? "bg-white text-[#8e2f24]" : "bg-[#103f33] text-white"}`}><ShieldCheck size={24} strokeWidth={2.5} /></span>
        <div><div className="text-xl font-black tracking-[-.03em]">IleraPoint</div><div className={`text-xs font-bold uppercase tracking-[.13em] ${inverse ? "text-[#ffd7cf]" : "text-[#527269]"}`}>Voice health intake</div></div>
      </div>
      {onLanguageChange && (
        <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-[0_8px_22px_rgba(16,63,51,.1)]">
          <span className="hidden text-sm font-bold text-[#527269] sm:inline">I speak</span>
          <select aria-label="Select your language" value={language} onChange={(event) => onLanguageChange(event.target.value)} className="min-h-9 bg-transparent pr-1 font-extrabold text-[#103f33] outline-none">
            <option value="en">English</option><option value="yo">Yorùbá + English</option><option value="pcm">Pidgin + English</option><option value="ha">Hausa + English</option><option value="ig">Igbo + English</option>
          </select>
        </label>
      )}
    </header>
  );
}
