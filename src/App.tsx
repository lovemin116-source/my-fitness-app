import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { 
  Scale, Target, Plus, Trash2, Activity, Dumbbell, Ruler, Edit2, Copy, Check, X, 
  AlertCircle, Loader2, RefreshCw, Upload, Cloud, Camera, Image as ImageIcon, 
  Calendar as CalendarIcon, LineChart as ChartIcon, ClipboardList, PlusCircle, 
  History, ChevronLeft, ChevronRight, BookOpen, Eye, EyeOff, Search, ChevronDown, 
  Database 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- 1. Firebase 配置 ---
const firebaseConfig = {
  apiKey: "AIzaSyAKgPusc2ckogI6S2tkytNKZqpu-TiR8ig",
  authDomain: "roygym2-ce85c.firebaseapp.com",
  projectId: "roygym2-ce85c",
  storageBucket: "roygym2-ce85c.firebasestorage.app",
  messagingSenderId: "476108578502",
  appId: "1:476108578502:web:9d26dd1c1323b3e24081c7"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const FIXED_DOC = 'master_sheet';

// --- 2. 工具函式與初始資料 ---
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

const DEFAULT_DATA: any = { 
  goals: { targetWeight: 66, targetBodyFat: 14, targetDate: '2026-12-31' }, 
  entries: [], exercises: [], logs: [], dailyPlans: {}, planTemplates: [] 
};

// --- 3. 功能彈窗 ---

// (修正版) 針對單一動作的歷史數據管理彈窗 - 改為按鈕內確認
const HistoryManagementModal = ({ isOpen, onClose, data, onUpdate, targetId }: any) => {
  const [deleteId, setDeleteId] = useState<string | null>(null); // 新增：暫存要刪除的 ID

  // 關閉時重置
  useEffect(() => {
    if (!isOpen) setDeleteId(null);
  }, [isOpen]);

  if (!isOpen || !targetId) return null;
  
  const targetEx = data.exercises.find((e:any) => e.id === targetId);
  const logs = data.logs
    .filter((l:any) => l.exerciseId === targetId)
    .sort((a:any, b:any) => b.date.localeCompare(a.date));

  const handleDelete = (e: React.MouseEvent, logId: string) => {
    e.stopPropagation();
    if (deleteId === logId) {
      // 第二次點擊，確認刪除
      const updatedLogs = data.logs.filter((l:any) => l.id !== logId);
      onUpdate({...data, logs: updatedLogs});
      setDeleteId(null);
    } else {
      // 第一次點擊，進入確認狀態
      setDeleteId(logId);
      // 3秒後自動取消確認狀態
      setTimeout(() => setDeleteId(prev => prev === logId ? null : prev), 3000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-md" onClick={onClose}>
      <div className="bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[70vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-lg flex items-center gap-2 text-slate-800">
            <Database className="text-indigo-600" size={20}/> 
            {targetEx?.name} 歷史數據
          </h3>
          <button onClick={onClose} type="button" className="p-2 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 transition-colors"><X size={20}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {logs.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center justify-center opacity-50">
              <ClipboardList size={40} className="mb-2"/>
              <p className="font-bold">目前沒有任何紀錄</p>
            </div>
          ) : (
            logs.map((log:any) => (
              <div key={log.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-black text-slate-500 shadow-sm">{log.date}</div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1">
                        <span className="font-black text-slate-800 text-lg">{log.originalWeight}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">{log.originalUnit}</span>
                    </div>
                    <span className="text-[10px] text-indigo-500 font-bold bg-indigo-50 px-1.5 rounded-md w-fit">{log.reps} reps</span>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={(e) => handleDelete(e, log.id)} 
                  className={`p-2.5 rounded-xl transition-all shadow-sm active:scale-90 flex items-center gap-1 ${
                    deleteId === log.id 
                    ? 'bg-red-500 text-white hover:bg-red-600 w-24 justify-center' 
                    : 'text-slate-300 bg-white border border-slate-100 hover:text-red-500 hover:bg-red-50 hover:border-red-100'
                  }`}
                >
                  {deleteId === log.id ? <><Trash2 size={16}/> 確認?</> : <Trash2 size={16}/>}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const ExerciseLibraryModal = ({ isOpen, onClose, data, onUpdate }: any) => {
  const [filterMuscle, setFilterMuscle] = useState<string>('胸');
  if (!isOpen) return null;
  const toggleStatus = (id: string, current: boolean) => {
    onUpdate({ ...data, exercises: data.exercises.map((e: any) => e.id === id ? { ...e, isTracked: !current } : e) });
  };
  const updateEx = (id: string, field: string, val: string) => {
    onUpdate({ ...data, exercises: data.exercises.map((e: any) => e.id === id ? { ...e, [field]: val } : e) });
  };
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl flex items-center gap-2 text-slate-800"><BookOpen className="text-indigo-600"/> 動作資料庫</h3><button onClick={onClose} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button></div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">{['胸', '背', '肩', '腿'].map(m => (<button key={m} onClick={() => setFilterMuscle(m)} className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap ${filterMuscle === m ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>{m}</button>))}</div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {data.exercises.filter((e: any) => e.muscle === filterMuscle).map((ex: any) => (
            <div key={ex.id} className={`p-4 rounded-2xl border ${ex.isTracked !== false ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
              <div className="flex items-center gap-2 mb-2"><input type="text" value={ex.name} onChange={e => updateEx(ex.id, 'name', e.target.value)} className="flex-1 font-black text-slate-700 bg-transparent outline-none border-b border-transparent focus:border-indigo-300" /><button onClick={() => toggleStatus(ex.id, ex.isTracked !== false)} className={`p-2 rounded-lg ${ex.isTracked !== false ? 'text-teal-500 bg-teal-50' : 'text-slate-400 bg-slate-200'}`}>{ex.isTracked !== false ? <Eye size={16} /> : <EyeOff size={16} />}</button></div>
              <div className="flex gap-2"><select value={ex.type} onChange={e => updateEx(ex.id, 'type', e.target.value)} className="bg-slate-100 text-[10px] p-2 rounded-lg outline-none font-bold text-slate-500">{['啞鈴', '槓鈴', 'W槓', '繩索', '器械', '自體重'].map(t => <option key={t} value={t}>{t}</option>)}</select><select value={ex.defaultUnit || 'kg'} onChange={e => updateEx(ex.id, 'defaultUnit', e.target.value)} className="bg-slate-100 text-[10px] p-2 rounded-lg outline-none font-bold text-slate-500"><option value="kg">預設: KG</option><option value="lbs">預設: LBS</option></select></div>
            </div>
          ))}
          {data.exercises.filter((e: any) => e.muscle === filterMuscle).length === 0 && <div className="text-center py-10 text-slate-300 font-bold">此部位尚無動作</div>}
        </div>
      </div>
    </div>
  );
};

const DataTransferModal = ({ isOpen, type, data, onImport, onClose }: any) => {
  const [json, setJson] = useState('');
  useEffect(() => { if (isOpen && type === 'export') setJson(JSON.stringify(data, null, 2)); }, [isOpen, type, data]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col max-h-[80vh]">
        <div className="flex justify-between mb-4 font-bold"><h3>數據管理</h3><button onClick={onClose}><X/></button></div>
        <textarea className="flex-1 border rounded p-2 font-mono text-[10px] mb-4 outline-none" value={json} onChange={e=>setJson(e.target.value)} readOnly={type==='export'} />
        <button onClick={()=>{ if(type==='export') {navigator.clipboard.writeText(json); alert('已複製');} else {onImport(JSON.parse(json)); onClose();}}} className="bg-indigo-600 text-white py-2 rounded-lg font-bold">執行</button>
      </div>
    </div>
  );
};

const CopyWorkoutModal = ({ isOpen, onClose, data, onCopy }: any) => {
  const [viewDate, setViewDate] = useState(new Date());
  useEffect(() => { if (isOpen) setViewDate(new Date()); }, [isOpen]);
  if (!isOpen) return null;
  const year = viewDate.getFullYear(); const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const today = new Date();
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white rounded-[2.5rem] w-full max-w-md p-6 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex justify-between mb-6"><h3 className="font-black text-xl flex items-center gap-2"><History className="text-indigo-600"/> 複製歷史課表</h3><button onClick={onClose} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button></div>
        <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-2xl">
          <button onClick={()=>setViewDate(new Date(year, month-1, 1))} className="p-2 hover:bg-white rounded-xl"><ChevronLeft/></button>
          <span className="font-black text-slate-700">{year}年 {month + 1}月</span>
          <button onClick={()=>setViewDate(new Date(year, month+1, 1))} className="p-2 hover:bg-white rounded-xl"><ChevronRight/></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-2">{['日','一','二','三','四','五','六'].map(d=><div key={d} className="text-[10px] font-black text-slate-300">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-2 text-center mb-4">
          {blanks.map(b=><div key={`b-${b}`} className="aspect-square"/>)}
          {calendarDays.map(day => {
            const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const plan = data.dailyPlans?.[dStr];
            const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===day;
            return (
              <button key={day} disabled={!plan} onClick={()=>{onCopy(dStr); onClose();}} className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all border-2 ${plan ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg active:scale-90 z-10' : 'bg-white border-slate-50 text-slate-300'} ${isToday&&!plan?'border-indigo-200 text-indigo-600':''}`}>
                <span className="text-xs font-black">{day}</span>
                {plan && <span className="text-[6px] absolute bottom-1 px-1 truncate w-full font-bold text-indigo-100">{plan.slice(0,4)}</span>}
                {isToday && <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"/>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TrainingRow = ({ log, index, onUpdate, onDelete, onDuplicate, onInsertAfter }: any) => {
  const [w, setW] = useState(log.originalWeight.toString());
  const [r, setR] = useState(log.reps.toString());
  // 增加刪除確認狀態
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { setW(log.originalWeight.toString()); setR(log.reps.toString()); }, [log]);
  const save = (nu?: string) => {
    const weight = parseFloat(w) || 0; const reps = parseInt(r) || 0; const unit = nu || log.originalUnit;
    onUpdate({ ...log, originalWeight: weight, reps, originalUnit: unit, weight: unit === 'kg' ? weight : lbsToKg(weight) });
  };
  
  const handleDeleteClick = () => {
    if (isDeleting) {
      onDelete();
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  return (
    <div className="group space-y-1">
      <div className="flex items-center gap-2 bg-slate-700/40 p-2 rounded-lg">
        <span className="text-slate-500 font-mono text-[10px] w-4">{index+1}</span>
        <input type="number" value={w} onChange={e=>setW(e.target.value)} onBlur={()=>save()} className="w-full bg-slate-900 border-none rounded p-1 text-center text-white text-sm outline-none" />
        <button onClick={()=>{const nu=log.originalUnit==='kg'?'lbs':'kg'; save(nu);}} className="text-[10px] bg-slate-800 px-2 py-1 rounded border border-slate-600 text-slate-400 font-bold">{log.originalUnit.toUpperCase()}</button>
        <input type="number" value={r} onChange={e=>setR(e.target.value)} onBlur={()=>save()} className="w-full bg-slate-900 border-none rounded p-1 text-center text-white text-sm outline-none" />
        <div className="flex gap-1">
          <button onClick={onDuplicate}><Copy size={14} className="text-slate-400 hover:text-white"/></button>
          <button onClick={handleDeleteClick} className={`${isDeleting ? 'text-red-500 animate-pulse' : 'text-slate-400 hover:text-red-500'}`}>
            <Trash2 size={14}/>
          </button>
        </div>
      </div>
      <div className="h-0 group-hover:h-6 opacity-0 group-hover:opacity-100 transition-all flex justify-center overflow-hidden"><button onClick={onInsertAfter} className="text-[9px] bg-indigo-900 text-indigo-200 px-3 rounded-full">+ 插入</button></div>
    </div>
  );
};
const BodyMetricsView = ({ data, onUpdate }: any) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const chartData = useMemo(() => {
    const sorted = [...data.entries].sort((a,b)=>a.date.localeCompare(b.date));
    return sorted.map((e, i, arr) => {
      const avg = arr.slice(Math.max(0, i-6), i+1).reduce((s, x)=>s+x.weight, 0) / Math.min(i+1, 7);
      return { ...e, avgWeight: parseFloat(avg.toFixed(2)) };
    });
  }, [data.entries]);
  const latest = chartData[chartData.length - 1] || { weight: 0, avgWeight: 0 };
  const targetW = Number(data.goals?.targetWeight) || 0;
  const daysLeft = Math.max(0, Math.ceil((new Date(data.goals?.targetDate || '2026-12-31').getTime() - new Date().getTime()) / 86400000));

  return (
    <div className="space-y-6 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-[1.5rem] shadow-sm md:col-span-2 border border-slate-100">
          <div className="flex justify-between mb-6 font-bold text-slate-700"><h3><Target className="inline mr-2" size={18}/> 我的目標</h3><button className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded-full">修改</button></div>
          <div className="space-y-4">
            <div className="flex justify-between border-b pb-2"><span>目標體重</span><span className="font-black">{targetW} kg</span></div>
            <div className="flex justify-between border-b pb-2"><span>目標體脂</span><span className="font-black">{data.goals?.targetBodyFat || '--'} %</span></div>
            <div className="flex justify-between pt-2"><span>剩餘天數</span><span className="font-black text-orange-500">{daysLeft} 天</span></div>
          </div>
        </div>
        <div className="bg-[#1a9478] p-8 rounded-[1.5rem] shadow-lg md:col-span-3 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-4 left-4 opacity-20"><Scale size={24}/></div>
          <div><h3 className="text-sm font-bold opacity-80 mb-4">當前狀態</h3><div className="flex items-baseline gap-2"><span className="text-6xl font-black">{latest.weight || '--'}</span><span className="text-xl font-bold">kg</span></div><div className="text-sm mt-2 opacity-90 font-bold">距離目標: {(latest.weight - targetW).toFixed(1)} kg</div></div>
          <div className="self-end text-right"><div className="text-xs opacity-70 font-bold mb-1">7日平均</div><div className="text-3xl font-black">{latest.avgWeight || '--'} kg</div></div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100">
        <h2 className="font-black mb-6 flex items-center gap-2"><PlusCircle className="text-teal-600"/> 新增紀錄</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="flex-1 border p-2.5 rounded-xl font-bold outline-none" />
          <input type="number" placeholder="體重" value={weight} onChange={e=>setWeight(e.target.value)} className="flex-1 border p-2.5 rounded-xl font-bold outline-none" />
          <input type="number" placeholder="體脂" value={bodyFat} onChange={e=>setBodyFat(e.target.value)} className="flex-1 border p-2.5 rounded-xl font-bold outline-none" />
          <button onClick={async()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async(e:any)=>setPhoto(await compressImage(e.target.files[0]));i.click();}} className={`p-2.5 border-2 border-dashed rounded-xl flex items-center gap-2 px-4 ${photo?'bg-teal-50 text-teal-600 border-teal-200':'text-slate-400'}`}><Camera size={18}/></button>
          <button onClick={()=>{if(!weight)return; onUpdate({...data, entries:[...data.entries.filter((e:any)=>e.date!==date), {id:Date.now().toString(),date,weight:parseFloat(weight),bodyFat:bodyFat?parseFloat(bodyFat):undefined,photo}]}); setWeight(''); setBodyFat(''); setPhoto(undefined);}} className="bg-[#1a9478] text-white px-8 py-2.5 rounded-xl font-black">儲存</button>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 h-[250px] shadow-sm relative">
        <div className="absolute top-4 left-6 z-10"><p className="text-sm font-black text-slate-700">體重趨勢圖</p></div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{top:50,right:10,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/><XAxis dataKey="date" tickFormatter={s=>s.slice(5)} fontSize={10}/><YAxis domain={['auto','auto']} fontSize={10}/><Tooltip/>
            <ReferenceLine y={targetW} stroke="#ef4444" strokeWidth={2} label={{value:'目標', position:'insideTopRight', fill:'#ef4444', fontSize:10}}/>
            <Line type="monotone" name="體重" dataKey="weight" stroke="#1a9478" strokeWidth={3} dot={{r:4, fill:'#1a9478', stroke:'#fff'}}/>
            <Line type="monotone" name="7日平均" dataKey="avgWeight" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b bg-slate-50/50 flex justify-between font-black text-slate-700"><h3>歷史紀錄</h3><span>共 {data.entries.length} 筆</span></div>
        <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-50">
          {[...data.entries].sort((a,b)=>b.date.localeCompare(a.date)).map((e:any)=>(
            <div key={e.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-6"><span className="text-sm font-bold text-slate-400 min-w-[80px]">{e.date}</span><span className="text-lg font-black text-slate-700 min-w-[70px]">{e.weight} kg</span>{e.bodyFat&&<span className="text-sm font-bold text-slate-400">{e.bodyFat}%</span>}{e.photo&&<ImageIcon size={14} className="text-teal-500"/>}</div>
              <div className="flex gap-2"><button onClick={()=>onUpdate({...data, entries:data.entries.filter((x:any)=>x.id!==e.id)})}><Trash2 size={16} className="text-slate-300 hover:text-red-500"/></button></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BodyAnalysisView = ({ data }: any) => {
  const [startDate, setStartDate] = useState('2025-12-02');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const photoEntries = useMemo(() => data.entries.filter((e:any)=>e.date>=startDate && e.date<=endDate && e.photo).sort((a:any,b:any)=>a.date.localeCompare(b.date)), [data.entries, startDate, endDate]);
  const weightChange = useMemo(() => {
    const all = data.entries.filter((e:any)=>e.date>=startDate && e.date<=endDate).sort((a:any,b:any)=>a.date.localeCompare(b.date));
    return all.length < 2 ? 0 : (all[all.length-1].weight - all[0].weight).toFixed(1);
  }, [data.entries, startDate, endDate]);
  return (
    <div className="space-y-6 pb-24">
      <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border"><CalendarIcon size={18} className="text-slate-400"/><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="bg-transparent font-bold text-sm outline-none"/><span className="text-slate-300">至</span><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="bg-transparent font-bold text-sm outline-none"/></div>
        <div className="bg-slate-50 px-5 py-3 rounded-2xl border flex items-center gap-4"><span className="text-xs font-black text-slate-400">區間變化</span><span className={`text-xl font-black ${Number(weightChange)<=0?'text-[#1a9478]':'text-red-500'}`}>{Number(weightChange)>0?'+':''}{weightChange} kg</span></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {photoEntries.map((e:any)=>(
          <div key={e.id} className="relative aspect-[3/4] rounded-3xl overflow-hidden shadow-md group"><img src={e.photo} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent flex flex-col justify-end p-4"><div className="text-[10px] text-white/70">{e.date}</div><div className="flex items-end justify-between text-white"><div className="flex items-baseline gap-1"><span className="text-2xl font-black">{e.weight}</span><span className="text-[10px]">kg</span></div>{e.bodyFat&&<div className="bg-white/20 px-2 py-1 rounded-lg text-[10px]">{e.bodyFat}%</div>}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StrengthLogView = ({ data, onUpdate }: any) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isCopy, setIsCopy] = useState(false); const [isAddEx, setIsAddEx] = useState(false); const [isLib, setIsLib] = useState(false);
  const [muscle, setMuscle] = useState<any>('胸'); const [exId, setExId] = useState('');
  const [newEx, setNewEx] = useState({ name: '', tool: '槓鈴', unit: 'kg' });
  const currentPlan = data.dailyPlans?.[date] || '';
  const todaysLogs = data.logs.filter((l:any)=>l.date===date);
  const todaysEx = useMemo(()=>Array.from(new Set(todaysLogs.map((l:any)=>l.exerciseId))).map(id=>data.exercises.find((e:any)=>e.id===id)).filter(Boolean), [todaysLogs, data.exercises]);
  const addLog = (eid:string, afterId?:string) => {
    const ex = data.exercises.find((e:any)=>e.id===eid); const last = data.logs.filter((l:any)=>l.exerciseId===eid).slice(-1)[0];
    const nLog:any = { id:Math.random().toString(36).substr(2,9), exerciseId:eid, date, weight:last?last.weight:0, reps:last?last.reps:8, originalWeight:last?last.originalWeight:0, originalUnit:last?last.originalUnit:(ex?.defaultUnit||'kg') };
    if (afterId) { const idx=data.logs.findIndex((l:any)=>l.id===afterId); const nl=[...data.logs]; nl.splice(idx+1,0,nLog); onUpdate({...data, logs:nl}); } else onUpdate({...data, logs:[...data.logs, nLog]});
  };
  return (
    <div className="space-y-6 pb-20">
      <CopyWorkoutModal isOpen={isCopy} onClose={()=>setIsCopy(false)} data={data} onCopy={(sd:string)=>{const sp=data.dailyPlans[sd]; const nl=data.logs.filter((l:any)=>l.date===sd).map((l:any)=>({...l, id:Math.random().toString(36).substr(2,9), date})); onUpdate({...data, dailyPlans:{...data.dailyPlans, [date]:sp}, logs:[...data.logs.filter((l:any)=>l.date!==date), ...nl]});}} />
      <ExerciseLibraryModal isOpen={isLib} onClose={()=>setIsLib(false)} data={data} onUpdate={onUpdate} />
      <div className="bg-white p-4 rounded-2xl border flex items-center justify-between shadow-sm"><div className="flex items-center gap-2"><CalendarIcon size={20} className="text-slate-400"/><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="font-bold outline-none text-slate-700"/></div>{currentPlan&&<button onClick={()=>onUpdate({...data, dailyPlans:{...data.dailyPlans,[date]:''}})} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-bold">重選</button>}</div>
      {!currentPlan ? (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-dashed text-center space-y-6">
          <ClipboardList size={32} className="mx-auto text-indigo-600"/><h3 className="text-xl font-black">今天打算練什麼？</h3>
          <div className="flex flex-wrap justify-center gap-2">{(data.planTemplates||[]).map((t:any)=>(<button key={t} onClick={()=>onUpdate({...data, dailyPlans:{...data.dailyPlans,[date]:t}})} className="px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold hover:bg-indigo-600 hover:text-white transition-all">{t}</button>))}</div>
          <div className="pt-4 border-t space-y-3"><button onClick={()=>setIsCopy(true)} className="w-full py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-black flex items-center justify-center gap-2"><History size={18}/> 從行事曆複製課表</button>
          <div className="flex gap-2"><input type="text" id="cp-input" placeholder="自定義新計畫..." className="flex-1 border rounded-xl p-3 text-sm outline-none bg-slate-50" /><button onClick={()=>{const v=(document.getElementById('cp-input') as any).value; if(v) onUpdate({...data, dailyPlans:{...data.dailyPlans,[date]:v}, planTemplates:Array.from(new Set([...(data.planTemplates||[]), v]))});}} className="bg-slate-800 text-white p-3 rounded-xl"><Check/></button></div></div>
        </div>
      ) : (
        <div className="bg-slate-800 p-4 rounded-[2.5rem] shadow-xl text-white space-y-6 min-h-[400px]">
          <h3 className="font-black text-indigo-300 text-sm uppercase flex items-center gap-2"><Activity size={16}/> {currentPlan}</h3>
          {todaysEx.map((ex:any)=>(
            <div key={ex.id} className="bg-slate-700/50 p-4 rounded-3xl border border-slate-600">
              <div className="flex justify-between mb-4 font-black"><h4>{ex.name}</h4><span className="text-[10px] bg-slate-600 px-2 rounded text-slate-300">{ex.type}</span></div>
              {todaysLogs.filter((l:any)=>l.exerciseId===ex.id).map((log:any, i:number)=>(<TrainingRow key={log.id} log={log} index={i} onUpdate={(ul:any)=>onUpdate({...data, logs:data.logs.map((l:any)=>l.id===ul.id?ul:l)})} onDelete={()=>onUpdate({...data, logs:data.logs.filter((l:any)=>l.id!==log.id)})} onDuplicate={()=>onUpdate({...data, logs:[...data.logs, {...log, id:Math.random().toString()}]})} onInsertAfter={()=>addLog(ex.id, log.id)} />))}
              <button onClick={()=>addLog(ex.id)} className="w-full mt-2 py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 text-xs font-black">+ 加一組</button>
            </div>
          ))}
          <div className="pt-6 border-t border-slate-700 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">{['胸','背','肩','腿'].map((m:any)=>(<button key={m} onClick={()=>setMuscle(m)} className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${muscle===m?'bg-indigo-500 text-white shadow-lg':'bg-slate-700 text-slate-400'}`}>{m}</button>))}</div>
            <div className="flex gap-2">
              <select value={exId} onChange={e=>e.target.value==='new'?setIsAddEx(true):setExId(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-2xl p-3 text-sm text-white outline-none">
                <option value="">-- 選擇動作 --</option>{data.exercises.filter((e:any)=>e.muscle===muscle && e.isTracked!==false).map((e:any)=><option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}<option value="new">+ 建立新動作</option>
              </select>
              <button onClick={()=>setIsLib(true)} className="bg-slate-700 text-slate-300 px-3 rounded-2xl"><BookOpen size={20}/></button>
              <button onClick={()=>{if(!exId)return; addLog(exId); setExId('');}} className="bg-indigo-600 text-white px-5 rounded-2xl active:scale-90"><Plus/></button>
            </div>
            {isAddEx && (
              <div className="bg-slate-900 p-5 rounded-3xl border border-slate-600 space-y-4 shadow-2xl">
                <div className="flex justify-between font-black text-indigo-300"><span>建立動作</span><button onClick={()=>setIsAddEx(false)}><X/></button></div>
                <input placeholder="名稱" value={newEx.name} onChange={e=>setNewEx({...newEx, name: e.target.value})} className="w-full bg-slate-800 border-none rounded-xl p-3 text-sm text-white outline-none" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={newEx.tool} onChange={e=>setNewEx({...newEx, tool: e.target.value})} className="bg-slate-800 text-xs text-white p-2 rounded-lg">{['啞鈴','槓鈴','W槓','繩索','器械','自體重'].map(t=><option key={t} value={t}>{t}</option>)}</select>
                  <select value={newEx.unit} onChange={e=>setNewEx({...newEx, unit: e.target.value as any})} className="bg-slate-800 text-xs text-white p-2 rounded-lg"><option value="kg">KG</option><option value="lbs">LBS</option></select>
                </div>
                <button onClick={()=>{if(!newEx.name)return; const ne:any={id:Date.now().toString(), name:newEx.name, muscle, type:newEx.tool, isTracked:true, defaultUnit:newEx.unit}; onUpdate({...data, exercises:[...data.exercises, ne]}); setIsAddEx(false); setExId(ne.id);}} className="w-full bg-indigo-500 text-white py-3 rounded-2xl font-black">建立並選取</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StrengthAnalysisView = ({ data, onManage }: any) => {
  const [filterPlan, setFilterPlan] = useState('all'); const [filterMuscle, setFilterMuscle] = useState('all');
  const [filterType, setFilterType] = useState('all'); const [searchTerm, setSearchTerm] = useState('');
  const options = useMemo(() => ({ plans: Array.from(new Set(Object.values(data.dailyPlans||{}).filter(Boolean))), muscles:['胸','背','肩','腿','手','腹'], types:['槓鈴','啞鈴','W槓','繩索','器械','自體重'] }), [data]);
  const filteredData = useMemo(() => {
    return data.exercises.filter((ex:any) => {
      if (filterMuscle!=='all' && ex.muscle!==filterMuscle) return false;
      if (filterType!=='all' && ex.type!==filterType) return false;
      if (searchTerm && !ex.name.includes(searchTerm)) return false;
      if (ex.isTracked===false) return false;
      if (filterPlan!=='all' && !data.logs.some((l:any)=>l.exerciseId===ex.id && data.dailyPlans[l.date]===filterPlan)) return false;
      return true;
    }).map((ex:any) => {
      const logs = data.logs.filter((l:any)=>l.exerciseId===ex.id);
      const dailyMaxMap = logs.reduce((acc:any, l:any)=>{
        if (filterPlan!=='all' && data.dailyPlans[l.date]!==filterPlan) return acc;
        const rm = calculate1RM(l.weight, l.reps);
        if(!acc[l.date] || rm>acc[l.date].rm) acc[l.date] = { date:l.date, rm:parseFloat(rm.toFixed(1)) };
        return acc;
      }, {});
      const chartPoints = Object.values(dailyMaxMap).sort((a:any,b:any)=>a.date.localeCompare(b.date));
      return { ...ex, chartPoints, pr: Math.max(...(chartPoints as any[]).map(c=>c.rm), 0) };
    }).filter((ex:any)=>ex.chartPoints.length>0);
  }, [data, filterPlan, filterMuscle, filterType, searchTerm]);

  return (
    <div className="space-y-6 pb-24">
      <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between"><h3 className="font-black text-slate-700 flex items-center gap-2"><ChartIcon size={18} className="text-teal-600"/> 訓練表現分析</h3>{(filterPlan!=='all'||filterMuscle!=='all'||filterType!=='all'||searchTerm)&&(<button onClick={()=>{setFilterPlan('all');setFilterMuscle('all');setFilterType('all');setSearchTerm('')}} className="text-xs font-bold text-red-400 bg-red-50 px-3 py-1.5 rounded-full">清除篩選</button>)}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="relative"><select value={filterPlan} onChange={e=>setFilterPlan(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl p-3 outline-none appearance-none"><option value="all">所有訓練計畫</option>{options.plans.map((p:any)=><option key={p} value={p}>{p}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none"/></div>
          <div className="relative"><select value={filterMuscle} onChange={e=>setFilterMuscle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl p-3 outline-none appearance-none"><option value="all">所有部位</option>{options.muscles.map(m=><option key={m} value={m}>{m}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none"/></div>
          <div className="relative"><select value={filterType} onChange={e=>setFilterType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl p-3 outline-none appearance-none"><option value="all">所有器材</option>{options.types.map(t=><option key={t} value={t}>{t}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none"/></div>
          <div className="relative"><input type="text" placeholder="搜尋動作..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="w-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl p-3 outline-none pl-8"/><Search size={14} className="absolute left-3 top-3.5 text-slate-400"/></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredData.map((ex:any)=>(
          <div key={ex.id} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative group">
            <div className="flex justify-between items-start mb-4"><div><h3 className="font-black text-slate-800 text-lg">{ex.name}</h3><div className="flex gap-2 mt-1"><span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-bold">{ex.muscle}</span><span className="text-[10px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-md font-bold">{ex.type}</span></div></div><div className="text-right"><div className="text-[10px] text-slate-400 font-bold uppercase">歷史 PR</div><div className="text-2xl font-black text-indigo-600">{ex.pr} <span className="text-sm text-slate-400">kg</span></div></div></div>
            <button onClick={() => onManage(ex.id)} className="absolute top-5 right-1/2 translate-x-1/2 bg-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-full text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all shadow-sm"><Edit2 size={12} className="inline mr-1"/> 管理數據</button>
            <div className="h-40 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={ex.chartPoints}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/><XAxis dataKey="date" tickFormatter={s=>s.slice(5)} fontSize={10}/><Tooltip labelFormatter={(l)=>'日期: '+l} formatter={(v)=>[v+' kg', '當日最高 1RM']} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)', fontSize:'12px', fontWeight:'bold'}}/><Line type="monotone" dataKey="rm" stroke="#6366f1" strokeWidth={3} dot={{r:3, fill:'#6366f1', strokeWidth:0}} activeDot={{r:5}}/></LineChart></ResponsiveContainer></div><p className="text-[10px] text-center text-slate-300 font-bold mt-2">1RM 估算趨勢 (當日最高表現)</p>
          </div>
        ))}
      </div>
      {filteredData.length===0 && <div className="text-center py-20"><div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300"><ChartIcon size={32}/></div><p className="text-slate-400 font-bold">沒有符合篩選條件的數據</p></div>}
    </div>
  );
};

// --- 請替換最底部的 BodyGoalPro 主程式 ---

const BodyGoalPro = () => {
  const [loading, setLoading] = useState(true); const [user, setUser] = useState<any>(null);
  
  // 🔽 修改這裡：將預設值 'log' 改為 'body'
  const [activeTab, setActiveTab] = useState<'body' | 'log' | 'analysis' | 'strength_analysis'>('body');
  
  const [userData, setUserData] = useState<any>(DEFAULT_DATA);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false); const [isImportOpen, setIsImportOpen] = useState(false);
  const [manageExId, setManageExId] = useState<string | null>(null);

  useEffect(() => { signInAnonymously(auth).then(() => onAuthStateChanged(auth, (u) => { if(u) setUser(u); setLoading(false); })); }, []);
  useEffect(() => {
    if (loading || !user) return; setIsDataLoading(true);
    const unsub = onSnapshot(doc(db, 'my_data', FIXED_DOC), (snap) => {
      setIsDataLoading(false); if (snap.exists()) {
        const d = snap.data(); setUserData({ goals: d.goals || DEFAULT_DATA.goals, entries: d.entries || [], exercises: d.exercises || [], logs: d.logs || [], dailyPlans: d.dailyPlans || {}, planTemplates: d.planTemplates || [] });
      } else { setUserData(DEFAULT_DATA); }
    }); return () => unsub();
  }, [loading, user]);

  const update = async (newData: any) => { setUserData(newData); try { await setDoc(doc(db, 'my_data', FIXED_DOC), JSON.parse(JSON.stringify(newData))); } catch(e) { console.error(e); } };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 font-black"><Loader2 className="animate-spin mr-2"/> SYNCING...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <DataTransferModal isOpen={isExportOpen} type="export" data={userData} onClose={()=>setIsExportOpen(false)} />
      <DataTransferModal isOpen={isImportOpen} type="import" onImport={update} onClose={()=>setIsImportOpen(false)} />
      <HistoryManagementModal isOpen={!!manageExId} targetId={manageExId} onClose={()=>setManageExId(null)} data={userData} onUpdate={update} />
      
      <header className="bg-white p-4 sticky top-0 z-50 shadow-sm border-b flex items-center justify-between">
        <div className="flex items-center gap-3"><div className={`p-2 rounded-2xl bg-indigo-600 text-white shadow-lg`}><Activity size={20}/></div>
          <div><h1 className="text-lg font-black tracking-tighter text-slate-800 uppercase">BODYGOAL PRO</h1><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Fitness Cloud</p></div></div>
        <div className="flex gap-1"><button onClick={()=>setIsExportOpen(true)} className="p-2 text-indigo-600"><Upload size={18}/></button><button onClick={()=>setIsImportOpen(true)} className="p-2 text-emerald-600"><Cloud size={18}/></button><button onClick={()=>{if(confirm("重設？")) update(DEFAULT_DATA);}} className="p-2 text-red-400"><RefreshCw size={18}/></button></div>
      </header>

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
