import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, ShieldCheck, UserX } from "lucide-react";
import BrandHeader from "./BrandHeader";
import { getPendingApplications, reviewApplication } from "../lib/doctors";

export default function DoctorAdminScreen({ onBack }) {
  const [items,setItems]=useState([]); const [state,setState]=useState("loading"); const [error,setError]=useState(""); const [busyId,setBusyId]=useState("");
  const load=useCallback(async()=>{setState("loading");setError("");try{setItems(await getPendingApplications());setState("ready");}catch(e){setError(e.message);setState("ready");}},[]);
  useEffect(()=>{load();},[load]);
  const review=async(id,status)=>{setBusyId(id);setError("");try{await reviewApplication(id,status);setItems((current)=>current.filter((item)=>item.id!==id));}catch(e){setError(e.message);}finally{setBusyId("");}};
  return <main className="min-h-[100dvh] bg-[#edf0eb]"><BrandHeader compact/><section className="mx-auto max-w-[1180px] px-5 pb-12 md:px-10">
    <button onClick={onBack} className="flex min-h-12 items-center gap-2 font-black text-[#155944]"><ArrowLeft/>Back to queue</button>
    <div className="mt-4 border-b border-[#103f33] pb-7"><h1 className="flex items-center gap-3 text-5xl font-black tracking-[-.04em] text-[#103f33]"><ShieldCheck className="text-[#1d6e59]" size={44}/>Doctor applications</h1><p className="mt-3 text-lg font-semibold text-[#527269]">Check each registration number against the medical register before approving. An approved account can open every patient record in the queue.</p></div>
    {error&&<div role="alert" className="mt-6 rounded-[14px] bg-[#fff0e8] p-4 font-bold text-[#8b311f]">{error}</div>}
    <div className="mt-6 overflow-hidden rounded-[16px] bg-white shadow-[0_16px_40px_rgba(16,63,51,.08)]">
      {state==="loading"?<p className="p-8 text-lg font-black">Loading applications…</p>
        :!items.length?<div className="p-12 text-center"><BadgeCheck className="mx-auto text-[#1d6e59]" size={50}/><h2 className="mt-5 text-3xl font-black">Nothing waiting</h2><p className="mt-2 font-semibold text-[#527269]">New applications appear here for review.</p></div>
        :items.map((item)=><div key={item.id} className="grid gap-4 border-b border-[#d8e1dc] p-5 last:border-0 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
          <div><strong className="text-xl text-[#103f33]">{item.name}</strong><span className="mt-1 block text-sm font-bold text-[#527269]">{item.email}</span></div>
          <div><span className="text-sm font-bold uppercase tracking-[.08em] text-[#527269]">Registration</span><span className="block font-extrabold text-[#36564e]">{item.licence_number||"Not provided"}</span></div>
          <div className="flex gap-2"><button disabled={busyId===item.id} onClick={()=>review(item.id,"approved")} className="min-h-12 rounded-[12px] bg-[#103f33] px-4 font-black text-white disabled:opacity-40">Approve</button><button disabled={busyId===item.id} onClick={()=>review(item.id,"rejected")} className="flex min-h-12 items-center gap-2 rounded-[12px] bg-[#f1f3ee] px-4 font-black text-[#8b311f] disabled:opacity-40"><UserX size={18}/>Reject</button></div>
        </div>)}
    </div>
  </section></main>;
}
