import { Video } from "lucide-react";
export default function RecordingIndicator() { return <div role="status" className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-[#8e2f24] px-4 py-2 font-black text-white shadow-[0_8px_22px_rgba(16,63,51,.2)]"><span className="h-3 w-3 animate-pulse rounded-full bg-white"/><Video size={18}/>Visit recording</div>; }
