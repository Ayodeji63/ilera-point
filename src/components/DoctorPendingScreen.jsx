import { AlertCircle, Clock3, LogOut, RefreshCw } from "lucide-react";
import BrandHeader from "./BrandHeader";
import { supabase } from "../lib/supabase/client";

export default function DoctorPendingScreen({ status, email, onRecheck, onLogout }) {
  const rejected = status === "rejected";
  return <main className="min-h-[100dvh] bg-[#edf0eb]"><BrandHeader compact/><section className="mx-auto max-w-[720px] px-5 pb-12 md:px-10"><div className="rounded-[16px] bg-white p-8 text-center shadow-[0_16px_40px_rgba(16,63,51,.08)] md:p-12">
    {rejected ? <AlertCircle className="mx-auto text-[#8e2f24]" size={54}/> : <Clock3 className="mx-auto text-[#1d6e59]" size={54}/>}
    <h1 className="mt-6 text-4xl font-black tracking-[-.03em] text-[#103f33]">{rejected ? "Application not approved" : "Waiting for approval"}</h1>
    <p className="mt-4 text-lg font-semibold leading-relaxed text-[#527269]">{rejected ? "An administrator reviewed this application and did not approve it. Contact your IleraPoint administrator if you believe this is a mistake." : `Your application for ${email} is with an IleraPoint administrator. You will be able to open the consultation queue as soon as it is approved.`}</p>
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
      {!rejected && <button onClick={onRecheck} className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-[#e7f1ed] px-5 font-black text-[#155944]"><RefreshCw size={20}/>Check again</button>}
      <button onClick={async()=>{await supabase?.auth.signOut();onLogout();}} className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-[#103f33] px-5 font-black text-white"><LogOut size={20}/>Sign out</button>
    </div>
  </div></section></main>;
}
