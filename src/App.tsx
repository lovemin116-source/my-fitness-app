import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { 
  Scale, Target, Plus, Trash2, Activity, Dumbbell, Ruler, Edit2, Copy, Check, X, 
  AlertCircle, Loader2, RefreshCw, Upload, Cloud, Camera, Image as ImageIcon, 
  Calendar as CalendarIcon, LineChart as ChartIcon, ClipboardList, PlusCircle, 
  History, ChevronLeft, ChevronRight, BookOpen, Eye, EyeOff, Search, ChevronDown, 
  Database, Timer, CheckCircle, Volume2, VolumeX, Music, Save, XCircle, LogOut
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- 全域樣式 ---
const GLOBAL_STYLE = `
  @keyframes dot-flash-red {
    0% { r: 4; fill: #ef4444; filter: drop-shadow(0 0 2px #ef4444); }
    50% { r: 6; fill: #f87171; filter: drop-shadow(0 0 4px #ef4444); }
    100% { r: 4; fill: #ef4444; filter: drop-shadow(0 0 2px #ef4444); }
  }
  .animate-trend-warning { animation: dot-flash-red 1s infinite ease-in-out; }
`;

// --- 1. 配置與工具 ---
const firebaseConfig = { apiKey: "AIzaSyAKgPusc2ckogI6S2tkytNKZqpu-TiR8ig", authDomain: "roygym2-ce85c.firebaseapp.com", projectId: "roygym2-ce85c", storageBucket: "roygym2-ce85c.firebasestorage.app", messagingSenderId: "476108578502", appId: "1:476108578502:web:9d26dd1c1323b3e24081c7" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const SOUNDS = {
  BEEP: "https://actions.google.com/sounds/v1/alarms/beep_short.ogg", 
  SILENCE: "https://github.com/anars/blank-audio/raw/master/10-seconds-of-silence.mp3" 
};

const lbsToKg = (lbs: number) => parseFloat((lbs / 2.20462).toFixed(2));
const calculate1RM = (w: number, r: number) => (!r || r <= 1) ? w : w * (1 + r / 30);
const compressImage = (file: File): Promise<string> => new Promise((res) => {
  const reader = new FileReader(); reader.readAsDataURL(file);
  reader.onload = (ev) => {
    const img = new Image(); img.src = ev.target?.result as string;
    img.onload = () => {
      const cvs = document.createElement('canvas'); const MAX = 800;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
      cvs.width = w; cvs.height = h;
      cvs.getContext('2d')?.drawImage(img, 0, 0, w, h);
      res(cvs.toDataURL('image/jpeg', 0.6));
    };
  };
});
const DEFAULT_DATA: any = { goals: { targetWeight: 66, targetBodyFat: 14, targetDate: '2026-12-31' }, entries: [], exercises: [], logs: [], dailyPlans: {}, planTemplates: ['胸日', '背日', '腿日', '肩日'] };

// --- 2. 通用彈窗組件 ---

const DataTransferModal = ({ isOpen, type, data, onImport, onClose }: any) => {
  const [json, setJson] = useState('');
  useEffect(() => { if (isOpen && type === 'export') setJson(JSON.stringify(data, null, 2)); }, [isOpen, type, data]);
  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(json); alert('代碼已複製！'); } 
      else throw new Error();
    } catch (e) {
      const ta = document.createElement("textarea"); ta.value = json; ta.style.position="fixed"; ta.style.left="-9999px"; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); alert('代碼已複製(相容模式)！'); } catch(e2) { alert('請手動長按代碼複製'); }
      document.body.removeChild(ta);
    }
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col max-h-[80vh]">
        <div className="flex justify-between mb-4 font-bold"><h3>數據管理 ({type==='export'?'匯出':'匯入'})</h3><button onClick={onClose}><X/></button></div>
        <textarea className="flex-1 border rounded-xl p-3 font-mono text-[11px] mb-4 bg-slate-50 outline-none" value={json} onChange={e=>setJson(e.target.value)} readOnly={type==='export'} />
        <button onClick={type==='export'?handleCopy:()=>{try{onImport(JSON.parse(json));onClose();alert('匯入成功');}catch(e){alert('格式錯誤');}}} className="bg-indigo-600 text-white py-4 rounded-xl font-black">{type==='export'?'複製代碼':'開始匯入'}</button>
      </div>
    </div>
  );
};

const RestTimerModal = ({ isOpen, onClose, defaultSeconds = 90 }: any) => {
  const [seconds, setSeconds] = useState(defaultSeconds);
  const [audioState, setAudioState] = useState<'locked' | 'ready'>('locked');
  const endTimeRef = useRef<number | null>(null);
  const silenceAudio = useRef<HTMLAudioElement | null>(null);
  const beepAudio = useRef<HTMLAudioElement | null>(null);
  const unlockAudio = () => {
    if (!silenceAudio.current) { silenceAudio.current = new Audio(SOUNDS.SILENCE); silenceAudio.current.loop = true; }
    if (!beepAudio.current) { beepAudio.current = new Audio(SOUNDS.BEEP); }
    silenceAudio.current.play().then(() => {
      setAudioState('ready');
      if ('mediaSession' in navigator) { navigator.mediaSession.metadata = new MediaMetadata({ title: 'BodyGoal 計時', artist: '保活中' }); navigator.mediaSession.playbackState = 'playing'; }
    }).catch(() => {});
  };
  const triggerBeep = () => { if (beepAudio.current) { beepAudio.current.currentTime = 0; beepAudio.current.play().catch(() => {}); } };
  const calibrate = () => { if (!endTimeRef.current) return; const rem = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000)); setSeconds(rem); return rem; };
  useEffect(() => {
    if (!isOpen) { endTimeRef.current = null; if (silenceAudio.current) silenceAudio.current.pause(); return; }
    endTimeRef.current = Date.now() + defaultSeconds * 1000; setSeconds(defaultSeconds);
    const t = setInterval(() => {
      const rem = calibrate();
      if (rem !== undefined && rem <= 5 && rem > 0) triggerBeep();
      if (rem === 0) { triggerBeep(); if (navigator.vibrate) navigator.vibrate([400, 200, 400]); clearInterval(t); setTimeout(onClose, 1500); }
    }, 1000);
    return () => clearInterval(t);
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center p-4 pointer-events-none">
      <div className="bg-slate-900/95 text-white p-6 w-full max-w-xs rounded-[2.5rem] shadow-2xl pointer-events-auto border border-slate-700 animate-in slide-in-from-bottom">
        <div className="flex justify-between mb-4 items-center"><div className="flex items-center gap-2"><Timer className={seconds <= 10 ? "text-red-500 animate-ping" : "text-indigo-400 animate-pulse"}/><span className="font-black text-xs uppercase">休息中</span></div><button onClick={onClose}><X size={20}/></button></div>
        <div className={`text-center text-7xl font-black font-mono mb-6 ${seconds <= 10 ? "text-red-500" : ""}`}>{Math.floor(seconds/60)}:{(seconds%60).toString().padStart(2,'0')}</div>
        {audioState === 'locked' ? (<button onClick={unlockAudio} className="w-full bg-amber-500 text-slate-900 py-4 rounded-2xl font-black text-sm mb-4 flex items-center justify-center gap-3 animate-bounce"><Music size={18}/> 啟動背景提示音</button>) : (<div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-4 text-center"><span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">背景模式已解鎖</span></div>)}
        <div className="flex gap-2"><button onClick={() => { unlockAudio(); endTimeRef.current! += 30000; calibrate(); }} className="flex-1 bg-slate-800 py-3 rounded-2xl text-xs font-bold">+30s</button><button onClick={onClose} className="flex-1 bg-indigo-600 py-3 rounded-2xl text-xs font-bold shadow-lg">跳過</button></div>
      </div>
    </div>
  );
};

const PlanManageModal = ({ isOpen, onClose, data, onUpdate }: any) => {
  const [newPlan, setNewPlan] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[70vh]">
        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl flex items-center gap-2 text-indigo-600"><Edit2 size={20}/> 管理計畫模板</h3><button onClick={onClose}><X/></button></div>
        <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-1">
          {(data.planTemplates || []).map((plan: string, i: number) => (
            <div key={i} className="flex items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              {editingIndex === i ? (<input value={editValue} onChange={e => setEditValue(e.target.value)} className="flex-1 bg-white border-2 border-indigo-400 rounded-xl px-3 py-1 font-bold outline-none" autoFocus />) : (<span className="flex-1 font-bold text-slate-700">{plan}</span>)}
              <div className="flex gap-1">
                {editingIndex === i ? (<button onClick={() => { const updated = [...data.planTemplates]; updated[i] = editValue; onUpdate({ ...data, planTemplates: updated }); setEditingIndex(null); }} className="p-2 text-emerald-500 rounded-lg"><Check size={18}/></button>) : (<button onClick={() => { setEditingIndex(i); setEditValue(plan); }} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg"><Edit2 size={18}/></button>)}
                <button onClick={() => { if(confirm('刪除？')) onUpdate({ ...data, planTemplates: data.planTemplates.filter((_:any, idx:number)=>idx!==i) }); }} className="p-2 text-slate-400 hover:text-red-500 rounded-lg"><Trash2 size={18}/></button>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t flex gap-2"><input placeholder="新增計畫..." value={newPlan} onChange={e => setNewPlan(e.target.value)} className="flex-1 bg-slate-100 rounded-xl px-4 py-3 font-bold outline-none" /><button onClick={() => { if(newPlan.trim()){ onUpdate({...data, planTemplates:[...(data.planTemplates||[]), newPlan.trim()]}); setNewPlan(''); } }} className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg active:scale-90 transition-transform"><Plus/></button></div>
      </div>
    </div>
  );
};

const HistoryManagementModal = ({ isOpen, onClose, data, onUpdate, targetId }: any) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  useEffect(() => { if (!isOpen) setDeleteId(null); }, [isOpen]);
  if (!isOpen || !targetId) return null;
  const targetEx = data.exercises.find((e:any) => e.id === targetId);
  const logs = data.logs.filter((l:any) => l.exerciseId === targetId).sort((a:any, b:any) => b.date.localeCompare(a.date));
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-md" onClick={onClose}>
      <div className="bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4"><h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><Database className="text-indigo-600" size={20}/> {targetEx?.name} 紀錄</h3><button onClick={onClose}><X/></button></div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">{logs.map((log:any) => (<div key={log.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border"><div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">{log.date}</span><span className="font-black text-slate-700">{log.originalWeight}{log.originalUnit} x {log.reps}</span></div><button onClick={() => { if(deleteId === log.id) { onUpdate({...data, logs: data.logs.filter((l:any)=>l.id!==log.id)}); setDeleteId(null); } else { setDeleteId(log.id); setTimeout(()=>setDeleteId(null), 3000); }}} className={`p-2 rounded-xl transition-all ${deleteId===log.id?'bg-red-500 text-white':'text-slate-300'}`}><Trash2 size={16}/></button></div>))}</div>
      </div>
    </div>
  );
};

const CopyWorkoutModal = ({ isOpen, onClose, data, onCopy }: any) => {
  const [viewDate, setViewDate] = useState(new Date());
  if (!isOpen) return null;
  const year = viewDate.getFullYear(); const month = viewDate.getMonth();
  const calendarDays = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1);
  const firstDay = new Date(year, month, 1).getDay();
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-md" onClick={onClose}>
      <div className="bg-white rounded-[2.5rem] w-full max-w-md p-6 shadow-2xl flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between mb-6 font-black text-xl flex items-center gap-2 text-indigo-600"><History/> 複製歷史課表<button onClick={onClose}><X/></button></div>
        <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-2xl"><button onClick={()=>setViewDate(new Date(year, month-1, 1))}><ChevronLeft/></button><span className="font-black">{year}年 {month + 1}月</span><button onClick={()=>setViewDate(new Date(year, month+1, 1))}><ChevronRight/></button></div>
        <div className="grid grid-cols-7 gap-2">{Array.from({length:firstDay}).map((_,i)=><div key={i}/>)}{calendarDays.map(day => { const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; const plan = data.dailyPlans?.[dStr]; return (<button key={day} disabled={!plan} onClick={()=>{onCopy(dStr); onClose();}} className={`aspect-square rounded-2xl flex flex-col items-center justify-center border-2 ${plan ? 'bg-indigo-600 text-white border-indigo-400 shadow-md' : 'bg-white text-slate-300 border-slate-50'}`}><span className="text-xs font-black">{day}</span></button>);})}</div>
      </div>
    </div>
  );
};

const ExerciseLibraryModal = ({ isOpen, onClose, data, onUpdate }: any) => {
  const [filterMuscle, setFilterMuscle] = useState<string>('胸');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl flex items-center gap-2 text-indigo-600"><BookOpen/> 動作庫</h3><button onClick={onClose}><X/></button></div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">{['胸', '背', '肩', '腿', '手', '腹'].map(m => (<button key={m} onClick={() => setFilterMuscle(m)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filterMuscle === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{m}</button>))}</div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">{data.exercises.filter((e: any) => e.muscle === filterMuscle).map((ex: any) => (<div key={ex.id} className={`p-4 rounded-2xl border ${ex.isTracked !== false ? 'bg-white' : 'bg-slate-50 opacity-60'}`}><div className="flex items-center gap-2 mb-2"><input type="text" value={ex.name} onChange={e => onUpdate({ ...data, exercises: data.exercises.map((x:any)=>x.id===ex.id?{...x, name:e.target.value}:x)})} className="flex-1 font-black bg-transparent outline-none border-b" /><button onClick={() => onUpdate({ ...data, exercises: data.exercises.map((x:any)=>x.id===ex.id?{...x, isTracked:x.isTracked===false}:x)})} className="p-2">{ex.isTracked !== false ? <Eye size={16} className="text-teal-500"/> : <EyeOff size={16} className="text-slate-400"/>}</button></div></div>))}</div>
      </div>
    </div>
  );
};

// --- 3. 手勢包裝器 ---
const SwipeableRow = ({ children, onComplete, isCompleted }: any) => {
  const [startX, setStartX] = useState<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-800 shadow-sm">
      <div className={`absolute inset-0 flex items-center pl-6 transition-colors ${offsetX > 50 ? 'bg-emerald-500' : 'bg-slate-700'}`}><CheckCircle size={24} className="text-white" /></div>
      <div className="relative bg-slate-800 transition-transform duration-200" style={{ transform: `translateX(${offsetX}px)`, touchAction: 'pan-y' }} onTouchStart={e => setStartX(e.targetTouches[0].clientX)} onTouchMove={e => { if (startX !== null) { const d = e.targetTouches[0].clientX - startX; if (d > 0 && d < 150) setOffsetX(d); } }} onTouchEnd={() => { if (offsetX > 100) onComplete(); setStartX(null); setOffsetX(0); }}>{children}</div>
    </div>
  );
};

// --- 4. 核心組件 (體重歷史、分析、課表、1RM) ---

const TrainingRow = ({ log, index, onUpdate, onDelete, onDuplicate, onComplete }: any) => {
  const [w, setW] = useState(log.originalWeight.toString());
  const [r, setR] = useState(log.reps.toString());
  const [isDeleting, setIsDeleting] = useState(false);
  useEffect(() => { setW(log.originalWeight.toString()); setR(log.reps.toString()); }, [log]);
  const save = (nu?: string) => { const weight = parseFloat(w) || 0; const reps = parseInt(r) || 0; const unit = nu || log.originalUnit; onUpdate({ ...log, originalWeight: weight, reps, originalUnit: unit, weight: unit === 'kg' ? weight : lbsToKg(weight) }); };
  return (
    <div className="group space-y-1 mb-2">
      <SwipeableRow onComplete={onComplete} isCompleted={log.isCompleted}>
        <div className={`flex items-center gap-2 p-2 rounded-lg border-2 transition-all ${log.isCompleted ? 'border-emerald-500 bg-emerald-900/20' : 'border-transparent bg-slate-700/40'}`}>
          <span className="font-mono text-[10px] w-4 text-center text-slate-500">{log.isCompleted ? '✓' : index+1}</span>
          <input type="number" value={w} onChange={e=>setW(e.target.value)} onBlur={()=>save()} className={`w-full bg-slate-900 border-none rounded p-1 text-center text-sm outline-none text-white ${log.isCompleted ? 'text-emerald-300 font-bold' : ''}`} />
          <button onClick={()=>{const nu=log.originalUnit==='kg'?'lbs':'kg'; save(nu);}} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 font-bold">{log.originalUnit.toUpperCase()}</button>
          <input type="number" value={r} onChange={e=>setR(e.target.value)} onBlur={()=>save()} className={`w-full bg-slate-900 border-none rounded p-1 text-center text-white text-sm outline-none ${log.isCompleted ? 'text-emerald-300 font-bold' : ''}`} />
          <div className="flex gap-1" onTouchStart={e=>e.stopPropagation()}><button onClick={onDuplicate} className="p-1 text-slate-400"><Copy size={14}/></button><button onClick={() => { if(isDeleting) onDelete(); else { setIsDeleting(true); setTimeout(()=>setIsDeleting(false), 3000); }}} className={`p-1 ${isDeleting?'text-red-500':'text-slate-400'}`}><Trash2 size={14}/></button></div>
        </div>
      </SwipeableRow>
    </div>
  );
};

const BodyMetricsView = ({ data, onUpdate }: any) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState(''); const [bodyFat, setBodyFat] = useState(''); const [photo, setPhoto] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempW, setTempW] = useState(''); const [tempF, setTempF] = useState(''); const [tempP, setTempP] = useState<string | undefined>();
  
  const chartData = useMemo(() => {
    const sorted = [...data.entries].sort((a:any,b:any)=>a.date.localeCompare(b.date));
    const processed = sorted.map((e:any, i, arr) => {
      const avg = arr.slice(Math.max(0, i-6), i+1).reduce((s:any, x:any) => s + x.weight, 0) / Math.min(i+1, 7);
      return { ...e, avgWeight: parseFloat(avg.toFixed(2)) };
    });
    return processed.map((e, i, arr) => {
      const isAvgIncreasing = i > 0 && e.avgWeight > arr[i-1].avgWeight;
      const isActualRisingTwice = i >= 2 && e.weight > arr[i-1].weight && arr[i-1].weight > arr[i-2].weight;
      return { ...e, isAvgIncreasing, isActualRisingTwice };
    });
  }, [data.entries]);

  const targetW = Number(data.goals?.targetWeight) || 0;
  const handleAdd = () => { if (!weight) return; onUpdate({...data, entries:[...data.entries.filter((e:any)=>e.date!==date), {id:Date.now().toString(),date,weight:parseFloat(weight),bodyFat:bodyFat?parseFloat(bodyFat):undefined,photo}]}); setWeight('');setBodyFat('');setPhoto(undefined); };
  
  const CustomDotActual = (props: any) => { const { cx, cy, payload } = props; return <circle cx={cx} cy={cy} r={3} fill={payload.isActualRisingTwice ? "#ef4444" : "#94a3b8"} className={payload.isActualRisingTwice ? "animate-trend-warning" : ""} stroke="#fff" strokeWidth={1} />; };
  const CustomDotAvg = (props: any) => { const { cx, cy, payload } = props; return <circle cx={cx} cy={cy} r={4} fill={payload.isAvgIncreasing ? "#ef4444" : "#1a9478"} className={payload.isAvgIncreasing ? "animate-trend-warning" : ""} stroke="#fff" strokeWidth={2} />; };

  return (
    <div className="space-y-6 pb-20">
      <style>{GLOBAL_STYLE}</style>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4"><div className="bg-white p-6 rounded-[1.5rem] shadow-sm md:col-span-2 border"><div className="flex justify-between mb-4 font-bold text-slate-700"><h3>目標設定</h3><button className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded">修改</button></div><div className="space-y-4"><div className="flex justify-between border-b pb-2"><span>目標體重</span><span className="font-black">{targetW} kg</span></div><div className="flex justify-between pt-2"><span>目標體脂</span><span className="font-black">{data.goals?.targetBodyFat || '--'} %</span></div></div></div><div className="bg-[#1a9478] p-8 rounded-[1.5rem] shadow-lg md:col-span-3 text-white flex flex-col justify-between relative overflow-hidden"><div className="absolute top-4 left-4 opacity-20"><Scale size={24}/></div><div><h3 className="text-sm font-bold opacity-80 mb-4 uppercase">當前數據</h3><div className="flex items-baseline gap-2"><span className="text-6xl font-black">{chartData[chartData.length-1]?.weight || '--'}</span><span className="text-xl font-bold">kg</span></div></div><div className="self-end text-right"><div className="text-xs opacity-70 font-bold mb-1">7日平均</div><div className="text-3xl font-black">{chartData[chartData.length-1]?.avgWeight || '--'} kg</div></div></div></div>
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border"><h2 className="font-black mb-6 flex items-center gap-2"><PlusCircle className="text-teal-600"/> 新增紀錄</h2><div className="flex flex-col md:flex-row gap-4"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="flex-1 border p-2.5 rounded-xl font-bold outline-none" /><input type="number" placeholder="體重" value={weight} onChange={e=>setWeight(e.target.value)} className="flex-1 border p-2.5 rounded-xl font-bold outline-none" /><input type="number" placeholder="體脂" value={bodyFat} onChange={e=>setBodyFat(e.target.value)} className="flex-1 border p-2.5 rounded-xl font-bold outline-none" /><div className="flex gap-2"><button onClick={async()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async(e:any)=>setPhoto(await compressImage(e.target.files[0]));i.click();}} className={`flex-1 p-2.5 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 ${photo?'bg-teal-50 text-teal-600 border-teal-200':'text-slate-400'}`}><Camera size={18}/></button><button onClick={handleAdd} className="flex-[2] bg-[#1a9478] text-white px-8 py-2.5 rounded-xl font-black shadow-lg">儲存</button></div></div></div>
      <div className="bg-white p-6 rounded-[1.5rem] border h-[250px] shadow-sm relative"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{top:50,right:10,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/><XAxis dataKey="date" tickFormatter={s=>s.slice(5)} fontSize={10}/><YAxis domain={['auto','auto']} fontSize={10}/><Tooltip/><ReferenceLine y={targetW} stroke="#ef4444" strokeWidth={2} label={{value:'目標', position:'insideTopRight', fill:'#ef4444', fontSize:10}}/><Line type="monotone" name="實際體重" dataKey="weight" stroke="#94a3b8" strokeWidth={1} dot={<CustomDotActual />} /><Line type="monotone" name="7日平均" dataKey="avgWeight" stroke="#1a9478" strokeWidth={3} dot={<CustomDotAvg />} /></LineChart></ResponsiveContainer></div>
      <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 overflow-hidden"><div className="p-5 border-b bg-slate-50/50 flex justify-between font-black text-slate-700"><h3>歷史紀錄</h3><span>共 {data.entries.length} 筆</span></div><div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50">{[...data.entries].sort((a,b)=>b.date.localeCompare(a.date)).map((e:any)=>(
        <div key={e.id} className={`p-4 transition-all ${editingId === e.id ? 'bg-indigo-50/50 shadow-inner' : 'hover:bg-slate-50'}`}>
          {editingId === e.id ? (
            <div className="flex flex-col gap-3"><div className="flex items-center justify-between"><span className="text-xs font-black text-indigo-600">{e.date}</span><div className="flex gap-2"><button onClick={()=>{onUpdate({...data, entries:data.entries.map((x:any)=>x.id===e.id?{...x, weight:parseFloat(tempW), bodyFat:tempF?parseFloat(tempF):undefined, photo:tempP}:x)});setEditingId(null);}} className="bg-indigo-600 text-white p-2 rounded-lg shadow-sm"><Save size={16}/></button><button onClick={() => setEditingId(null)} className="bg-slate-200 text-slate-500 p-2 rounded-lg shadow-sm"><X size={16}/></button></div></div>
              <div className="flex gap-2"><div className="flex-1"><label className="text-[10px] text-slate-400 font-bold block ml-1">體重</label><input type="number" value={tempW} onChange={x=>setTempW(x.target.value)} className="w-full border-2 border-indigo-200 rounded-xl p-2 font-black outline-none" /></div><div className="flex-1"><label className="text-[10px] text-slate-400 font-bold block ml-1">體脂</label><input type="number" value={tempF} onChange={x=>setTempF(x.target.value)} className="w-full border-2 border-indigo-200 rounded-xl p-2 font-black outline-none" /></div><div className="flex-1 flex items-end gap-1">{tempP ? (<div className="relative w-10 h-10 rounded-lg overflow-hidden border"><img src={tempP} className="w-full h-full object-cover" /><button onClick={()=>setTempP(undefined)} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl shadow"><XCircle size={10}/></button></div>) : (<button onClick={async()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async(ev:any)=>setTempP(await compressImage(ev.target.files[0]));i.click();}} className="w-10 h-10 border-2 border-dashed border-indigo-200 rounded-lg flex items-center justify-center text-indigo-400 hover:bg-indigo-50"><Camera size={16}/></button>)}</div></div></div>
          ) : (<div className="flex items-center justify-between"><div className="flex items-center gap-4"><span className="text-xs font-bold text-slate-400 min-w-[70px]">{e.date.slice(5)}</span><span className="text-lg font-black text-slate-700 min-w-[70px]">{e.weight} kg</span>{e.bodyFat && <span className="text-sm font-bold text-slate-500">{e.bodyFat}%</span>}{e.photo && <ImageIcon size={14} className="text-[#1a9478]"/>}</div><div className="flex gap-1"><button onClick={() => { setEditingId(e.id); setTempW(e.weight.toString()); setTempF(e.bodyFat?.toString() || ''); setTempP(e.photo); }} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Edit2 size={16}/></button><button onClick={()=>onUpdate({...data, entries:data.entries.filter((x:any)=>x.id!==e.id)})} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button></div></div>)}
        </div>
      ))}</div></div>
    </div>
  );
};

// [分頁二] 體態分析視圖 (確保定義)
const BodyAnalysisView = ({ data }: any) => {
  const [startDate, setStartDate] = useState('2025-12-02');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const photoEntries = useMemo(() => data.entries.filter((e:any)=>e.date>=startDate && e.date<=endDate && e.photo).sort((a:any,b:any)=>a.date.localeCompare(b.date)), [data.entries, startDate, endDate]);
  const weightChange = useMemo(() => { const all = data.entries.filter((e:any)=>e.date>=startDate && e.date<=endDate).sort((a:any,b:any)=>a.date.localeCompare(b.date)); return all.length < 2 ? 0 : (all[all.length-1].weight - all[0].weight).toFixed(1); }, [data.entries, startDate, endDate]);
  return (
    <div className="space-y-6 pb-24">
      <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border"><CalendarIcon size={18} className="text-slate-400"/><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="bg-transparent font-bold text-sm outline-none"/><span className="text-slate-300">至</span><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="bg-transparent font-bold text-sm outline-none"/></div><div className="bg-slate-50 px-5 py-3 rounded-2xl border flex items-center gap-4"><span className="text-xs font-black text-slate-400 uppercase">變化</span><span className={`text-xl font-black ${Number(weightChange)<=0?'text-[#1a9478]':'text-red-500'}`}>{Number(weightChange)>0?'+':''}{weightChange} kg</span></div></div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{photoEntries.map((e:any)=>(<div key={e.id} className="relative aspect-[3/4] rounded-3xl overflow-hidden shadow-md group"><img src={e.photo} className="w-full h-full object-cover transition-transform group-hover:scale-110" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent flex flex-col justify-end p-4"><div className="text-[10px] text-white/70">{e.date}</div><div className="flex items-end justify-between text-white"><div className="flex items-baseline gap-1"><span className="text-2xl font-black">{e.weight}</span><span className="text-[10px]">kg</span></div>{e.bodyFat&&<div className="bg-white/20 px-2 py-1 rounded-lg text-[10px]">{e.bodyFat}%</div>}</div></div></div>))}</div>
    </div>
  );
};

const StrengthLogView = ({ data, onUpdate }: any) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isCopy, setIsCopy] = useState(false); const [isAddEx, setIsAddEx] = useState(false); const [isLib, setIsLib] = useState(false); const [isTimerOpen, setIsTimerOpen] = useState(false); const [isManagePlan, setIsManagePlan] = useState(false);
  const [muscle, setMuscle] = useState<any>('胸'); const [exId, setExId] = useState('');
  const [newEx, setNewEx] = useState({ name: '', muscle: '胸' });
  const todaysLogs = data.logs.filter((l:any)=>l.date===date);
  const todaysEx = useMemo(()=>Array.from(new Set(todaysLogs.map((l:any)=>l.exerciseId))).map(id=>data.exercises.find((e:any)=>e.id===id)).filter(Boolean), [todaysLogs, data.exercises]);
  useEffect(() => { if (todaysLogs.length > 0) { const lastEx = data.exercises.find((e:any)=>e.id===todaysLogs[todaysLogs.length-1].exerciseId); if(lastEx) { setMuscle(lastEx.muscle); setNewEx(prev=>({...prev, muscle: lastEx.muscle})); } } }, [todaysLogs.length]);
  const currentPlan = data.dailyPlans?.[date] || '';
  return (
    <div className="space-y-6 pb-20">
      <CopyWorkoutModal isOpen={isCopy} onClose={()=>setIsCopy(false)} data={data} onCopy={(sd:string)=>{const nl=data.logs.filter((l:any)=>l.date===sd).map((l:any)=>({...l, id:Math.random().toString(36).substr(2,9), date, isCompleted: false})); onUpdate({...data, dailyPlans:{...data.dailyPlans, [date]:data.dailyPlans[sd]}, logs:[...data.logs.filter((l:any)=>l.date!==date), ...nl]});}} />
      <ExerciseLibraryModal isOpen={isLib} onClose={()=>setIsLib(false)} data={data} onUpdate={onUpdate} /><RestTimerModal isOpen={isTimerOpen} onClose={()=>setIsTimerOpen(false)} /><PlanManageModal isOpen={isManagePlan} onClose={()=>setIsManagePlan(false)} data={data} onUpdate={onUpdate} />
      <div className="bg-white p-4 rounded-2xl border flex items-center justify-between shadow-sm"><div className="flex items-center gap-2"><CalendarIcon size={20} className="text-slate-400"/><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="font-bold outline-none text-slate-700"/></div>{currentPlan && <button onClick={()=>onUpdate({...data, dailyPlans:{...data.dailyPlans,[date]:''}})} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-bold uppercase">重選</button>}</div>
      {!currentPlan ? (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-dashed text-center space-y-6"><div className="flex justify-center items-center gap-2"><ClipboardList size={32} className="text-indigo-600"/><button onClick={()=>setIsManagePlan(true)} className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:rotate-12 transition-transform shadow-sm"><Edit2 size={16}/></button></div><h3 className="text-xl font-black text-slate-800 uppercase">今天練什麼？</h3><div className="flex flex-wrap justify-center gap-2">{(data.planTemplates||[]).map((t:any)=>(<button key={t} onClick={()=>onUpdate({...data, dailyPlans:{...data.dailyPlans,[date]:t}})} className="px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold hover:bg-indigo-600 hover:text-white transition-all">{t}</button>))}</div><button onClick={()=>setIsCopy(true)} className="w-full py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-black flex items-center justify-center gap-2 transition-transform active:scale-95"><History size={18}/> 從歷史複製</button></div>
      ) : (
        <div className="bg-slate-800 p-4 rounded-[2.5rem] shadow-xl text-white space-y-6 min-h-[400px]">
          <h3 className="font-black text-indigo-300 text-sm flex items-center gap-2 uppercase tracking-widest"><Activity size={16}/> {currentPlan}</h3>
          {todaysEx.map((ex:any)=>(
            <div key={ex.id} className="bg-slate-700/50 p-4 rounded-3xl border border-slate-600 shadow-sm">
              <div className="flex justify-between mb-4 font-black"><h4>{ex.name}</h4><span className="text-[10px] bg-slate-600 px-2 rounded text-slate-300">{ex.type}</span></div>
              {todaysLogs.filter((l:any)=>l.exerciseId===ex.id).map((log:any, i:number)=>(<TrainingRow key={log.id} log={log} index={i} onUpdate={(ul:any)=>onUpdate({...data, logs:data.logs.map((l:any)=>l.id===ul.id?ul:l)})} onDelete={()=>onUpdate({...data, logs:data.logs.filter((l:any)=>l.id!==log.id)})} onDuplicate={()=>onUpdate({...data, logs:[...data.logs, {...log, id:Math.random().toString(), isCompleted:false}]})} onComplete={()=>{const up=data.logs.map((l:any)=>l.id===log.id?{...l,isCompleted:!l.isCompleted}:l);onUpdate({...data,logs:up});if(up.find((l:any)=>l.id===log.id)?.isCompleted)setIsTimerOpen(true);}} />))}
              <button onClick={()=>onUpdate({...data, logs:[...data.logs, {id:Math.random().toString(), exerciseId:ex.id, date, weight:0, reps:8, originalWeight:0, originalUnit:'kg', isCompleted:false}]})} className="w-full mt-2 py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 text-xs font-black hover:bg-slate-700 transition-colors">+ 加一組</button>
            </div>
          ))}
          <div className="pt-6 border-t border-slate-700 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">{['胸','背','肩','腿','手','腹'].map(m=>(<button key={m} onClick={()=>{setMuscle(m); setNewEx(prev=>({...prev, muscle:m}))}} className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${muscle===m?'bg-indigo-500 text-white shadow-lg':'bg-slate-700 text-slate-400'}`}>{m}</button>))}</div>
            <div className="flex gap-2"><select value={exId} onChange={e=>{ if(e.target.value==='new'){setIsAddEx(true);} else setExId(e.target.value); }} className="flex-1 bg-slate-900 border border-slate-600 rounded-2xl p-3 text-sm text-white outline-none focus:border-indigo-500"><option value="">-- 選擇動作 ({muscle}) --</option>{data.exercises.filter((e:any)=>e.muscle===muscle && e.isTracked!==false).map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}<option value="new">+ 建立新動作</option></select><button onClick={()=>setIsLib(true)} className="bg-slate-700 text-slate-300 px-3 rounded-2xl active:bg-slate-600 transition-colors"><BookOpen size={20}/></button><button onClick={()=>{if(!exId)return; onUpdate({...data, logs:[...data.logs, {id:Math.random().toString(), exerciseId:exId, date, weight:0, reps:8, originalWeight:0, originalUnit:'kg', isCompleted:false}]}); setExId('');}} className="bg-indigo-600 text-white px-5 rounded-2xl active:scale-90 shadow-lg transition-transform"><Plus/></button></div>
            {isAddEx && (<div className="bg-slate-900 p-5 rounded-3xl border border-slate-600 space-y-4 shadow-2xl animate-in zoom-in-95"><div className="flex justify-between font-black text-indigo-300"><span>建立動作</span><button onClick={()=>setIsAddEx(false)}><X/></button></div><select value={newEx.muscle} onChange={e=>setNewEx({...newEx, muscle: e.target.value})} className="w-full bg-slate-800 border-none rounded-xl p-3 text-sm text-white outline-none">{['胸','背','肩','腿','手','腹'].map(m=><option key={m} value={m}>{m}</option>)}</select><input placeholder="名稱" value={newEx.name} onChange={e=>setNewEx({...newEx, name: e.target.value})} className="w-full bg-slate-800 border-none rounded-xl p-3 text-sm text-white outline-none" /><button onClick={()=>{if(!newEx.name)return; const ne:any={id:Date.now().toString(), name:newEx.name, muscle:newEx.muscle, type:'器械', isTracked:true, defaultUnit:'kg'}; onUpdate({...data, exercises:[...data.exercises, ne]}); setIsAddEx(false); setExId(ne.id);}} className="w-full bg-indigo-500 text-white py-3 rounded-2xl font-black shadow-lg">建立並選取</button></div>)}
          </div>
        </div>
      )}
    </div>
  );
};

const StrengthAnalysisView = ({ data, onManage }: any) => {
  const [muscle, setMuscle] = useState('all');
  const filteredData = useMemo(() => {
    return data.exercises.filter((ex:any) => { if (muscle!=='all' && ex.muscle!==muscle) return false; if (ex.isTracked===false) return false; return true; })
    .map((ex:any) => {
      const logs = data.logs.filter((l:any)=>l.exerciseId===ex.id);
      const dailyMax = logs.reduce((acc:any, l:any)=>{ const rm = calculate1RM(l.weight, l.reps); if(!acc[l.date] || rm>acc[l.date].rm) acc[l.date]={date:l.date, rm:parseFloat(rm.toFixed(1))}; return acc; }, {});
      const chartPoints = Object.values(dailyMax).sort((a:any,b:any)=>a.date.localeCompare(b.date));
      return { ...ex, chartPoints, pr: Math.max(...(chartPoints as any[]).map(c=>c.rm), 0) };
    }).filter((ex:any)=>ex.chartPoints.length>0);
  }, [data, muscle]);
  return (
    <div className="space-y-6 pb-24">
      <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-col gap-4"><h3 className="font-black text-slate-700 flex items-center gap-2"><ChartIcon size={18} className="text-teal-600"/> 訓練分析</h3><select value={muscle} onChange={e=>setMuscle(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-sm outline-none"><option value="all">所有部位</option>{['胸','背','肩','腿','手','腹'].map(m=><option key={m} value={m}>{m}</option>)}</select></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{filteredData.map((ex:any)=>(<div key={ex.id} className="bg-white p-5 rounded-[1.5rem] border shadow-sm relative group transition-all hover:shadow-lg"><div className="flex justify-between items-start mb-4"><div><h3 className="font-black text-lg text-slate-800">{ex.name}</h3><span className="text-[10px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded font-bold">{ex.type}</span></div><div className="text-right text-indigo-600 font-black">PR: {ex.pr}kg</div></div><button onClick={() => onManage(ex.id)} className="absolute top-4 right-1/2 translate-x-1/2 text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all shadow-sm">管理歷史</button><div className="h-32"><ResponsiveContainer width="100%" height="100%"><LineChart data={ex.chartPoints}><Tooltip/><Line type="monotone" dataKey="rm" stroke="#6366f1" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></div></div>))}</div>
    </div>
  );
};

// [分頁五] 登入畫面
const LoginView = () => {
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const handleGoogleLogin = async () => { setIsLoginLoading(true); try { await signInWithPopup(auth, provider); } catch (e) { alert("登入失敗，請確認你的 Firebase 已加入 Netlify 授權網域"); } setIsLoginLoading(false); };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm bg-white p-10 rounded-[3rem] shadow-2xl text-center border-b-8 border-indigo-500/10">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200"><Activity size={40}/></div>
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tighter uppercase">BodyGoal Pro</h1>
        <p className="text-slate-400 font-bold mb-10 text-sm">專屬私有數據同步版本</p>
        <button onClick={handleGoogleLogin} disabled={isLoginLoading} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform">{isLoginLoading ? <Loader2 className="animate-spin" /> : <Music size={20}/>} {isLoginLoading ? "登入中..." : "使用 Google 登入"}</button>
      </div>
    </div>
  );
};

// --- 6. App 主入口 ---
const BodyGoalPro = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(DEFAULT_DATA);
  const [activeTab, setActiveTab] = useState<'body' | 'log' | 'analysis' | 'strength_analysis'>('body');
  const [manageExId, setManageExId] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  useEffect(() => { const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); }); return () => unsub(); }, []);
  useEffect(() => { if (authLoading || !user) return; const unsub = onSnapshot(doc(db, 'users', user.uid, 'fitness_data', 'master'), snap => { if (snap.exists()) setUserData(snap.data()); else setUserData(DEFAULT_DATA); }); return () => unsub(); }, [authLoading, user]);
  const update = async (newData: any) => { if (!user) return; setUserData(newData); await setDoc(doc(db, 'users', user.uid, 'fitness_data', 'master'), JSON.parse(JSON.stringify(newData))); };
  if (authLoading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-400"><Loader2 className="animate-spin mr-2"/> SYNCING...</div>;
  if (!user) return <LoginView />;
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <DataTransferModal isOpen={isExportOpen} type="export" data={userData} onClose={()=>setIsExportOpen(false)} />
      <DataTransferModal isOpen={isImportOpen} type="import" onImport={update} onClose={()=>setIsImportOpen(false)} />
      <HistoryManagementModal isOpen={!!manageExId} targetId={manageExId} onClose={()=>setManageExId(null)} data={userData} onUpdate={update} />
      <header className="bg-white p-4 sticky top-0 z-50 shadow-sm border-b flex items-center justify-between"><div className="flex items-center gap-3"><div className="p-2 rounded-2xl bg-indigo-600 text-white shadow-lg"><Activity size={20}/></div><h1 className="text-lg font-black tracking-tighter uppercase">BODYGOAL PRO</h1></div><div className="flex gap-1"><button onClick={()=>setIsExportOpen(true)} className="p-2 text-indigo-600 hover:scale-110 transition-transform"><Upload size={18}/></button><button onClick={()=>setIsImportOpen(true)} className="p-2 text-emerald-600 hover:scale-110 transition-transform"><Cloud size={18}/></button><button onClick={()=>signOut(auth)} className="p-2 text-slate-400 hover:scale-110 transition-transform"><LogOut size={18}/></button></div></header>
      <main className="p-4">
        {activeTab === 'body' && <BodyMetricsView data={userData} onUpdate={update} />}
        {activeTab === 'log' && <StrengthLogView data={userData} onUpdate={update} />}
        {activeTab === 'analysis' && <BodyAnalysisView data={userData} />}
        {activeTab === 'strength_analysis' && <StrengthAnalysisView data={userData} onManage={setManageExId} />}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t pb-safe z-50 flex justify-around shadow-2xl">
        <button onClick={()=>setActiveTab('body')} className={`flex-1 py-4 flex flex-col items-center text-[10px] font-black ${activeTab==='body'?'text-teal-600 scale-110':'text-slate-400'}`}><Ruler size={22} strokeWidth={3}/><span className="mt-1">體態紀錄</span></button>
        <button onClick={()=>setActiveTab('analysis')} className={`flex-1 py-4 flex flex-col items-center text-[10px] font-black ${activeTab==='analysis'?'text-orange-500 scale-110':'text-slate-400'}`}><ImageIcon size={22} strokeWidth={3}/><span className="mt-1">體態分析</span></button>
        <button onClick={()=>setActiveTab('log')} className={`flex-1 py-4 flex flex-col items-center text-[10px] font-black ${activeTab==='log'?'text-indigo-600 scale-110':'text-slate-400'}`}><Dumbbell size={22} strokeWidth={3}/><span className="mt-1">訓練計畫</span></button>
        <button onClick={()=>setActiveTab('strength_analysis')} className={`flex-1 py-4 flex flex-col items-center text-[10px] font-black ${activeTab==='strength_analysis'?'text-violet-600 scale-110':'text-slate-400'}`}><ChartIcon size={22} strokeWidth={3}/><span className="mt-1">訓練分析</span></button>
      </nav>
    </div>
  );
};
export default BodyGoalPro;
